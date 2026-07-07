package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strconv"

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

		// Check if price touches this level (within half a step tolerance)
		tolerance := step / 2
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

	// Pre-mark levels that already have signals in the DB (prevents duplicates on restart)
	if g.db != nil {
		var triggeredLevels []int
		err := g.db.Select(&triggeredLevels,
			g.db.Rebind("SELECT DISTINCT grid_level_index FROM strategy_signals WHERE session_id = ?"), sessionID)
		if err == nil && len(triggeredLevels) > 0 {
			for _, idx := range triggeredLevels {
				if idx >= 0 && idx < len(state.levels) {
					state.levels[idx].state = levelTriggered
				}
			}
			slog.Info("grid pre-marked levels from DB", "session", sessionID, "levels", triggeredLevels)
		}
	}

	g.states[sessionID] = state
	return state
}