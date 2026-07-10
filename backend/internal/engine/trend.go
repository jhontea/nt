package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"sync"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

// trendSessionState tracks the last cross type fired by a session so that repeated
// identical crosses while price hovers do not emit duplicate signals.
type trendSessionState struct {
	lastCrossType string // "golden" | "death" | ""
}

type TrendEngine struct {
	client *tokocrypto.Client
	db     *sqlx.DB
	mu     sync.Mutex
	states map[int64]*trendSessionState
}

func NewTrendEngine(client *tokocrypto.Client) *TrendEngine {
	return &TrendEngine{
		client: client,
		states: make(map[int64]*trendSessionState),
	}
}

func NewTrendEngineWithDB(client *tokocrypto.Client, db *sqlx.DB) *TrendEngine {
	return &TrendEngine{
		client: client,
		db:     db,
		states: make(map[int64]*trendSessionState),
	}
}

// Reset clears the cross tracking state for a session. Called by Manager on session restart.
func (t *TrendEngine) Reset(sessionID int64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.states, sessionID)
}

func (t *TrendEngine) Evaluate(session model.Session, configStr string) []Signal {
	var cfg TrendConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		slog.Error("parse trend config", "session", session.ID, "error", err)
		return nil
	}

	interval := cfg.Interval
	if interval == "" {
		interval = "5m"
	}

	raw, err := t.client.GetCandles(session.Symbol, interval, cfg.SlowPeriod+5)
	if err != nil {
		slog.Error("fetch candles", "session", session.ID, "error", err)
		return nil
	}

	prices := make([]float64, 0, len(raw))
	for _, c := range raw {
		if len(c) < 5 {
			continue
		}
		p, err := strconv.ParseFloat(fmt.Sprintf("%v", c[4]), 64)
		if err != nil {
			slog.Warn("skip candle parse", "error", err)
			continue
		}
		prices = append(prices, p)
	}

	signals := t.evaluateWithID(session.ID, prices, cfg)
	for i := range signals {
		signals[i].Symbol = session.Symbol
		signals[i].Quantity = cfg.Quantity
	}
	return signals
}

// recoverLastCrossType reads the last executed signal from orders table to restore
// cross state after a restart, preventing duplicate signals on the first tick.
func (t *TrendEngine) recoverLastCrossType(sessionID int64) string {
	if t.db == nil {
		return ""
	}
	var side string
	err := t.db.Get(&side, t.db.Rebind(
		`SELECT side FROM orders WHERE session_id = ? AND type IN ('signal', 'market')
		 ORDER BY created_at DESC LIMIT 1`), sessionID)
	if err != nil {
		return ""
	}
	switch side {
	case string(model.SideBuy):
		return "golden"
	case string(model.SideSell):
		return "death"
	}
	return ""
}

// evaluateWithID checks the last two SMA crossover points and emits one signal
// per cross type per session, gated by trendSessionState.lastCrossType (anti-noise).
func (t *TrendEngine) evaluateWithID(sessionID int64, prices []float64, config TrendConfig) []Signal {
	t.mu.Lock()
	defer t.mu.Unlock()

	state := t.states[sessionID]
	if state == nil {
		state = &trendSessionState{
			lastCrossType: t.recoverLastCrossType(sessionID),
		}
		t.states[sessionID] = state
		slog.Info("trend: recovered cross state", "session", sessionID, "lastCross", state.lastCrossType)
	}

	signals := []Signal{}
	if len(prices) < config.SlowPeriod {
		slog.Warn("trend: not enough candles, skipping evaluation", "session", sessionID, "have", len(prices), "need", config.SlowPeriod)
		return signals
	}

	fast := sma(prices, config.FastPeriod)
	slow := sma(prices, config.SlowPeriod)

	prevFast := fast[len(fast)-2]
	prevSlow := slow[len(slow)-2]
	currFast := fast[len(fast)-1]
	currSlow := slow[len(slow)-1]

	golden := prevFast <= prevSlow && currFast > currSlow
	death := prevFast >= prevSlow && currFast < currSlow

	slog.Info("trend: evaluate", "session", sessionID, "currFast", fmt.Sprintf("%.2f", currFast), "currSlow", fmt.Sprintf("%.2f", currSlow), "golden", golden, "death", death, "lastCross", state.lastCrossType)

	if golden && state.lastCrossType != "golden" {
		signals = append(signals, Signal{
			Side:   string(model.SideBuy),
			Price:  fmt.Sprintf("%.8f", prices[len(prices)-1]),
			Reason: "golden_cross",
		})
		state.lastCrossType = "golden"
		slog.Info("trend: golden cross signal", "session", sessionID, "price", prices[len(prices)-1])
	} else if golden && state.lastCrossType == "golden" {
		slog.Debug("trend: golden cross skipped (already golden)", "session", sessionID)
	}

	if death && state.lastCrossType != "death" {
		signals = append(signals, Signal{
			Side:   string(model.SideSell),
			Price:  fmt.Sprintf("%.8f", prices[len(prices)-1]),
			Reason: "death_cross",
		})
		state.lastCrossType = "death"
		slog.Info("trend: death cross signal", "session", sessionID, "price", prices[len(prices)-1])
	} else if death && state.lastCrossType == "death" {
		slog.Debug("trend: death cross skipped (already death)", "session", sessionID)
	}

	return signals
}

func sma(prices []float64, period int) []float64 {
	result := make([]float64, len(prices))
	for i := period - 1; i < len(prices); i++ {
		sum := 0.0
		for j := i - period + 1; j <= i; j++ {
			sum += prices[j]
		}
		result[i] = sum / float64(period)
	}
	return result
}
