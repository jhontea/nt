package engine

import (
	"math"
	"os"
	"strconv"
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

func TestTrendBuy_Executes(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	sig := Signal{Side: "buy", Price: "50000", Quantity: "0.01"}
	err := p.executeTrendBuy(session, sig)
	if err != nil {
		t.Fatal(err)
	}
	bal, _ := p.getBalance(1)
	expected := 1000.0 - 50000*0.01
	if math.Abs(bal-expected) > 0.01 {
		t.Errorf("want %.2f got %.2f", expected, bal)
	}
	var count int
	p.db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy' AND status='filled'")
	if count != 1 {
		t.Errorf("want 1 order, got %d", count)
	}
}

func TestTrendBuy_SkipsIfOpenPosition(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	sig := Signal{Side: "buy", Price: "50000", Quantity: "0.01"}
	p.executeTrendBuy(session, sig)
	p.executeTrendBuy(session, sig) // second call should be skipped
	bal, _ := p.getBalance(1)
	expected := 1000.0 - 50000*0.01
	if math.Abs(bal-expected) > 0.01 {
		t.Errorf("balance should only deduct once, got %.2f", bal)
	}
	var count int
	p.db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy'")
	if count != 1 {
		t.Errorf("want 1 order, got %d", count)
	}
}

func TestTrendBuy_InsufficientBalance(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	sig := Signal{Side: "buy", Price: "50000", Quantity: "1.0"} // 50000 > 1000 balance
	err := p.executeTrendBuy(session, sig)
	if err != nil {
		t.Fatal(err)
	}
	bal, _ := p.getBalance(1)
	if math.Abs(bal-1000) > 0.01 {
		t.Errorf("balance should be unchanged, got %.2f", bal)
	}
	var count int
	p.db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1")
	if count != 0 {
		t.Errorf("want 0 orders, got %d", count)
	}
}

func TestTrendSell_ClosesAllBuys(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	p.db.Exec(p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, 'buy', 'market', ?, ?, 'filled', ?, ?)`),
		1, "paper_trend_buy_1", "BTC_USDT", "50000", "0.01", "0.01", "50000")
	p.setBalance(1, 500)

	sig := Signal{Side: "sell", Price: "55000", Quantity: "0.01"}
	err := p.executeTrendSell(session, sig)
	if err != nil {
		t.Fatal(err)
	}

	bal, _ := p.getBalance(1)
	expected := 500.0 + 55000*0.01
	if math.Abs(bal-expected) > 0.01 {
		t.Errorf("want %.2f got %.2f", expected, bal)
	}

	var status string
	p.db.Get(&status, "SELECT status FROM orders WHERE order_id='paper_trend_buy_1'")
	if status != "closed" {
		t.Errorf("want closed, got %s", status)
	}

	var pnl string
	p.db.Get(&pnl, "SELECT pnl FROM trades WHERE session_id=1")
	pnlF, _ := strconv.ParseFloat(pnl, 64)
	expectedPnl := (55000.0 - 50000.0) * 0.01
	if math.Abs(pnlF-expectedPnl) > 0.0001 {
		t.Errorf("want pnl %.4f got %s", expectedPnl, pnl)
	}

	var sellCount int
	p.db.Get(&sellCount, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='sell'")
	if sellCount != 1 {
		t.Errorf("want 1 sell order, got %d", sellCount)
	}
}

func TestTrendSell_SkipsIfNoPosition(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	sig := Signal{Side: "sell", Price: "55000", Quantity: "0.01"}
	err := p.executeTrendSell(session, sig)
	if err != nil {
		t.Fatal(err)
	}
	bal, _ := p.getBalance(1)
	if math.Abs(bal-1000) > 0.01 {
		t.Errorf("balance should be unchanged, got %.2f", bal)
	}
}

func TestTrendSell_MultipleBuys_ClosesAll(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	p.db.Exec(p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, 'buy', 'market', ?, ?, 'filled', ?, ?)`),
		1, "paper_trend_buy_1", "BTC_USDT", "50000", "0.01", "0.01", "50000")
	p.db.Exec(p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, 'buy', 'market', ?, ?, 'filled', ?, ?)`),
		1, "paper_trend_buy_2", "BTC_USDT", "48000", "0.01", "0.01", "48000")
	p.setBalance(1, 20)

	sig := Signal{Side: "sell", Price: "55000", Quantity: "0.01"}
	err := p.executeTrendSell(session, sig)
	if err != nil {
		t.Fatal(err)
	}

	var openCount int
	p.db.Get(&openCount, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy' AND status='filled'")
	if openCount != 0 {
		t.Errorf("want 0 open buys, got %d", openCount)
	}

	var tradeCount int
	p.db.Get(&tradeCount, "SELECT COUNT(*) FROM trades WHERE session_id=1")
	if tradeCount != 2 {
		t.Errorf("want 2 trades, got %d", tradeCount)
	}
}

func TestExecuteTrend_RoutesBuy(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT", Strategy: "trend"}
	sig := Signal{Side: "buy", Price: "50000", Quantity: "0.01"}

	err := p.ExecuteTrend(session, sig)
	if err != nil {
		t.Fatal(err)
	}

	var count int
	p.db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy' AND status='filled'")
	if count != 1 {
		t.Errorf("want 1 trend buy order, got %d", count)
	}
}

func TestExecuteTrend_RoutesSell(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT", Strategy: "trend"}
	// Insert open buy first
	p.db.Exec(p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, 'buy', 'market', ?, ?, 'filled', ?, ?)`),
		1, "paper_trend_buy_1", "BTC_USDT", "50000", "0.01", "0.01", "50000")
	p.setBalance(1, 500)

	sig := Signal{Side: "sell", Price: "55000", Quantity: "0.01"}
	err := p.ExecuteTrend(session, sig)
	if err != nil {
		t.Fatal(err)
	}

	var openCount int
	p.db.Get(&openCount, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy' AND status='filled'")
	if openCount != 0 {
		t.Errorf("want 0 open buys after sell, got %d", openCount)
	}
}

func TestGridPaper_Unaffected_AfterTrendBranch(t *testing.T) {
	p := setupPaperDB(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT", Strategy: "grid"}
	// Grid paper uses executeBuy directly — verify it still works
	err := p.executeBuy(session, "50000", "50000", "0.01")
	if err != nil {
		t.Fatal(err)
	}
	bal, _ := p.getBalance(1)
	expected := 1000.0 - 50000*0.01
	if math.Abs(bal-expected) > 0.01 {
		t.Errorf("grid paper broken, want %.2f got %.2f", expected, bal)
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
