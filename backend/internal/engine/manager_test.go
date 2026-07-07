package engine

import (
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/service"
	_ "modernc.org/sqlite"
)

func setupManager(t *testing.T) *Manager {
	t.Helper()
	return NewManager(nil, nil, service.NewNotifier("", ""), NewWSHub("test"), nil)
}

func setupManagerWithDB(t *testing.T) (*Manager, *sqlx.DB) {
	t.Helper()
	f, _ := os.CreateTemp("", "mgr-*.db")
	db, err := sqlx.Open("sqlite", f.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close(); os.Remove(f.Name()) })
	db.Exec(`CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, order_id TEXT,
		symbol TEXT, side TEXT, type TEXT, price TEXT, quantity TEXT, status TEXT,
		executed_qty TEXT DEFAULT '0', executed_price TEXT DEFAULT '0', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`)
	m := NewManager(nil, db, service.NewNotifier("", ""), NewWSHub("test"), nil)
	return m, db
}

func TestManager_Start_AddsSession(t *testing.T) {
	m := setupManager(t)
	session := model.Session{ID: 1, Strategy: "grid", Mode: "signal", Symbol: "BTC_USDT"}

	err := m.Start(session)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if !m.IsRunning(1) {
		t.Error("expected session 1 to be running")
	}
	m.Stop(1)
}

func TestManager_Start_Duplicate(t *testing.T) {
	m := setupManager(t)
	session := model.Session{ID: 1, Strategy: "grid", Mode: "signal", Symbol: "BTC_USDT"}

	m.Start(session)
	err := m.Start(session)
	if err != ErrSessionRunning {
		t.Errorf("expected ErrSessionRunning, got %v", err)
	}
	m.Stop(1)
}

func TestManager_Stop_RemovesSession(t *testing.T) {
	m := setupManager(t)
	m.Start(model.Session{ID: 1, Strategy: "grid", Mode: "signal"})

	m.Stop(1)

	if m.IsRunning(1) {
		t.Error("expected session 1 to be stopped")
	}
}

func TestManager_IsRunning_ReturnsFalseForUnknown(t *testing.T) {
	m := setupManager(t)
	if m.IsRunning(999) {
		t.Error("expected false for unknown session")
	}
}

func TestManager_StopAll_StopsAllSessions(t *testing.T) {
	m := setupManager(t)
	m.Start(model.Session{ID: 1, Strategy: "grid", Mode: "signal"})
	m.Start(model.Session{ID: 2, Strategy: "trend", Mode: "signal"})
	m.Start(model.Session{ID: 3, Strategy: "dca", Mode: "paper"})

	m.StopAll()

	if m.IsRunning(1) || m.IsRunning(2) || m.IsRunning(3) {
		t.Error("expected all sessions to be stopped after StopAll")
	}
}

func TestManager_SaveSignals(t *testing.T) {
	m, db := setupManagerWithDB(t)

	signals := []Signal{
		{Side: "buy", Price: "50000", Quantity: "0.01", Reason: "test", Symbol: "BTC_USDT"},
		{Side: "sell", Price: "51000", Quantity: "0.01", Reason: "test", Symbol: "BTC_USDT"},
	}

	m.saveSignals(1, signals)

	var count int
	db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1")
	if count != 2 {
		t.Errorf("expected 2 orders saved, got %d", count)
	}
}

func TestManager_SaveSignals_Empty(t *testing.T) {
	m, db := setupManagerWithDB(t)

	m.saveSignals(1, nil) // should not insert anything

	var count int
	db.Get(&count, "SELECT COUNT(*) FROM orders")
	if count != 0 {
		t.Errorf("expected 0 orders for empty signals, got %d", count)
	}
}
