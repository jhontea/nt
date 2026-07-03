package engine

import (
	"log"
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
	lastBuy     map[int64]time.Time // sessionID -> last buy time
	avgBuyPrice map[int64]float64   // sessionID -> average buy price (for take-profit)
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

func (d *DCAEngine) Evaluate(session model.Session, cfg DCAConfig) []Signal {
	d.mu.Lock()
	defer d.mu.Unlock()

	signals := []Signal{}

	// Get current price
	ticker, err := d.client.GetTicker(session.Symbol)
	if err != nil {
		log.Printf("dca: ticker error: %v", err)
		return nil
	}
	currentPrice, _ := strconv.ParseFloat(ticker.LastPrice, 64)

	// Check if it's time to buy
	lastTime, exists := d.lastBuy[session.ID]
	interval := time.Duration(cfg.IntervalSec) * time.Second
	if !exists || time.Since(lastTime) >= interval {
		// Calculate quantity: amount / price
		amount, _ := strconv.ParseFloat(cfg.Amount, 64)
		qty := amount / currentPrice
		qtyStr := strconv.FormatFloat(math.Round(qty*1e8)/1e8, 'f', 8, 64)

		signals = append(signals, Signal{
			Side:     "buy",
			Price:    ticker.LastPrice,
			Quantity: qtyStr,
			Reason:   "dca_interval",
		})
		d.lastBuy[session.ID] = time.Now()
		d.updateAvgPrice(session.ID, currentPrice, qty)
		log.Printf("dca: BUY signal %s %s @ %s (interval %ds)", session.Symbol, qtyStr, ticker.LastPrice, cfg.IntervalSec)
	}

	// Check take-profit: sell if price >= avg_buy * (1 + pct/100)
	if cfg.TakeProfitPct > 0 {
		if avgPrice, ok := d.avgBuyPrice[session.ID]; ok && avgPrice > 0 {
			targetPrice := avgPrice * (1 + cfg.TakeProfitPct/100)
			if currentPrice >= targetPrice {
				// Find total bought quantity from orders
				var totalQty float64
				d.db.Get(&totalQty,
					`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) FROM orders
					 WHERE session_id=? AND symbol=? AND side='buy' AND status='filled'`,
					session.ID, session.Symbol)
				if totalQty > 0 {
					qtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
					signals = append(signals, Signal{
						Side:     "sell",
						Price:    ticker.LastPrice,
						Quantity: qtyStr,
						Reason:   "dca_take_profit",
					})
					// Reset avg price after selling
					delete(d.avgBuyPrice, session.ID)
					log.Printf("dca: SELL signal %s %s @ %s (take-profit %.1f%%)", session.Symbol, qtyStr, ticker.LastPrice, cfg.TakeProfitPct)
				}
			}
		}
	}

	return signals
}

func (d *DCAEngine) updateAvgPrice(sessionID int64, price, qty float64) {
	oldAvg, ok := d.avgBuyPrice[sessionID]
	if !ok || oldAvg == 0 {
		d.avgBuyPrice[sessionID] = price
		return
	}
	// Get existing total qty
	var existingQty float64
	d.db.Get(&existingQty,
		`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) FROM orders
		 WHERE session_id=? AND symbol=? AND side='buy' AND status='filled'`,
		sessionID, sessionID)
	totalQty := existingQty + qty
	if totalQty > 0 {
		newAvg := ((oldAvg * existingQty) + (price * qty)) / totalQty
		d.avgBuyPrice[sessionID] = newAvg
	}
}
