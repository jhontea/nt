package engine

import (
	"os"
	"testing"
	"time"

	"math"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	_ "modernc.org/sqlite"
)

func setupDCA(t *testing.T) (*DCAEngine, *sqlx.DB) {
	t.Helper()
	f, _ := os.CreateTemp("", "dca-*.db")
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
	db.Exec("INSERT INTO sessions (id, virtual_balance) VALUES (1, 1000)")
	return NewDCAEngine(nil, db), db
}

func TestDCAEngine_BuySignalOnInterval(t *testing.T) {
	d, _ := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	cfg := DCAConfig{IntervalSec: 0, Amount: "100", TakeProfitPct: 0} // always triggers

	signals := d.evaluate(session, cfg, 50000, "50000.00")
	if len(signals) != 1 {
		t.Fatalf("expected 1 buy signal, got %d", len(signals))
	}
	if signals[0].Side != "buy" {
		t.Errorf("expected buy side, got %s", signals[0].Side)
	}
	qty := 100.0 / 50000.0 // amount / price
	expectedQty := strconv.FormatFloat(math.Round(qty*1e8)/1e8, 'f', 8, 64)
	if signals[0].Quantity != expectedQty {
		t.Errorf("expected qty %s, got %s", expectedQty, signals[0].Quantity)
	}
}

func TestDCAEngine_NoBuyBeforeInterval(t *testing.T) {
	d, _ := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	cfg := DCAConfig{IntervalSec: 3600, Amount: "100", TakeProfitPct: 0} // 1 hour

	// First call should trigger buy (lastBuy doesn't exist)
	signals := d.evaluate(session, cfg, 50000, "50000.00")
	if len(signals) != 1 {
		t.Fatal("expected first call to trigger buy")
	}

	// Set lastBuy to now (simulate recent buy)
	d.lastBuy[session.ID] = time.Now()

	// Second call should NOT trigger buy (interval not elapsed)
	signals = d.evaluate(session, cfg, 51000, "51000.00")
	if len(signals) != 0 {
		t.Errorf("expected 0 signals (interval not elapsed), got %d", len(signals))
	}
}

func TestDCAEngine_TakeProfit(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// Simulate a prior filled buy order for avgBuyPrice calculation
	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")

	// Set avgBuyPrice directly to simulate existing position
	d.avgBuyPrice[session.ID] = 50000
	d.lastBuy[session.ID] = time.Now()

	cfg := DCAConfig{IntervalSec: 3600, Amount: "100", TakeProfitPct: 10} // 10% take-profit

	// Current price below target (50000 * 1.10 = 55000) — no sell
	signals := d.evaluate(session, cfg, 54000, "54000.00")
	if len(signals) != 0 {
		t.Errorf("expected 0 signals (below take-profit), got %d", len(signals))
	}

	// Current price at/above target — should trigger sell
	signals = d.evaluate(session, cfg, 56000, "56000.00")
	if len(signals) != 1 {
		t.Fatalf("expected 1 sell signal (take-profit), got %d", len(signals))
	}
	if signals[0].Side != "sell" {
		t.Errorf("expected sell side, got %s", signals[0].Side)
	}
}

func TestDCAEngine_TakeProfitNoPosition(t *testing.T) {
	d, _ := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	cfg := DCAConfig{IntervalSec: 3600, Amount: "100", TakeProfitPct: 10}

	// No buy yet, avgBuyPrice is 0 — should not trigger sell
	d.lastBuy[session.ID] = time.Now()
	signals := d.evaluate(session, cfg, 56000, "56000.00")
	if len(signals) != 0 {
		t.Errorf("expected 0 signals (no avgBuyPrice), got %d", len(signals))
	}
}

func TestDCAEngine_Reset(t *testing.T) {
	d, _ := setupDCA(t)
	d.lastBuy[1] = time.Now()
	d.avgBuyPrice[1] = 50000

	d.Reset(1)

	if _, ok := d.lastBuy[1]; ok {
		t.Error("expected lastBuy to be cleared after Reset")
	}
	if _, ok := d.avgBuyPrice[1]; ok {
		t.Error("expected avgBuyPrice to be cleared after Reset")
	}
}

func TestDCAEngine_UpdateAvgPrice(t *testing.T) {
	d, db := setupDCA(t)
	sessionID := int64(1)

	// First buy at 50000
	d.updateAvgPrice(sessionID, "BTC_USDT", 50000, 0.002)
	if d.avgBuyPrice[sessionID] != 50000 {
		t.Errorf("expected avgBuyPrice 50000, got %.2f", d.avgBuyPrice[sessionID])
	}

	// Simulate filled order for existingQty
	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		sessionID, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")

	// Second buy at higher price
	d.updateAvgPrice(sessionID, "BTC_USDT", 55000, 0.002)
	expected := ((50000 * 0.002) + (55000 * 0.002)) / 0.004 // 52500
	if d.avgBuyPrice[sessionID] != expected {
		t.Errorf("expected avgBuyPrice %.2f, got %.2f", expected, d.avgBuyPrice[sessionID])
	}
}

func TestDCAEngine_StopLossTriggered(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
	d.avgBuyPrice[session.ID] = 50000
	d.lastBuy[session.ID] = time.Now() // prevent interval buy

	// Price drops 12% (threshold at 10%): 50000 * 0.9 = 45000, 44000 < 45000
	cfg := DCAConfig{IntervalSec: 9999, Amount: "100", StopLossPct: 10}
	signals := d.evaluate(session, cfg, 44000, "44000.00")

	if len(signals) != 1 {
		t.Fatalf("expected 1 sell signal, got %d", len(signals))
	}
	if signals[0].Side != "sell" {
		t.Errorf("expected sell, got %s", signals[0].Side)
	}
	if signals[0].Reason != "dca_stop_loss" {
		t.Errorf("expected reason dca_stop_loss, got %s", signals[0].Reason)
	}
}

func TestDCAEngine_StopLossNotTriggeredAboveThreshold(t *testing.T) {
	d, db := setupDCA(t) //nolint
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
	d.avgBuyPrice[session.ID] = 50000

	// Price drops 5% only (threshold at 10%): 50000 * 0.9 = 45000, 47500 > 45000
	cfg := DCAConfig{IntervalSec: 9999, Amount: "100", StopLossPct: 10}
	signals := d.evaluate(session, cfg, 47500, "47500.00")

	for _, s := range signals {
		if s.Side == "sell" && s.Reason == "dca_stop_loss" {
			t.Error("stop loss should not trigger above threshold")
		}
	}
}

func TestDCAEngine_StopLossDisabledWhenZero(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
	d.avgBuyPrice[session.ID] = 50000
	d.lastBuy[session.ID] = time.Now() // prevent interval buy

	cfg := DCAConfig{IntervalSec: 9999, Amount: "100", StopLossPct: 0}
	signals := d.evaluate(session, cfg, 1, "1.00") // extreme drop, SL disabled

	for _, s := range signals {
		if s.Reason == "dca_stop_loss" {
			t.Error("stop loss should be disabled when StopLossPct=0")
		}
	}
}

func TestDCAEngine_NoDoubleSell_TPAndSL(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
	d.avgBuyPrice[session.ID] = 50000
	d.lastBuy[session.ID] = time.Now() // prevent interval buy

	// Price at take-profit level (>10% up), both TP and SL configured
	cfg := DCAConfig{IntervalSec: 9999, TakeProfitPct: 10, StopLossPct: 10}
	signals := d.evaluate(session, cfg, 56000, "56000.00")

	sellCount := 0
	for _, s := range signals {
		if s.Side == "sell" {
			sellCount++
		}
	}
	if sellCount > 1 {
		t.Errorf("expected at most 1 sell signal, got %d", sellCount)
	}
}

func TestDCAEngine_StopLossAfterMultipleBuys(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// Two buys: 0.002 @ 50000 and 0.002 @ 40000 -> avg = 45000
	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
		1, "BTC_USDT", "buy", "market", "40000", "0.002", "filled")
	d.avgBuyPrice[session.ID] = 45000 // (50000+40000)/2
	d.lastBuy[session.ID] = time.Now() // prevent interval buy

	// SL at 10% -> threshold = 45000 * 0.9 = 40500, price 40000 < 40500
	cfg := DCAConfig{IntervalSec: 9999, StopLossPct: 10}
	signals := d.evaluate(session, cfg, 40000, "40000.00")

	if len(signals) != 1 || signals[0].Reason != "dca_stop_loss" {
		t.Errorf("expected dca_stop_loss signal, got %v", signals)
	}
	expectedQty := strconv.FormatFloat(math.Round(0.004*1e8)/1e8, 'f', 8, 64)
	if signals[0].Quantity != expectedQty {
		t.Errorf("expected qty %s, got %s", expectedQty, signals[0].Quantity)
	}
}
