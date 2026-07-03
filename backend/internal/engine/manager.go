package engine

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/tokocrypto"
)

type Manager struct {
	mu         sync.Mutex
	sessions   map[int64]*RunningSession
	client     *tokocrypto.Client
	db         *sqlx.DB
	strategies map[string]StrategyEvaluator
	paper      *PaperEngine
	live       *LiveEngine
	notifier   *service.Notifier
	Hub        *WSHub
}

type RunningSession struct {
	Session model.Session
	Cancel  context.CancelFunc
}

func NewManager(client *tokocrypto.Client, db *sqlx.DB, notifier *service.Notifier, hub *WSHub) *Manager {
	return &Manager{
		sessions: make(map[int64]*RunningSession),
		client:   client,
		db:       db,
		strategies: map[string]StrategyEvaluator{
			string(model.StratGrid):  NewGridEngine(client),
			string(model.StratTrend): NewTrendEngine(client),
			string(model.StratDCA):   NewDCAEngine(client, db),
		},
		paper:    NewPaperEngine(db, client),
		live:     NewLiveEngine(client, db),
		notifier: notifier,
		Hub:      hub,
	}
}

func (m *Manager) Start(session model.Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[session.ID]; exists {
		return ErrSessionRunning
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.sessions[session.ID] = &RunningSession{
		Session: session,
		Cancel:  cancel,
	}

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
	defer m.mu.Unlock()

	for id, rs := range m.sessions {
		rs.Cancel()
		delete(m.sessions, id)
	}
}

func (m *Manager) IsRunning(sessionID int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.sessions[sessionID]
	return ok
}

func (m *Manager) run(ctx context.Context, session model.Session) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("session stopped", "id", session.ID)
			return
		case <-ticker.C:
			var fresh model.Session
			if err := m.db.Get(&fresh, "SELECT * FROM sessions WHERE id = ?", session.ID); err != nil {
				slog.Error("read session", "id", session.ID, "error", err)
				continue
			}
			m.evaluate(ctx, fresh)
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
		m.saveSignals(session.ID, signals)
		m.broadcast(session.ID, signals)
	case string(model.ModePaper):
		for _, sig := range signals {
			if err := m.paper.Execute(session, sig); err != nil {
				slog.Error("paper execute", "session", session.ID, "error", err)
			}
			m.notifier.SendSignal(sig.Symbol, sig.Side, sig.Price, sig.Reason)
			m.Hub.Broadcast(session.ID, WSSignal{Type: "signal", SessionID: session.ID, Signal: sig})
		}
	case string(model.ModeLive):
		for _, sig := range signals {
			if err := m.live.Execute(session, sig); err != nil {
				slog.Error("live execute", "session", session.ID, "error", err)
			}
			m.notifier.SendSignal(sig.Symbol, sig.Side, sig.Price, sig.Reason)
			m.Hub.Broadcast(session.ID, WSSignal{Type: "signal", SessionID: session.ID, Signal: sig})
		}
	}
}

func (m *Manager) broadcast(sessionID int64, signals []Signal) {
	for _, sig := range signals {
		m.notifier.SendSignal(sig.Symbol, sig.Side, sig.Price, sig.Reason)
		m.Hub.Broadcast(sessionID, WSSignal{Type: "signal", SessionID: sessionID, Signal: sig})
	}
}

func (m *Manager) saveSignals(sessionID int64, signals []Signal) {
	for _, sig := range signals {
		slog.Info("signal", "session", sessionID, "side", sig.Side, "price", sig.Price, "reason", sig.Reason)
		_, err := m.db.Exec(
			`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status)
			 VALUES (?, ?, ?, ?, 'signal', ?, ?, 'signal')`,
			sessionID, "sig_"+fmt.Sprintf("%d", time.Now().UnixNano()),
			sig.Symbol, sig.Side, sig.Price, sig.Quantity,
		)
		if err != nil {
			slog.Error("save signal", "session", sessionID, "error", err)
		}
	}
}
