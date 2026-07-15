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
	d.lastBuyPrice[1] = 50000
	d.lastSellPrice[1] = 55000
	d.avgBuyPrice[1] = 50000

	d.Reset(1)

	if _, ok := d.lastBuy[1]; ok {
		t.Error("expected lastBuy cleared after Reset")
	}
	if _, ok := d.lastBuyPrice[1]; ok {
		t.Error("expected lastBuyPrice cleared after Reset")
	}
	if _, ok := d.lastSellPrice[1]; ok {
		t.Error("expected lastSellPrice cleared after Reset")
	}
	if _, ok := d.avgBuyPrice[1]; ok {
		t.Error("expected avgBuyPrice cleared after Reset")
	}
}

func TestDCAEngine_HoldsReentryAboveConfirmedSellUntilNextInterval(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_IDR"}
	_, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		VALUES (1, 'sell-1', 'BTC_IDR', 'sell', 'market', '55000', '1', 'filled', '1', '55000')`)
	if err != nil {
		t.Fatal(err)
	}
	d.ConfirmSell(session.ID, session.Symbol)

	signals := d.evaluate(session, DCAConfig{IntervalSec: 3600, Amount: "100"}, 56000, "56000")
	if len(signals) != 0 {
		t.Fatalf("expected re-entry hold above sell price, got %+v", signals)
	}

	d.lastBuy[session.ID] = time.Now().Add(-2 * time.Hour)
	signals = d.evaluate(session, DCAConfig{IntervalSec: 3600, Amount: "100"}, 56000, "56000")
	if len(signals) != 1 || signals[0].Side != "buy" || signals[0].Reason != "dca_interval" {
		t.Fatalf("expected buy after next interval, got %+v", signals)
	}
}

func TestDCAEngine_ReentersBelowConfirmedSellBeforeInterval(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_IDR"}
	_, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		VALUES (1, 'sell-1', 'BTC_IDR', 'sell', 'market', '55000', '1', 'filled', '1', '55000')`)
	if err != nil {
		t.Fatal(err)
	}
	d.ConfirmSell(session.ID, session.Symbol)

	signals := d.evaluate(session, DCAConfig{IntervalSec: 3600, Amount: "100"}, 54000, "54000")
	if len(signals) != 1 || signals[0].Side != "buy" || signals[0].Reason != "dca_reentry_below_sell" {
		t.Fatalf("expected early re-entry below sell price, got %+v", signals)
	}
}

func TestDCAEngine_RestoresSellReentryHoldAfterRestart(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_IDR"}
	_, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		VALUES (1, 'sell-1', 'BTC_IDR', 'sell', 'market', '55000', '1', 'filled', '1', '55000')`)
	if err != nil {
		t.Fatal(err)
	}

	signals := d.evaluate(session, DCAConfig{IntervalSec: 3600, Amount: "100"}, 56000, "56000")
	if len(signals) != 0 {
		t.Fatalf("expected restored re-entry hold above sell price, got %+v", signals)
	}
	if got := d.lastSellPrice[session.ID]; got != 55000 {
		t.Fatalf("restored sell price = %v, want 55000", got)
	}
}

func TestDCAEngine_RestoresReconciledBuyAverage(t *testing.T) {
	d, db := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_IDR"}
	d.lastBuy[session.ID] = time.Now() // execution attempt happened, result arrived asynchronously
	_, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		VALUES (1, '123', 'BTC_IDR', 'buy', 'market', '1000000000', '0.001', 'filled', '0.001', '1000000000')`)
	if err != nil {
		t.Fatal(err)
	}

	d.evaluate(session, DCAConfig{IntervalSec: 3600, Amount: "100000"}, 1000000000, "1000000000")
	if got := d.avgBuyPrice[session.ID]; got != 1000000000 {
		t.Fatalf("restored average = %v, want 1000000000", got)
	}
}

func TestDCAEngine_ConfirmBuyUsesExecutedFillNotRequestedOrder(t *testing.T) {
	d, db := setupDCA(t)
	_, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		VALUES (1, 'fill-1', 'BTC_IDR', 'buy', 'market', '1200000000', '0.00003400', 'filled', '0.00003000', '1150000000')`)
	if err != nil {
		t.Fatal(err)
	}

	d.ConfirmBuy(1, "BTC_IDR", nil)
	if got := d.avgBuyPrice[1]; got != 1150000000 {
		t.Fatalf("confirmed avg = %.2f, want executed price 1150000000", got)
	}
	if got := d.lastBuyPrice[1]; got != 1150000000 {
		t.Fatalf("last buy = %.2f, want executed price 1150000000", got)
	}
}

func TestDCAEngine_LiveSellSignalUsesExecutedQuantity(t *testing.T) {
	d, db := setupDCA(t)
	_, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		VALUES (1, 'fill-1', 'BTC_IDR', 'buy', 'market', '1150000000', '0.00003400', 'filled', '0.00003000', '1150000000')`)
	if err != nil {
		t.Fatal(err)
	}
	d.avgBuyPrice[1] = 1150000000
	d.lastBuy[1] = time.Now()

	signals := d.evaluate(model.Session{ID: 1, Symbol: "BTC_IDR"}, DCAConfig{
		IntervalSec: 9999, TakeProfitPct: 1,
	}, 1170000000, "1170000000")
	if len(signals) != 1 || signals[0].Side != "sell" {
		t.Fatalf("expected one sell signal, got %+v", signals)
	}
	if signals[0].Quantity != "0.00003000" {
		t.Fatalf("sell qty = %s, want executed qty 0.00003000", signals[0].Quantity)
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

func TestDCAEngine_DropPct_NoBuyAboveThreshold(t *testing.T) {
	d, _ := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// last buy at 50000, drop 5% required → threshold = 47500
	d.lastBuy[session.ID] = time.Now().Add(-2 * time.Hour) // interval ready
	d.lastBuyPrice[session.ID] = 50000

	cfg := DCAConfig{IntervalSec: 3600, Amount: "100", DropPct: 5}
	signals := d.evaluate(session, cfg, 48000, "48000.00") // 48000 > 47500, not enough drop

	for _, s := range signals {
		if s.Side == "buy" {
			t.Errorf("expected no buy (price not dropped enough), got signal: %+v", s)
		}
	}
}

func TestDCAEngine_DropPct_BuyWhenDropped(t *testing.T) {
	d, _ := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// last buy at 50000, drop 5% required → threshold = 47500
	d.lastBuy[session.ID] = time.Now().Add(-2 * time.Hour) // interval ready
	d.lastBuyPrice[session.ID] = 50000

	cfg := DCAConfig{IntervalSec: 3600, Amount: "100", DropPct: 5}
	signals := d.evaluate(session, cfg, 47000, "47000.00") // 47000 < 47500, drop met

	if len(signals) != 1 || signals[0].Side != "buy" || signals[0].Reason != "dca_drop" {
		t.Errorf("expected 1 dca_drop buy, got %v", signals)
	}
}

func TestDCAEngine_DropPct_FirstBuyAllowed(t *testing.T) {
	d, _ := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	// no prior buy, drop_pct set — should allow first buy
	cfg := DCAConfig{IntervalSec: 3600, Amount: "100", DropPct: 5}
	signals := d.evaluate(session, cfg, 50000, "50000.00")

	if len(signals) != 1 || signals[0].Side != "buy" {
		t.Errorf("expected first buy allowed, got %v", signals)
	}
}

func TestDCAEngine_DropPct_DisabledFallsBackToInterval(t *testing.T) {
	d, _ := setupDCA(t)
	session := model.Session{ID: 1, Symbol: "BTC_USDT"}

	d.lastBuy[session.ID] = time.Now().Add(-2 * time.Hour)
	d.lastBuyPrice[session.ID] = 50000

	// drop_pct = 0 → interval only, should buy regardless of price
	cfg := DCAConfig{IntervalSec: 3600, Amount: "100", DropPct: 0}
	signals := d.evaluate(session, cfg, 55000, "55000.00") // price went up, no drop

	if len(signals) != 1 || signals[0].Side != "buy" {
		t.Errorf("expected interval buy regardless of price when drop_pct=0, got %v", signals)
	}
}
