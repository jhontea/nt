package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

type Manager struct {
	mu       sync.Mutex
	sessions map[int64]*RunningSession
	client   *tokocrypto.Client
	db       *sqlx.DB
	grid     *GridEngine
	trend    *TrendEngine
	paper    *PaperEngine
}

type RunningSession struct {
	Session model.Session
	Cancel  context.CancelFunc
}

func NewManager(client *tokocrypto.Client, db *sqlx.DB) *Manager {
	return &Manager{
		sessions: make(map[int64]*RunningSession),
		client:   client,
		db:       db,
		grid:     NewGridEngine(),
		trend:    NewTrendEngine(),
		paper:    NewPaperEngine(db, client),
	}
}

func (m *Manager) Start(session model.Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[session.ID]; exists {
		return fmt.Errorf("session %d already running", session.ID)
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
			log.Printf("session %d stopped", session.ID)
			return
		case <-ticker.C:
			m.evaluate(ctx, session)
		}
	}
}

func (m *Manager) evaluate(ctx context.Context, session model.Session) {
	signals := m.evaluateSignal(session)
	if len(signals) == 0 {
		return
	}
	switch session.Mode {
	case "signal":
		m.saveSignals(session.ID, signals)
	case "paper":
		for _, sig := range signals {
			if err := m.paper.Execute(session, sig); err != nil {
				log.Printf("paper execute error: %v", err)
			}
		}
	}
}

func (m *Manager) evaluateSignal(session model.Session) []Signal {
	switch session.Strategy {
	case "grid":
		var cfg GridConfig
		if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
			log.Printf("error parsing grid config: %v", err)
			return nil
		}
		ticker, err := m.client.GetTicker(session.Symbol)
		if err != nil {
			log.Printf("error fetching ticker: %v", err)
			return nil
		}
		price, _ := strconv.ParseFloat(ticker.LastPrice, 64)
		signals := m.grid.Evaluate(cfg, price)
		for i := range signals {
			signals[i].Symbol = session.Symbol
			signals[i].Quantity = cfg.Quantity
		}
		return signals

	case "trend":
		var cfg TrendConfig
		if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
			log.Printf("error parsing trend config: %v", err)
			return nil
		}
		raw, err := m.client.GetCandles(session.Symbol, "5m", int(cfg.SlowPeriod)+5)
		if err != nil {
			log.Printf("error fetching candles: %v", err)
			return nil
		}
		prices := make([]float64, len(raw))
		for i, c := range raw {
			if len(c) >= 5 {
				prices[i], _ = strconv.ParseFloat(fmt.Sprintf("%v", c[4]), 64)
			}
		}
		signals := m.trend.Evaluate(prices, cfg)
		for i := range signals {
			signals[i].Symbol = session.Symbol
			signals[i].Quantity = cfg.Quantity
		}
		return signals
	}
	return nil
}

func (m *Manager) saveSignals(sessionID int64, signals []Signal) {
	for _, sig := range signals {
		sig.SessionID = sessionID
		data, _ := json.Marshal(sig)
		log.Printf("signal: %s", string(data))
		_, err := m.db.Exec(
			`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status)
			 VALUES (?, ?, ?, ?, 'signal', ?, ?, 'signal')`,
			sessionID, fmt.Sprintf("sig_%d", time.Now().UnixNano()),
			sig.Symbol, sig.Side, sig.Price, sig.Quantity,
		)
		if err != nil {
			log.Printf("error saving signal: %v", err)
		}
	}
}
