package engine

import (
	"encoding/json"
	"log/slog"
	"math"
	"strconv"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

// dcaSellReentryHoldEnabled is a temporary hardcoded feature toggle.
// Set to false to restore the previous behavior: after a confirmed sell the
// DCA cycle state is cleared and the next evaluation may buy immediately.
const dcaSellReentryHoldEnabled = true

type DCAEngine struct {
	mu            sync.Mutex
	lastBuy       map[int64]time.Time
	lastBuyPrice  map[int64]float64 // price at last executed buy, for DropPct check
	lastSellPrice map[int64]float64 // confirmed sell price used to guard the next cycle entry
	avgBuyPrice   map[int64]float64
	client        *tokocrypto.Client
	db            *sqlx.DB
}

func NewDCAEngine(client *tokocrypto.Client, db *sqlx.DB) *DCAEngine {
	return &DCAEngine{
		lastBuy:       make(map[int64]time.Time),
		lastBuyPrice:  make(map[int64]float64),
		lastSellPrice: make(map[int64]float64),
		avgBuyPrice:   make(map[int64]float64),
		client:        client,
		db:            db,
	}
}

func (d *DCAEngine) Evaluate(session model.Session, configStr string) []Signal {
	var cfg DCAConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		slog.Error("parse dca config", "session", session.ID, "error", err)
		return nil
	}

	// fetch ticker outside the lock — network call must not block other sessions
	ticker, err := d.client.GetTicker(session.Symbol)
	if err != nil {
		slog.Error("dca ticker", "session", session.ID, "error", err)
		return nil
	}
	currentPrice, _ := strconv.ParseFloat(ticker.LastPrice, 64)
	if currentPrice <= 0 {
		slog.Warn("dca invalid price", "session", session.ID, "price", ticker.LastPrice)
		return nil
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	signals := d.evaluate(session, cfg, currentPrice, ticker.LastPrice)
	now := time.Now().UnixMilli()
	for i := range signals {
		signals[i].Symbol = session.Symbol
		signals[i].SessionID = session.ID
		signals[i].Timestamp = now
	}
	return signals
}

// Reset clears in-memory state for a session (used when session is restarted).
func (d *DCAEngine) Reset(sessionID int64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.lastBuy, sessionID)
	delete(d.lastBuyPrice, sessionID)
	delete(d.lastSellPrice, sessionID)
	delete(d.avgBuyPrice, sessionID)
}

// ConfirmBuy reloads the active cost basis from exchange-confirmed fills.
// Requested signal price/quantity must never be used for live accounting.
func (d *DCAEngine) ConfirmBuy(sessionID int64, symbol string, startedAt *time.Time) {
	d.mu.Lock()
	defer d.mu.Unlock()
	type aggregate struct {
		TotalQty  float64 `db:"total_qty"`
		TotalCost float64 `db:"total_cost"`
		LastPrice float64 `db:"last_price"`
	}
	args := []any{sessionID, symbol}
	startedAtClause := ""
	if startedAt != nil {
		startedAtClause = " AND created_at >= ?"
		args = append(args, *startedAt)
	}
	var agg aggregate
	err := d.db.Get(&agg, d.db.Rebind(`
		SELECT COALESCE(SUM(CAST(executed_qty AS REAL)), 0) total_qty,
		       COALESCE(SUM(CAST(executed_qty AS REAL) * CAST(executed_price AS REAL)), 0) total_cost,
		       COALESCE((SELECT CAST(executed_price AS REAL) FROM orders
		         WHERE session_id=? AND symbol=? AND side='buy' AND status='filled'`+startedAtClause+`
		         ORDER BY created_at DESC, id DESC LIMIT 1), 0) last_price
		FROM orders WHERE session_id=? AND symbol=? AND side='buy' AND status='filled'`+startedAtClause),
		append(args, args...)...)
	if err != nil || agg.TotalQty <= 0 {
		delete(d.avgBuyPrice, sessionID)
		delete(d.lastBuyPrice, sessionID)
		slog.Warn("dca: failed to reload confirmed buy", "session", sessionID, "error", err)
		return
	}
	d.avgBuyPrice[sessionID] = agg.TotalCost / agg.TotalQty
	d.lastBuyPrice[sessionID] = agg.LastPrice
	delete(d.lastSellPrice, sessionID)
	slog.Info("dca: confirmed fill state loaded", "session", sessionID, "avg_price", d.avgBuyPrice[sessionID], "qty", agg.TotalQty, "last_price", agg.LastPrice)
}

// ConfirmSell clears the active position after a sell is confirmed and remembers
// the actual fill price. The sell timestamp becomes the start of the next interval,
// preventing the next evaluation tick from immediately opening a new cycle.
// ponytail: deletes here instead of in evaluate() to prevent infinite TP loop on failed sells.
func (d *DCAEngine) ConfirmSell(sessionID int64, symbol string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if !dcaSellReentryHoldEnabled {
		delete(d.lastBuy, sessionID)
		delete(d.avgBuyPrice, sessionID)
		delete(d.lastBuyPrice, sessionID)
		delete(d.lastSellPrice, sessionID)
		slog.Info("dca: sell confirmed, cycle state reset", "session", sessionID)
		return
	}

	var row struct {
		Price     float64   `db:"price_val"`
		CreatedAt time.Time `db:"created_at"`
	}
	err := d.db.Get(&row, d.db.Rebind(`
		SELECT COALESCE(CASE WHEN CAST(executed_price AS REAL)>0
		         THEN CAST(executed_price AS REAL) ELSE CAST(price AS REAL) END, 0) AS price_val,
		       created_at
		FROM orders
		WHERE session_id=? AND symbol=? AND side='sell' AND status='filled'
		ORDER BY id DESC LIMIT 1`), sessionID, symbol)
	if err != nil || row.Price <= 0 {
		slog.Warn("dca: confirmed sell fill not found", "session", sessionID, "error", err)
		return
	}
	if row.CreatedAt.IsZero() {
		row.CreatedAt = time.Now()
	}

	d.lastBuy[sessionID] = row.CreatedAt
	d.lastSellPrice[sessionID] = row.Price
	delete(d.avgBuyPrice, sessionID)
	delete(d.lastBuyPrice, sessionID)
	slog.Info("dca: sell confirmed, re-entry hold armed", "session", sessionID, "sell_price", row.Price)
}

// RevertLastBuy rolls back price/avg state when a live buy order fails at the exchange,
// but keeps lastBuy timestamp so the interval is respected — DCA will retry at next interval,
// not immediately. This prevents hammering the exchange on repeated failures.
func (d *DCAEngine) RevertLastBuy(sessionID int64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	// keep d.lastBuy[sessionID] intact — interval must still be respected
	delete(d.lastBuyPrice, sessionID)
	delete(d.avgBuyPrice, sessionID)
	slog.Warn("dca: reverted price state after live execute failure (interval preserved)", "session", sessionID)
}

func (d *DCAEngine) evaluate(session model.Session, cfg DCAConfig, currentPrice float64, priceStr string) []Signal {
	signals := []Signal{}

	// Recover scheduling state on the first tick after restart.
	if _, exists := d.lastBuy[session.ID]; !exists {
		var row struct {
			Epoch int64   `db:"epoch"`
			Price float64 `db:"price_val"`
			Side  string  `db:"side"`
		}
		epochExpr := "CAST(strftime('%s', created_at) AS INTEGER)"
		if d.db.DriverName() != "sqlite" {
			epochExpr = "COALESCE(EXTRACT(EPOCH FROM created_at)::BIGINT, 0)"
		}
		query := `SELECT ` + epochExpr + ` AS epoch, side,
			        COALESCE(CASE WHEN status='filled' AND CAST(executed_price AS REAL)>0
			          THEN CAST(executed_price AS REAL) ELSE CAST(price AS REAL) END, 0) AS price_val
			 FROM orders WHERE session_id=? AND symbol=?`
		args := []any{session.ID, session.Symbol}
		if dcaSellReentryHoldEnabled {
			query += ` AND ((side='buy' AND status IN ('filled','signal')) OR (side='sell' AND status='filled'))`
		} else {
			query += ` AND side='buy' AND status IN ('filled','signal')`
			if session.StartedAt != nil {
				query += ` AND created_at >= ?`
				args = append(args, *session.StartedAt)
			}
		}
		query += ` ORDER BY id DESC LIMIT 1`
		if err := d.db.Get(&row, d.db.Rebind(query), args...); err == nil && row.Epoch > 0 {
			d.lastBuy[session.ID] = time.Unix(row.Epoch, 0)
			if dcaSellReentryHoldEnabled && row.Side == string(model.SideSell) {
				d.lastSellPrice[session.ID] = row.Price
			} else {
				d.lastBuyPrice[session.ID] = row.Price
			}
		}
	}

	// Restore a fill confirmed asynchronously by the reconciler. This is kept
	// separate from lastBuy recovery because a failed synchronous execution keeps
	// the interval timestamp while clearing the speculative average price.
	if _, exists := d.avgBuyPrice[session.ID]; !exists {
		var avg struct {
			TotalQty  float64 `db:"total_qty"`
			TotalCost float64 `db:"total_cost"`
		}
		var startedAtClause string
		args := []any{session.ID, session.Symbol}
		if session.StartedAt != nil {
			startedAtClause = " AND created_at >= ?"
			args = append(args, *session.StartedAt)
		}
		if err := d.db.Get(&avg, d.db.Rebind(
			`SELECT COALESCE(SUM(CAST(executed_qty AS REAL)), 0) AS total_qty,
			        COALESCE(SUM(CAST(executed_qty AS REAL) * CAST(executed_price AS REAL)), 0) AS total_cost
			 FROM orders WHERE session_id=? AND symbol=? AND side='buy' AND status = 'filled'`+startedAtClause,
		), args...); err == nil && avg.TotalQty > 0 {
			d.avgBuyPrice[session.ID] = avg.TotalCost / avg.TotalQty
		}
	}

	// determine whether to buy
	lastTime := d.lastBuy[session.ID]
	interval := time.Duration(cfg.IntervalSec) * time.Second
	intervalReady := lastTime.IsZero() || time.Since(lastTime) >= interval

	shouldBuy := false
	reason := "dca_interval"

	if sellPrice := d.lastSellPrice[session.ID]; dcaSellReentryHoldEnabled && sellPrice > 0 {
		// After closing a cycle, do not chase the price upward. Re-entry is
		// allowed early below the sell fill, or normally when the next interval
		// has elapsed. Equality remains on hold to avoid buying back at no edge.
		if currentPrice < sellPrice {
			shouldBuy = true
			reason = "dca_reentry_below_sell"
		} else {
			shouldBuy = intervalReady
		}
	} else if cfg.DropPct > 0 {
		// price-triggered DCA: buy only when price drops DropPct% from last buy price
		lastPrice := d.lastBuyPrice[session.ID]
		if lastPrice <= 0 {
			// no prior buy — allow first buy
			shouldBuy = intervalReady
		} else {
			dropTarget := lastPrice * (1 - cfg.DropPct/100)
			if currentPrice <= dropTarget && intervalReady {
				shouldBuy = true
				reason = "dca_drop"
			}
		}
	} else {
		// interval-only DCA
		shouldBuy = intervalReady
	}

	if shouldBuy {
		// max_buys check
		if cfg.MaxBuys > 0 {
			var buyCount int
			var startedAtClause string
			args := []any{session.ID}
			if session.StartedAt != nil {
				startedAtClause = " AND created_at >= ?"
				args = append(args, *session.StartedAt)
			}
			if err := d.db.Get(&buyCount, d.db.Rebind(
				`SELECT COUNT(*) FROM orders WHERE session_id=? AND side='buy' AND status='filled'`+startedAtClause),
				args...); err == nil && buyCount >= cfg.MaxBuys {
				slog.Info("dca max_buys reached, skipping", "session_id", session.ID, "max_buys", cfg.MaxBuys)
				shouldBuy = false
			}
		}
		// max_invested check
		if shouldBuy && cfg.MaxInvested > 0 {
			var totalInvested float64
			var startedAtClause string
			args := []any{session.ID}
			if session.StartedAt != nil {
				startedAtClause = " AND created_at >= ?"
				args = append(args, *session.StartedAt)
			}
			if err := d.db.Get(&totalInvested, d.db.Rebind(
				`SELECT COALESCE(SUM(CAST(executed_quote_qty AS REAL)), 0) FROM orders WHERE session_id=? AND side='buy' AND status='filled'`+startedAtClause),
				args...); err == nil && totalInvested >= cfg.MaxInvested {
				slog.Info("dca max_invested reached, skipping", "session_id", session.ID, "max_invested", cfg.MaxInvested, "total_invested", totalInvested)
				shouldBuy = false
			}
		}
	}

	if shouldBuy {
		amount, _ := strconv.ParseFloat(cfg.Amount, 64)
		qty := amount / currentPrice
		qtyStr := strconv.FormatFloat(math.Round(qty*1e8)/1e8, 'f', 8, 64)
		signals = append(signals, Signal{
			Side: string(model.SideBuy), Price: priceStr, Quantity: qtyStr,
			QuoteQty: cfg.Amount, // live executor uses this directly → exact amount, no rounding loss
			Reason:   reason,
		})
		// ponytail: do NOT update avgBuyPrice here — order has not been confirmed yet.
		// Manager calls ConfirmBuy after live.Execute succeeds, or RevertLastBuy on failure.
		d.lastBuy[session.ID] = time.Now()
		d.lastBuyPrice[session.ID] = currentPrice
		slog.Info("dca buy signal", "session", session.ID, "qty", qtyStr, "price", priceStr, "reason", reason)
	}

	// sell on take-profit or stop-loss — fetch totalQty once for both checks
	if cfg.TakeProfitPct > 0 || cfg.StopLossPct > 0 {
		if avgPrice, ok := d.avgBuyPrice[session.ID]; ok && avgPrice > 0 {
			var totalQty float64
			var startedAtClause string
			args := []any{session.ID, session.Symbol}
			if session.StartedAt != nil {
				startedAtClause = " AND created_at >= ?"
				args = append(args, *session.StartedAt)
			}
			if err := d.db.Get(&totalQty,
				d.db.Rebind(`SELECT COALESCE(SUM(CASE WHEN status='filled' THEN CAST(executed_qty AS REAL) ELSE CAST(quantity AS REAL) END), 0) FROM orders
				 WHERE session_id=? AND symbol=? AND side='buy' AND status IN ('filled','signal')`+startedAtClause),
				args...); err != nil {
				slog.Warn("dca: fetch totalQty for TP/SL", "session", session.ID, "error", err)
			}

			if cfg.TakeProfitPct > 0 && currentPrice >= avgPrice*(1+cfg.TakeProfitPct/100) && totalQty > 0 {
				qtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
				signals = append(signals, Signal{
					Side: string(model.SideSell), Price: priceStr, Quantity: qtyStr, Reason: "dca_take_profit",
				})
				// ponytail: do NOT delete avgBuyPrice here — sell not confirmed yet.
				// Manager calls ConfirmSell after live.Execute succeeds.
				slog.Info("dca take-profit", "session", session.ID, "qty", qtyStr, "price", priceStr, "target_pct", cfg.TakeProfitPct)
			} else if cfg.StopLossPct > 0 && currentPrice <= avgPrice*(1-cfg.StopLossPct/100) && totalQty > 0 {
				qtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
				signals = append(signals, Signal{
					Side: string(model.SideSell), Price: priceStr, Quantity: qtyStr, Reason: "dca_stop_loss",
				})
				// ponytail: do NOT delete avgBuyPrice here — sell not confirmed yet.
				slog.Info("dca stop-loss", "session", session.ID, "qty", qtyStr, "price", priceStr, "sl_pct", cfg.StopLossPct)
			}
		}
	}
	return signals
}
