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

type DCAEngine struct {
	mu            sync.Mutex
	lastBuy       map[int64]time.Time
	lastBuyPrice  map[int64]float64 // price at last executed buy, for DropPct check
	avgBuyPrice   map[int64]float64
	client        *tokocrypto.Client
	db            *sqlx.DB
}

func NewDCAEngine(client *tokocrypto.Client, db *sqlx.DB) *DCAEngine {
	return &DCAEngine{
		lastBuy:      make(map[int64]time.Time),
		lastBuyPrice: make(map[int64]float64),
		avgBuyPrice:  make(map[int64]float64),
		client:       client,
		db:           db,
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
	delete(d.avgBuyPrice, sessionID)
}

// ConfirmBuy updates avgBuyPrice after a live buy order is confirmed on the exchange.
// Must be called by Manager after live.Execute succeeds.
func (d *DCAEngine) ConfirmBuy(sessionID int64, symbol string, price, qty float64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.updateAvgPrice(sessionID, symbol, price, qty)
	slog.Info("dca: buy confirmed, avg price updated", "session", sessionID, "price", price, "qty", qty)
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

	// recover lastBuy + lastBuyPrice + avgBuyPrice from DB on first tick after restart
	if _, exists := d.lastBuy[session.ID]; !exists {
		var row struct {
			Epoch    int64   `db:"epoch"`
			Price    float64 `db:"price_val"`
		}
		epochExpr := "CAST(strftime('%s', created_at) AS INTEGER)"
		if d.db.DriverName() != "sqlite" {
			epochExpr = "COALESCE(EXTRACT(EPOCH FROM created_at)::BIGINT, 0)"
		}
		if err := d.db.Get(&row, d.db.Rebind(
			`SELECT `+epochExpr+` AS epoch,
			        COALESCE(CAST(price AS REAL), 0) AS price_val
			 FROM orders WHERE session_id=? AND symbol=? AND side='buy'
			 ORDER BY id DESC LIMIT 1`,
		), session.ID, session.Symbol); err == nil && row.Epoch > 0 {
			d.lastBuy[session.ID] = time.Unix(row.Epoch, 0)
			d.lastBuyPrice[session.ID] = row.Price
		}

		// Gap 3 fix: restore avgBuyPrice from DB on restart
		var avg struct {
			TotalQty  float64 `db:"total_qty"`
			TotalCost float64 `db:"total_cost"`
		}
		if err := d.db.Get(&avg, d.db.Rebind(
			`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) AS total_qty,
			        COALESCE(SUM(CAST(quantity AS REAL) * CAST(price AS REAL)), 0) AS total_cost
			 FROM orders WHERE session_id=? AND symbol=? AND side='buy' AND status IN ('filled','signal')`,
		), session.ID, session.Symbol); err == nil && avg.TotalQty > 0 {
			d.avgBuyPrice[session.ID] = avg.TotalCost / avg.TotalQty
		}
	}

	// determine whether to buy
	lastTime := d.lastBuy[session.ID]
	interval := time.Duration(cfg.IntervalSec) * time.Second
	intervalReady := lastTime.IsZero() || time.Since(lastTime) >= interval

	shouldBuy := false
	reason := "dca_interval"

	if cfg.DropPct > 0 {
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
		amount, _ := strconv.ParseFloat(cfg.Amount, 64)
		qty := amount / currentPrice
		qtyStr := strconv.FormatFloat(math.Round(qty*1e8)/1e8, 'f', 8, 64)
		signals = append(signals, Signal{
			Side: string(model.SideBuy), Price: priceStr, Quantity: qtyStr,
			QuoteQty: cfg.Amount, // live executor uses this directly → exact amount, no rounding loss
			Reason: reason,
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
			if err := d.db.Get(&totalQty,
				d.db.Rebind(`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) FROM orders
				 WHERE session_id=? AND symbol=? AND side='buy' AND status IN ('filled','signal')`),
				session.ID, session.Symbol); err != nil {
				slog.Warn("dca: fetch totalQty for TP/SL", "session", session.ID, "error", err)
			}

			if cfg.TakeProfitPct > 0 && currentPrice >= avgPrice*(1+cfg.TakeProfitPct/100) && totalQty > 0 {
				qtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
				signals = append(signals, Signal{
					Side: string(model.SideSell), Price: priceStr, Quantity: qtyStr, Reason: "dca_take_profit",
				})
				delete(d.avgBuyPrice, session.ID)
				delete(d.lastBuyPrice, session.ID)
				slog.Info("dca take-profit", "session", session.ID, "qty", qtyStr, "price", priceStr, "target_pct", cfg.TakeProfitPct)
			} else if cfg.StopLossPct > 0 && currentPrice <= avgPrice*(1-cfg.StopLossPct/100) && totalQty > 0 {
				qtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
				signals = append(signals, Signal{
					Side: string(model.SideSell), Price: priceStr, Quantity: qtyStr, Reason: "dca_stop_loss",
				})
				delete(d.avgBuyPrice, session.ID)
				delete(d.lastBuyPrice, session.ID)
				slog.Info("dca stop-loss", "session", session.ID, "qty", qtyStr, "price", priceStr, "sl_pct", cfg.StopLossPct)
			}
		}
	}
	return signals
}

func (d *DCAEngine) updateAvgPrice(sessionID int64, symbol string, price, qty float64) {
	oldAvg, ok := d.avgBuyPrice[sessionID]
	if !ok || oldAvg == 0 {
		d.avgBuyPrice[sessionID] = price
		return
	}
	var existingQty float64
	if err := d.db.Get(&existingQty,
		d.db.Rebind(`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) FROM orders
		 WHERE session_id=? AND symbol=? AND side='buy' AND status IN ('filled','signal')`),
		sessionID, symbol); err != nil {
		slog.Warn("dca: fetch existingQty for avgPrice", "session", sessionID, "error", err)
		return
	}
	totalQty := existingQty + qty
	if totalQty > 0 {
		d.avgBuyPrice[sessionID] = ((oldAvg * existingQty) + (price * qty)) / totalQty
	}
}
