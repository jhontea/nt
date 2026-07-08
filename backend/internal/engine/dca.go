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
	mu          sync.Mutex
	lastBuy     map[int64]time.Time
	avgBuyPrice map[int64]float64
	client      *tokocrypto.Client
	db          *sqlx.DB
}

func NewDCAEngine(client *tokocrypto.Client, db *sqlx.DB) *DCAEngine {
	return &DCAEngine{
		lastBuy:     make(map[int64]time.Time),
		avgBuyPrice: make(map[int64]float64),
		client:      client,
		db:          db,
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
	delete(d.avgBuyPrice, sessionID)
}

func (d *DCAEngine) evaluate(session model.Session, cfg DCAConfig, currentPrice float64, priceStr string) []Signal {
	signals := []Signal{}

	// buy on interval
	lastTime, exists := d.lastBuy[session.ID]
	interval := time.Duration(cfg.IntervalSec) * time.Second
	if !exists || time.Since(lastTime) >= interval {
		amount, _ := strconv.ParseFloat(cfg.Amount, 64)
		qty := amount / currentPrice
		qtyStr := strconv.FormatFloat(math.Round(qty*1e8)/1e8, 'f', 8, 64)
		signals = append(signals, Signal{
			Side: string(model.SideBuy), Price: priceStr, Quantity: qtyStr, Reason: "dca_interval",
		})
		d.lastBuy[session.ID] = time.Now()
		d.updateAvgPrice(session.ID, session.Symbol, currentPrice, qty)
		slog.Info("dca buy signal", "session", session.ID, "qty", qtyStr, "price", priceStr, "interval", cfg.IntervalSec)
	}

	// sell on take-profit or stop-loss — fetch totalQty once for both checks
	if cfg.TakeProfitPct > 0 || cfg.StopLossPct > 0 {
		if avgPrice, ok := d.avgBuyPrice[session.ID]; ok && avgPrice > 0 {
			var totalQty float64
			d.db.Get(&totalQty,
				d.db.Rebind(`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) FROM orders
				 WHERE session_id=? AND symbol=? AND side='buy' AND status IN ('filled','signal')`),
				session.ID, session.Symbol)

			if cfg.TakeProfitPct > 0 && currentPrice >= avgPrice*(1+cfg.TakeProfitPct/100) && totalQty > 0 {
				qtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
				signals = append(signals, Signal{
					Side: string(model.SideSell), Price: priceStr, Quantity: qtyStr, Reason: "dca_take_profit",
				})
				delete(d.avgBuyPrice, session.ID)
				slog.Info("dca take-profit", "session", session.ID, "qty", qtyStr, "price", priceStr, "target_pct", cfg.TakeProfitPct)
			} else if cfg.StopLossPct > 0 && currentPrice <= avgPrice*(1-cfg.StopLossPct/100) && totalQty > 0 {
				qtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
				signals = append(signals, Signal{
					Side: string(model.SideSell), Price: priceStr, Quantity: qtyStr, Reason: "dca_stop_loss",
				})
				delete(d.avgBuyPrice, session.ID)
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
	d.db.Get(&existingQty,
		d.db.Rebind(`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) FROM orders
		 WHERE session_id=? AND symbol=? AND side='buy' AND status IN ('filled','signal')`),
		sessionID, symbol)
	totalQty := existingQty + qty
	if totalQty > 0 {
		d.avgBuyPrice[sessionID] = ((oldAvg * existingQty) + (price * qty)) / totalQty
	}
}
