package engine

import (
	"math"
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	_ "modernc.org/sqlite"
)

func setupPaperDB(t *testing.T) *PaperEngine {
	t.Helper()
	f, _ := os.CreateTemp("", "paper-*.db")
	db, err := sqlx.Open("sqlite", f.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close(); os.Remove(f.Name()) })
	_, err = db.Exec(`
		CREATE TABLE sessions (id INTEGER PRIMARY KEY, virtual_balance REAL DEFAULT 0);
		CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, order_id TEXT,
			symbol TEXT, side TEXT, type TEXT, price TEXT, quantity TEXT, status TEXT,
			executed_qty TEXT DEFAULT '0', executed_price TEXT DEFAULT '0', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
		CREATE TABLE trades (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, order_id TEXT,
			symbol TEXT, side TEXT, price TEXT, quantity TEXT, fee TEXT, fee_asset TEXT,
			pnl TEXT, traded_at DATETIME DEFAULT CURRENT_TIMESTAMP);
	`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec("INSERT INTO sessions (id, virtual_balance) VALUES (1, 1000)")
	if err != nil {
		t.Fatal(err)
	}
	return NewPaperEngine(db, nil, nil, nil)
}

func TestPaperEngine_Buy_DeductsBalance(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	err := p.executeBuy(session, "50000", "50000", "0.01")
	if err != nil {
		t.Fatalf("executeBuy failed: %v", err)
	}

	bal, err := p.getBalance(1)
	if err != nil {
		t.Fatal(err)
	}
	expected := 1000 - (50000 * 0.01) // 500
	if math.Abs(bal-expected) > 0.01 {
		t.Errorf("expected balance %.2f, got %.2f", expected, bal)
	}
}

func TestPaperEngine_Buy_InsufficientBalance(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// Try to buy more than balance allows: 0.1 BTC @ 50000 = 5000 > 1000
	err := p.executeBuy(session, "50000", "50000", "0.1")
	if err != nil {
		t.Fatalf("executeBuy failed (should not return error for insufficient): %v", err)
	}

	// Balance should remain unchanged
	bal, _ := p.getBalance(1)
	if math.Abs(bal-1000) > 0.01 {
		t.Errorf("expected balance 1000 (unchanged), got %.2f", bal)
	}
}

func TestPaperEngine_Buy_Deduplicate(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// First buy should succeed
	err := p.executeBuy(session, "50000", "50000", "0.01")
	if err != nil {
		t.Fatal(err)
	}

	// Second buy at same price should be skipped (dedup)
	err = p.executeBuy(session, "50000", "50000", "0.01")
	if err != nil {
		t.Fatal(err)
	}

	bal, _ := p.getBalance(1)
	expected := 1000 - (50000 * 0.01) // still 500, only deducted once
	if math.Abs(bal-expected) > 0.01 {
		t.Errorf("expected balance %.2f after dedup (should deduct once), got %.2f", expected, bal)
	}
}

func TestPaperEngine_BuySell_Profit(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// Buy 0.01 BTC @ 50000
	err := p.executeBuy(session, "50000", "50000", "0.01")
	if err != nil {
		t.Fatal(err)
	}

	// Sell 0.01 BTC @ 55000 (profit: 50000 * 0.01 = 500 profit)
	err = p.executeSell(session, "50000", "55000", "0.01")
	if err != nil {
		t.Fatalf("executeSell failed: %v", err)
	}

	// Check trade recorded with correct PnL
	var pnl string
	err = p.db.Get(&pnl, "SELECT pnl FROM trades WHERE session_id=1")
	if err != nil {
		t.Fatal(err)
	}

	bal, _ := p.getBalance(1)
	expectedBal := 1000.0 + (55000-50000)*0.01 // 1050
	if math.Abs(bal-expectedBal) > 0.01 {
		t.Errorf("expected balance %.2f, got %.2f", expectedBal, bal)
	}
}

func TestPaperEngine_Sell_NoMatchingBuy(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// Sell without a prior buy — should be no-op (no error)
	err := p.executeSell(session, "50000", "55000", "0.01")
	if err != nil {
		t.Fatalf("expected sell with no matching buy to succeed (no-op), got: %v", err)
	}

	bal, _ := p.getBalance(1)
	if math.Abs(bal-1000) > 0.01 {
		t.Errorf("expected balance 1000 (unchanged), got %.2f", bal)
	}
}
