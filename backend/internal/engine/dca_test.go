package engine

import (
	"math"
	"os"
	"strconv"
	"testing"
	"time"

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
	cfg := DCAConfig{IntervalSec: 0, Amount: "100"}

	signals := d.evaluate(session, cfg, 50000, "50000.00")
	if len(signals) != 1 {
		t.Fatalf("expected 1 buy signal, got %d", len(signals))
	}
	if signals[0].Side != "buy" {
		t.Errorf("expected buy side, got %s", signals[0].Side)
	}
	expectedQty := strconv.FormatFloat(math.Round((100.0/50000.0)*1e8)/1e8, 'f', 8, 64)
	if signals[0].Quantity != expectedQty {
		t.Errorf("expected qty %s, got %s", expectedQty, signals[0].Quantity)
	}
}

func TestDCAEngine_NoBuyBeforeInterval(t *testing.T) {
	d, _ := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}
	cfg := DCAConfig{IntervalSec: 3600, Amount: "100"}

	d.evaluate(session, cfg, 50000, "50000.00")
	d.lastBuy[session.ID] = time.Now()

	signals := d.evaluate(session, cfg, 51000, "51000.00")
	if len(signals) != 0 {
		t.Errorf("expected 0 signals before interval, got %d", len(signals))
	}
}

func TestDCAEngine_Reset(t *testing.T) {
	d, _ := setupDCA(t)
	d.lastBuy[1] = time.Now()
	d.avgBuyPrice[1] = 50000

	d.Reset(1)

	if _, ok := d.lastBuy[1]; ok {
		t.Error("expected lastBuy cleared after Reset")
	}
	if _, ok := d.avgBuyPrice[1]; ok {
		t.Error("expected avgBuyPrice cleared after Reset")
	}
}

func TestDCAEngine_TakeProfitTriggered(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (1,'BTC_USDT','buy','market','50000','0.002','signal')")
	d.avgBuyPrice[session.ID] = 50000
	d.lastBuy[session.ID] = time.Now()

	cfg := DCAConfig{IntervalSec: 9999, Amount: "100", TakeProfitPct: 10}
	signals := d.evaluate(session, cfg, 56000, "56000.00") // 50000*1.1=55000, 56000>55000

	if len(signals) != 1 || signals[0].Side != "sell" || signals[0].Reason != "dca_take_profit" {
		t.Errorf("expected take-profit sell, got %v", signals)
	}
}

func TestDCAEngine_StopLossTriggered(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (1,'BTC_USDT','buy','market','50000','0.002','signal')")
	d.avgBuyPrice[session.ID] = 50000
	d.lastBuy[session.ID] = time.Now()

	cfg := DCAConfig{IntervalSec: 9999, Amount: "100", StopLossPct: 10}
	signals := d.evaluate(session, cfg, 44000, "44000.00") // 50000*0.9=45000, 44000<45000

	if len(signals) != 1 || signals[0].Side != "sell" || signals[0].Reason != "dca_stop_loss" {
		t.Errorf("expected stop-loss sell, got %v", signals)
	}
}

func TestDCAEngine_NoDoubleSell(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (1,'BTC_USDT','buy','market','50000','0.002','signal')")
	d.avgBuyPrice[session.ID] = 50000
	d.lastBuy[session.ID] = time.Now()

	cfg := DCAConfig{IntervalSec: 9999, TakeProfitPct: 10, StopLossPct: 10}
	signals := d.evaluate(session, cfg, 56000, "56000.00")

	sellCount := 0
	for _, s := range signals {
		if s.Side == "sell" {
			sellCount++
		}
	}
	if sellCount > 1 {
		t.Errorf("expected at most 1 sell, got %d", sellCount)
	}
}
