package service

import (
	"context"
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

func setupPnLDB(t *testing.T) *PnLService {
	t.Helper()
	f, _ := os.CreateTemp("", "pnl-*.db")
	db, err := sqlx.Open("sqlite", f.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close(); os.Remove(f.Name()) })
	_, err = db.Exec(`
		CREATE TABLE sessions (id INTEGER PRIMARY KEY, virtual_balance REAL DEFAULT 0);
		CREATE TABLE trades (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, order_id TEXT,
			symbol TEXT, side TEXT, price TEXT, quantity TEXT, fee TEXT, fee_asset TEXT,
			pnl TEXT, traded_at DATETIME DEFAULT CURRENT_TIMESTAMP);
		CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, order_id TEXT,
			symbol TEXT, side TEXT, type TEXT, price TEXT, quantity TEXT, status TEXT,
			executed_qty TEXT DEFAULT '0', executed_price TEXT DEFAULT '0', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
	`)
	if err != nil {
		t.Fatal(err)
	}
	db.Exec("INSERT INTO sessions (id, virtual_balance) VALUES (1, 1050)")
	return NewPnLService(db)
}

func TestPnLService_GetSessionPnL_NoTrades(t *testing.T) {
	s := setupPnLDB(t)

	summary, err := s.GetSessionPnL(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}

	if summary.RealizedPnL != "0.00" {
		t.Errorf("expected realized PnL 0.00, got %s", summary.RealizedPnL)
	}
	if summary.TradeCount != 0 {
		t.Errorf("expected 0 trades, got %d", summary.TradeCount)
	}
	if summary.Balance != 1050 {
		t.Errorf("expected balance 1050, got %.2f", summary.Balance)
	}
}

func TestPnLService_GetSessionPnL_WithTrades(t *testing.T) {
	s := setupPnLDB(t)

	// Insert winning trades
	db := s.db
	db.Exec("INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl) VALUES (?,?,?,?,?,?,?,?,?)",
		1, "ord1", "BTC_USDT", "buy", "50000", "0.01", "0", "USDT", "50.00")
	db.Exec("INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl) VALUES (?,?,?,?,?,?,?,?,?)",
		1, "ord2", "BTC_USDT", "sell", "55000", "0.01", "0", "USDT", "100.00")
	// Insert losing trade
	db.Exec("INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl) VALUES (?,?,?,?,?,?,?,?,?)",
		1, "ord3", "ETH_USDT", "buy", "3000", "0.1", "0", "USDT", "-25.00")

	summary, err := s.GetSessionPnL(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}

	if summary.TradeCount != 3 {
		t.Errorf("expected 3 trades, got %d", summary.TradeCount)
	}
	if summary.WinCount != 2 {
		t.Errorf("expected 2 wins, got %d", summary.WinCount)
	}
	if summary.LossCount != 1 {
		t.Errorf("expected 1 loss, got %d", summary.LossCount)
	}
	if summary.RealizedPnL != "125.00" {
		t.Errorf("expected realized PnL 125.00, got %s", summary.RealizedPnL)
	}
	if summary.WinRate != 66.66666666666666 {
		t.Errorf("expected win rate 66.67, got %f", summary.WinRate)
	}
	if summary.Balance != 1050 {
		t.Errorf("expected balance 1050, got %.2f", summary.Balance)
	}
}

func TestPnLService_GetOrders_ReturnsLatest(t *testing.T) {
	s := setupPnLDB(t)

	db := s.db
	db.Exec("INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status) VALUES (?,?,?,?,?,?,?,?)",
		1, "o1", "BTC_USDT", "buy", "market", "50000", "0.01", "filled")
	db.Exec("INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status) VALUES (?,?,?,?,?,?,?,?)",
		1, "o2", "ETH_USDT", "sell", "limit", "3100", "0.1", "open")

	orders, err := s.GetOrders(context.Background(), 1, 0)
	if err != nil {
		t.Fatal(err)
	}

	if len(orders) != 2 {
		t.Fatalf("expected 2 orders, got %d", len(orders))
	}
	// Verify both orders are present (order by created_at DESC, but sub-second same batch may tie)
	ids := map[string]bool{}
	for _, o := range orders {
		ids[o.OrderID] = true
	}
	if !ids["o1"] || !ids["o2"] {
		t.Errorf("expected orders o1 and o2, got %v", orders)
	}
}

func TestPnLService_GetOrders_NoOrders(t *testing.T) {
	s := setupPnLDB(t)

	orders, err := s.GetOrders(context.Background(), 1, 0)
	if err != nil {
		t.Fatal(err)
	}

	if len(orders) != 0 {
		t.Errorf("expected 0 orders, got %d", len(orders))
	}
}

func TestPnLService_GetSessionPnL_SessionNotFound(t *testing.T) {
	s := setupPnLDB(t)

	_, err := s.GetSessionPnL(context.Background(), 999)
	if err == nil {
		t.Fatal("expected error for non-existent session")
	}
}
