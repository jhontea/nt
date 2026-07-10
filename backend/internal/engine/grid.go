package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"sync"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

type levelState int

const (
	levelInactive levelState = iota
	levelTriggered
)

type gridSessionState struct {
	levels []gridLevel
}

type gridLevel struct {
	index     int
	price     float64
	side      string // "buy" or "sell"
	state     levelState
	lastPrice float64
}

type GridEngine struct {
	client *tokocrypto.Client
	db     *sqlx.DB
	mu     sync.Mutex
	states map[int64]*gridSessionState
}

func NewGridEngine(client *tokocrypto.Client, db *sqlx.DB) *GridEngine {
	return &GridEngine{
		client: client,
		db:     db,
		states: make(map[int64]*gridSessionState),
	}
}

func (g *GridEngine) Reset(sessionID int64) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.states, sessionID)
}

func (g *GridEngine) Evaluate(session model.Session, configStr string) []Signal {
	var cfg GridConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		slog.Error("parse grid config", "session", session.ID, "error", err)
		return nil
	}

	ticker, err := g.client.GetTicker(session.Symbol)
	if err != nil {
		slog.Error("fetch ticker", "session", session.ID, "error", err)
		return nil
	}
	price, err := strconv.ParseFloat(ticker.LastPrice, 64)
	if err != nil {
		slog.Error("parse price", "price", ticker.LastPrice, "error", err)
		return nil
	}

	signals := g.evaluate(session.ID, cfg, price)
	for i := range signals {
		signals[i].Symbol = session.Symbol
		signals[i].Quantity = cfg.Quantity
	}
	return signals
}

func (g *GridEngine) evaluate(sessionID int64, config GridConfig, currentPrice float64) []Signal {
	g.mu.Lock()
	defer g.mu.Unlock()

	step := (config.UpperPrice - config.LowerPrice) / float64(config.GridCount)
	if step <= 0 {
		return nil
	}

	midPrice := (config.UpperPrice + config.LowerPrice) / 2

	state := g.getOrCreateState(sessionID, config, step, midPrice)

	signals := []Signal{}

	for i := range state.levels {
		lvl := &state.levels[i]
		levelPrice := lvl.price

		// Re-arm: if price has moved away by at least 1 step
		if lvl.state == levelTriggered {
			distance := math.Abs(currentPrice - levelPrice)
			if distance >= step {
				lvl.state = levelInactive
			}
		}

		// Check if price touches this level (within step/3 tolerance — tighter than step/2 to reduce false triggers on volatile pairs)
		tolerance := step / 3
		touched := math.Abs(currentPrice-levelPrice) <= tolerance

		if touched && lvl.state == levelInactive {
			var side string
			if levelPrice < midPrice {
				side = string(model.SideBuy)
			} else if levelPrice > midPrice {
				side = string(model.SideSell)
			} else {
				continue
			}

			signals = append(signals, Signal{
				Side:   side,
				Price:  fmt.Sprintf("%.8f", levelPrice),
				Reason: fmt.Sprintf("grid_%s_level_%d", side, lvl.index),
			})
			lvl.state = levelTriggered
		}

		lvl.lastPrice = currentPrice
	}

	return signals
}

func (g *GridEngine) getOrCreateState(sessionID int64, config GridConfig, step, midPrice float64) *gridSessionState {
	state, ok := g.states[sessionID]
	if ok && len(state.levels) == config.GridCount+1 {
		return state
	}

	// Build fresh levels
	state = &gridSessionState{levels: make([]gridLevel, config.GridCount+1)}
	for i := 0; i <= config.GridCount; i++ {
		levelPrice := config.LowerPrice + step*float64(i)
		levelPrice = math.Round(levelPrice*1e8) / 1e8

		side := string(model.SideBuy)
		if levelPrice > midPrice {
			side = string(model.SideSell)
		}

		state.levels[i] = gridLevel{
			index: i,
			price: levelPrice,
			side:  side,
			state: levelInactive,
		}
	}

	// Pre-mark levels with recent signals (prevents duplicates on restart).
	if g.db != nil {
		// For signal mode: read from strategy_signals table
		var triggeredLevels []int
		err := g.db.Select(&triggeredLevels,
			g.db.Rebind(`SELECT DISTINCT grid_level_index FROM strategy_signals
				WHERE session_id = ?
				  AND created_at >= `+intervalAgo(g.db, 240)), sessionID)
		if err != nil {
			slog.Warn("grid pre-mark from strategy_signals", "session", sessionID, "error", err)
		} else if len(triggeredLevels) > 0 {
			for _, idx := range triggeredLevels {
				if idx >= 0 && idx < len(state.levels) {
					state.levels[idx].state = levelTriggered
				}
			}
			slog.Info("grid pre-marked levels from strategy_signals", "session", sessionID, "levels", triggeredLevels)
		}

		// For paper/live mode: read from orders table — match by price
		// ponytail: match open buy orders to grid levels by price proximity (within step/2)
		type openOrder struct {
			Price string `db:"price"`
		}
		var openOrders []openOrder
		if err := g.db.Select(&openOrders, g.db.Rebind(
			`SELECT price FROM orders WHERE session_id = ? AND side = 'buy' AND status = 'filled'`),
			sessionID); err != nil {
			slog.Warn("grid pre-mark from orders", "session", sessionID, "error", err)
		}
		for _, o := range openOrders {
			orderPrice, err := strconv.ParseFloat(o.Price, 64)
			if err != nil {
				continue
			}
			for i := range state.levels {
				if math.Abs(state.levels[i].price-orderPrice) <= step/2 {
					state.levels[i].state = levelTriggered
					break
				}
			}
		}
		if len(openOrders) > 0 {
			slog.Info("grid pre-marked levels from orders", "session", sessionID, "orders", len(openOrders))
		}
	}

	g.states[sessionID] = state
	return state
}