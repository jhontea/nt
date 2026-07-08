package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/repository"
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/tokocrypto"
)

type Manager struct {
	mu         sync.Mutex
	wg         sync.WaitGroup
	sessions   map[int64]*RunningSession
	client     *tokocrypto.Client
	db         *sqlx.DB
	strategies map[string]StrategyEvaluator
	paper      *PaperEngine
	live       *LiveEngine
	notifier   *service.Notifier
	Hub        *WSHub
	signalRepo repository.StrategySignalRepository
	validator  *SignalValidator
}

type RunningSession struct {
	Session model.Session
	Cancel  context.CancelFunc
}

func NewManager(client *tokocrypto.Client, db *sqlx.DB, notifier *service.Notifier, hub *WSHub, signalRepo repository.StrategySignalRepository) *Manager {
	return &Manager{
		sessions: make(map[int64]*RunningSession),
		client:   client,
		db:       db,
		strategies: map[string]StrategyEvaluator{
			string(model.StratGrid):  NewGridEngine(client, db),
			string(model.StratTrend): NewTrendEngine(client),
			string(model.StratDCA):   NewDCAEngine(client, db),
		},
		paper:      NewPaperEngine(db, client, hub, notifier),
		live:       NewLiveEngine(client, db),
		notifier:   notifier,
		Hub:        hub,
		signalRepo: signalRepo,
		validator:  NewSignalValidator(),
	}
}

func (m *Manager) Start(session model.Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[session.ID]; exists {
		return ErrSessionRunning
	}

	// Reset DCA state on restart (clear old buy timestamps and average prices)
	if dca, ok := m.strategies[string(model.StratDCA)].(*DCAEngine); ok {
		dca.Reset(session.ID)
	}
	// Reset Grid state on restart (clear level triggers)
	if grid, ok := m.strategies[string(model.StratGrid)].(*GridEngine); ok {
		grid.Reset(session.ID)
	}
// Reset Trend state on restart (clear cross tracking)
	if trend, ok := m.strategies[string(model.StratTrend)].(*TrendEngine); ok {
		trend.Reset(session.ID)
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.sessions[session.ID] = &RunningSession{
		Session: session,
		Cancel:  cancel,
	}

	m.wg.Add(1)
	go m.run(ctx, session)
	return nil
}

func (m *Manager) Stop(sessionID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if rs, ok := m.sessions[sessionID]; ok {
		rs.Cancel()
		delete(m.sessions, sessionID)
	}
}

func (m *Manager) StopAll() {
	m.mu.Lock()
	for id, rs := range m.sessions {
		rs.Cancel()
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	m.wg.Wait()
}

func (m *Manager) IsRunning(sessionID int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.sessions[sessionID]
	return ok
}

func (m *Manager) run(ctx context.Context, session model.Session) {
	defer m.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			slog.Error("session panic", "id", session.ID, "recover", r)
		}
	}()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("session stopped", "id", session.ID)
			return
		case <-ticker.C:
			var fresh model.Session
			if err := m.db.Get(&fresh, m.db.Rebind("SELECT * FROM sessions WHERE id = ?"), session.ID); err != nil {
				slog.Error("read session", "id", session.ID, "error", err)
				continue
			}
			m.evaluate(ctx, fresh)
		// Run validator on every tick for grid+signal sessions
		switch {
		case fresh.Strategy == string(model.StratGrid) && fresh.Mode == string(model.ModeSignal):
			m.validatePendingSignals(fresh)
		case fresh.Strategy == string(model.StratTrend) && fresh.Mode == string(model.ModeSignal):
			m.validatePendingTrendSignals(fresh)
		}
		}
	}
}

func (m *Manager) evaluate(ctx context.Context, session model.Session) {
	evaluator, ok := m.strategies[session.Strategy]
	if !ok {
		slog.Warn("unknown strategy", "strategy", session.Strategy)
		return
	}

	signals := evaluator.Evaluate(session, session.Config)
	if len(signals) == 0 {
		return
	}

	switch session.Mode {
	case string(model.ModeSignal):
		switch {
		case session.Strategy == string(model.StratGrid) && m.signalRepo != nil:
			m.saveGridSignals(session, signals)
		case session.Strategy == string(model.StratTrend) && m.signalRepo != nil:
			m.saveTrendSignals(session, signals)
		default:
			m.saveSignals(session.ID, signals)
		}
		m.broadcast(session.ID, session.Name, session.Strategy, session.Mode, signals)
	case string(model.ModePaper):
		for _, sig := range signals {
			var execErr error
			if session.Strategy == string(model.StratTrend) {
				execErr = m.paper.ExecuteTrend(session, sig)
			} else {
				execErr = m.paper.Execute(session, sig)
			}
			if execErr != nil {
				slog.Error("paper execute", "session", session.ID, "error", execErr)
			}
			m.Hub.Broadcast(session.ID, WSSignal{Type: "signal", SessionID: session.ID, Signal: sig})
		}
		// Check SL/TP after executing signals
		if len(signals) > 0 {
			m.checkPaperStopConditions(session, signals[0].Price)
		}
	case string(model.ModeLive):
		for _, sig := range signals {
			if err := m.live.Execute(session, sig); err != nil {
				slog.Error("live execute", "session", session.ID, "error", err)
			}
			m.notifier.SendSignal(session.Name, session.Strategy, session.Mode, sig.Symbol, sig.Side, sig.Price, sig.Reason)
			m.Hub.Broadcast(session.ID, WSSignal{Type: "signal", SessionID: session.ID, Signal: sig})
		}
	}
}

func (m *Manager) broadcast(sessionID int64, sessionName, strategy, mode string, signals []Signal) {
	for _, sig := range signals {
		m.notifier.SendSignal(sessionName, strategy, mode, sig.Symbol, sig.Side, sig.Price, sig.Reason)
		m.Hub.Broadcast(sessionID, WSSignal{Type: "signal", SessionID: sessionID, Signal: sig})
	}
}

func (m *Manager) saveSignals(sessionID int64, signals []Signal) {
	if len(signals) == 0 {
		return
	}
	now := time.Now().UnixNano()
	query := `INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status) VALUES `
	vals := []any{}
	for i, sig := range signals {
		if i > 0 {
			query += ", "
		}
		query += "(?, ?, ?, ?, 'signal', ?, ?, 'signal')"
		vals = append(vals, sessionID, fmt.Sprintf("sig_%d", now+int64(i)), sig.Symbol, sig.Side, sig.Price, sig.Quantity)
		slog.Info("signal", "session", sessionID, "side", sig.Side, "price", sig.Price, "reason", sig.Reason)
	}
	_, err := m.db.Exec(m.db.Rebind(query), vals...)
	if err != nil {
		slog.Error("save signals batch", "session", sessionID, "error", err)
	}
}

func (m *Manager) saveGridSignals(session model.Session, signals []Signal) {
	if len(signals) == 0 || m.signalRepo == nil {
		return
	}

	// Parse grid config for validation settings
	var cfg GridConfig
	if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
		slog.Error("parse grid config for signals", "session", session.ID, "error", err)
		return
	}

	gridStep := (cfg.UpperPrice - cfg.LowerPrice) / float64(cfg.GridCount)

	for _, sig := range signals {
		// Extract level index from reason (e.g., "grid_buy_level_3")
		levelIdx := 0
		for i := len(sig.Reason) - 1; i >= 0; i-- {
			if sig.Reason[i] == '_' {
				levelIdx, _ = strconv.Atoi(sig.Reason[i+1:])
				break
			}
		}

		signal := &model.StrategySignal{
			SessionID:             session.ID,
			Symbol:                session.Symbol,
			Strategy:              "grid",
			SignalType:            sig.Side,
			GridLevelIndex:        levelIdx,
			GridLevelPrice:        sig.Price,
			MarketPriceAtSignal:   sig.Price,
			Quantity:              sig.Quantity,
			Reason:                sig.Reason,
			ValidationMode:         "grid_steps",
			ValidationTargetValue: 2,
			ValidationInvalidValue: 1,
			ValidationWindowMinutes: 120,
		}

		// Override with config values if present in the JSON config
		// (the engine config JSON may include validation fields)
		var extCfg struct {
			ValidationMode           string  `json:"validation_mode"`
			ValidationTargetValue    float64 `json:"validation_target_value"`
			ValidationInvalidValue   float64 `json:"validation_invalid_value"`
			ValidationWindowMinutes  int     `json:"validation_window_minutes"`
		}
		if json.Unmarshal([]byte(session.Config), &extCfg) == nil {
			if extCfg.ValidationMode != "" {
				signal.ValidationMode = extCfg.ValidationMode
			}
			if extCfg.ValidationTargetValue > 0 {
				signal.ValidationTargetValue = extCfg.ValidationTargetValue
			}
			if extCfg.ValidationInvalidValue > 0 {
				signal.ValidationInvalidValue = extCfg.ValidationInvalidValue
			}
			if extCfg.ValidationWindowMinutes > 0 {
				signal.ValidationWindowMinutes = extCfg.ValidationWindowMinutes
			}
		}

		_, err := m.signalRepo.Create(context.Background(), signal)
		if err != nil {
			slog.Error("save grid signal", "session", session.ID, "error", err)
		} else {
			slog.Info("grid signal saved", "session", session.ID, "side", sig.Side, "level", levelIdx, "price", sig.Price)
		}

		_ = gridStep
	}

	// Also save to orders table for backward compat with existing UI
	m.saveSignals(session.ID, signals)
}

func (m *Manager) validatePendingSignals(session model.Session) {
	if m.signalRepo == nil || m.validator == nil {
		return
	}

	pending, err := m.signalRepo.ListPending(context.Background(), session.ID)
	if err != nil || len(pending) == 0 {
		return
	}

	// Get current price for validation
	ticker, err := m.client.GetTicker(session.Symbol)
	if err != nil {
		slog.Error("validator fetch ticker", "session", session.ID, "error", err)
		return
	}
	currentPrice, _ := strconv.ParseFloat(ticker.LastPrice, 64)

	// Parse grid config for step size
	var cfg GridConfig
	if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
		return
	}
	gridStep := (cfg.UpperPrice - cfg.LowerPrice) / float64(cfg.GridCount)

	results := m.validator.ValidatePending(pending, currentPrice, gridStep)
	for _, r := range results {
		slog.Info("signal validated", "signal", r.signalID, "status", r.status, "result_pct", r.resultPct, "note", r.note)
		err := m.signalRepo.UpdateValidation(context.Background(), r.signalID, r.status,
			r.resultPct, r.resultGridSteps, r.maxFavPct, r.maxAdvPct, r.maxFavGrid, r.maxAdvGrid, r.note)
		if err != nil {
			slog.Error("update signal validation", "signal", r.signalID, "status", r.status, "error", err)
		}
	}
}

func (m *Manager) saveTrendSignals(session model.Session, signals []Signal) {
	if len(signals) == 0 || m.signalRepo == nil {
		return
	}

	var cfg TrendConfig
	if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
		slog.Error("parse trend config for signals", "session", session.ID, "error", err)
		return
	}

	// Apply defaults if validation fields were not set in config (legacy sessions)
	targetVal := cfg.ValidationTargetValue
	if targetVal == 0 {
		targetVal = 2.0
	}
	invalidVal := cfg.ValidationInvalidValue
	if invalidVal == 0 {
		invalidVal = 1.0
	}
	windowMin := cfg.ValidationWindowMinutes
	if windowMin == 0 {
		windowMin = 120
	}

	for _, sig := range signals {
		// ponytail: trend pakai kolom grid_* sebagai marker*, 0 untuk grid-only fields.
		// Rename ke marker_* saat strategi ke-4 muncul.
		signal := &model.StrategySignal{
			SessionID:              session.ID,
			Symbol:                 session.Symbol,
			Strategy:               "trend",
			SignalType:             sig.Side,
			GridLevelIndex:         0,
			GridLevelPrice:         sig.Price,
			MarketPriceAtSignal:   sig.Price,
			Quantity:               sig.Quantity,
			Reason:                 sig.Reason,
			ValidationMode:         "percent",
			ValidationTargetValue:  targetVal,
			ValidationInvalidValue: invalidVal,
			ValidationWindowMinutes: windowMin,
		}
		if _, err := m.signalRepo.Create(context.Background(), signal); err != nil {
			slog.Error("save trend signal", "session", session.ID, "error", err)
		} else {
			slog.Info("trend signal saved", "session", session.ID, "side", sig.Side, "reason", sig.Reason)
		}
	}
	// Backward-compat: also save to orders table
	m.saveSignals(session.ID, signals)
}

func (m *Manager) validatePendingTrendSignals(session model.Session) {
	if m.signalRepo == nil {
		return
	}

	pending, err := m.signalRepo.ListPending(context.Background(), session.ID)
	if err != nil || len(pending) == 0 {
		return
	}

	var cfg TrendConfig
	if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
		slog.Error("parse trend config for validation", "session", session.ID, "error", err)
		return
	}
	interval := cfg.Interval
	if interval == "" {
		interval = "5m"
	}
	limit := cfg.SlowPeriod + 5
	if limit < 10 {
		limit = 10
	}

	raw, err := m.client.GetCandles(session.Symbol, interval, limit)
	if err != nil {
		slog.Error("trend validator fetch candles", "session", session.ID, "error", err)
		return
	}
	prices := make([]float64, 0, len(raw))
	for _, c := range raw {
		if len(c) < 5 {
			continue
		}
		p, err := strconv.ParseFloat(fmt.Sprintf("%v", c[4]), 64)
		if err != nil {
			continue
		}
		prices = append(prices, p)
	}
	if len(prices) < cfg.SlowPeriod {
		slog.Warn("trend validator insufficient candles", "session", session.ID, "got", len(prices), "need", cfg.SlowPeriod)
		return
	}

	currentPrice := prices[len(prices)-1]
	fastSMA := sma(prices, cfg.FastPeriod)
	slowSMA := sma(prices, cfg.SlowPeriod)
	fast := fastSMA[len(fastSMA)-1]
	slow := slowSMA[len(slowSMA)-1]

	validator := NewTrendValidator()
	results := validator.ValidatePendingTrend(pending, currentPrice, fast, slow)
	for _, r := range results {
		slog.Info("trend signal validated", "signal", r.signalID, "status", r.status, "result_pct", r.resultPct, "note", r.note)
		if err := m.signalRepo.UpdateValidation(context.Background(), r.signalID, r.status,
			r.resultPct, r.resultGridSteps, r.maxFavPct, r.maxAdvPct, r.maxFavGrid, r.maxAdvGrid, r.note); err != nil {
			slog.Error("update trend signal validation", "signal", r.signalID, "error", err)
		}
	}
}

func (m *Manager) checkPaperStopConditions(session model.Session, currentPrice string) {
	result := m.paper.CheckStopConditions(session, currentPrice)
	if !result.Triggered {
		return
	}

	reason := string(result.Reason)
	slog.Info("paper stop condition triggered", "session", session.ID, "reason", reason,
		"total_value", result.TotalValue, "init_balance", result.InitBalance)

	m.Stop(session.ID)
	m.db.Exec(m.db.Rebind("UPDATE sessions SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP WHERE id = ?"), session.ID)
	m.notifier.SendStopAlert(session.Name, session.Symbol, reason, result.TotalValue, result.InitBalance)
	m.Hub.Broadcast(session.ID, WSPaperAlert{
		Type:      "paper_alert",
		SessionID: session.ID,
		Reason:    reason,
		Needed:    result.InitBalance,
		Available: result.TotalValue,
	})
}
