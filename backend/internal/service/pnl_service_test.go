package service

import (
	"context"
	"math"
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

type pnlOrderFixture struct {
	id        int
	side      string
	status    string
	qty       string
	execQty   string
	execPrice string
	createdAt string
}

func insertPnLFixture(t *testing.T, db *sqlx.DB, o pnlOrderFixture) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO orders
		(id, session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, created_at)
		VALUES (?, 1, ?, 'BTC_IDR', ?, 'market', ?, ?, ?, ?, ?, ?)`,
		o.id, o.id, o.side, o.execPrice, o.qty, o.status, o.execQty, o.execPrice, o.createdAt)
	if err != nil {
		t.Fatal(err)
	}
}

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

	// Realized P&L is reconstructed from filled orders, not the cached pnl in trades.
	db := s.db
	db.Exec("INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?,?,?,?,?,?,?,?,?,?)",
		1, "ord1", "BTC_USDT", "buy", "market", "50000", "0.01", "filled", "0.01", "50000")
	db.Exec("INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?,?,?,?,?,?,?,?,?,?)",
		1, "ord2", "BTC_USDT", "sell", "market", "55000", "0.01", "filled", "0.01", "55000")
	// Detail/list must rebuild from orders and remain independent from cached
	// transaction P&L used by notifications.
	db.Exec("INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl) VALUES (?,?,?,?,?,?,?,?,?)",
		1, "ord2", "BTC_USDT", "sell", "55000", "0.01", "0", "USDT", "999999.00")

	summary, err := s.GetSessionPnL(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}

	if summary.TradeCount != 2 {
		t.Errorf("expected 2 filled orders, got %d", summary.TradeCount)
	}
	if summary.WinCount != 1 {
		t.Errorf("expected 1 win, got %d", summary.WinCount)
	}
	if summary.LossCount != 0 {
		t.Errorf("expected 0 losses, got %d", summary.LossCount)
	}
	if summary.RealizedPnL != "50.00" {
		t.Errorf("expected realized PnL 50.00, got %s", summary.RealizedPnL)
	}
	if summary.WinRate != 100 {
		t.Errorf("expected win rate 100, got %f", summary.WinRate)
	}
	if summary.Balance != 1050 {
		t.Errorf("expected balance 1050, got %.2f", summary.Balance)
	}
}

func TestPnLService_RealHistoryUsesFIFOAndExecutedValues(t *testing.T) {
	s := setupPnLDB(t)
	fixtures := []pnlOrderFixture{
		{67, "buy", "filled", "0.00003481", "0.00003000", "1149940333.34", "2026-07-12 07:28:51"},
		{69, "sell", "filled", "0.00003000", "0.00003000", "1151377333.33", "2026-07-12 08:12:08"},
		{72, "buy", "filled", "0.00003473", "0.00003000", "1151825666.67", "2026-07-12 08:43:18"},
		{73, "buy", "filled", "0.00003486", "0.00003000", "1148529333.34", "2026-07-12 09:25:34"},
		{78, "sell", "filled", "0.00006000", "0.00006000", "1150906166.66", "2026-07-12 09:59:42"},
		{80, "buy", "filled", "0.00003474", "0.00003000", "1151523333.34", "2026-07-12 10:02:16"},
		{82, "buy", "filled", "0.00003477", "0.00003000", "1150256000", "2026-07-12 10:31:01"},
		{83, "buy", "filled", "0.00003482", "0.00003000", "1149734666.67", "2026-07-12 10:50:31"},
		{92, "sell", "filled", "0.00009000", "0.00009000", "1151497444.44", "2026-07-12 11:37:00"},
		{93, "buy", "filled", "0.00003477", "0.00003000", "1152406333.34", "2026-07-12 11:37:30"},
		{94, "buy", "filled", "0.00003471", "0.00003000", "1152391333.34", "2026-07-12 11:39:30"},
		{105, "sell", "filled", "0.00006000", "0.00006000", "1153488833.33", "2026-07-12 12:13:30"},
		{106, "buy", "filled", "0.00003466", "0.00003000", "1154143666.67", "2026-07-12 12:14:00"},
		{109, "buy", "rejected", "0.00003471", "0", "0", "2026-07-12 12:24:30"},
		{113, "buy", "filled", "0.00003469", "0.00003000", "1152752666.67", "2026-07-12 12:35:00"},
	}
	for _, fixture := range fixtures {
		insertPnLFixture(t, s.db, fixture)
	}

	summary, err := s.GetSessionPnL(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if summary.RealizedPnL != "241.58" {
		t.Fatalf("realized P&L = %s, want 241.58", summary.RealizedPnL)
	}
	if summary.TradeCount != 14 || summary.WinCount != 4 || summary.LossCount != 0 || summary.WinRate != 100 {
		t.Fatalf("unexpected trade stats: %+v", summary)
	}

	position, err := s.GetHoldingPosition(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(position.TotalQty-0.00006) > 1e-12 {
		t.Fatalf("open qty = %.8f, want 0.00006000", position.TotalQty)
	}
	if math.Abs(position.AvgPrice-1153448166.67) > 0.01 {
		t.Fatalf("open average = %.2f, want 1153448166.67", position.AvgPrice)
	}
}

func TestPnLService_GetOrdersHidesUnexecutedTerminalOrders(t *testing.T) {
	s := setupPnLDB(t)
	insertPnLFixture(t, s.db, pnlOrderFixture{1, "buy", "rejected", "0.01", "0", "0", "2026-07-12 10:00:00"})
	insertPnLFixture(t, s.db, pnlOrderFixture{2, "buy", "filled", "0.01", "0.009", "100", "2026-07-12 10:01:00"})

	orders, err := s.GetOrders(context.Background(), 1, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(orders) != 1 || orders[0].ID != 2 {
		t.Fatalf("orders = %+v, want only executed order id=2", orders)
	}
}

func TestPnLService_GetOrders_ReturnsLatest(t *testing.T) {
	s := setupPnLDB(t)

	db := s.db
	db.Exec("INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status) VALUES (?,?,?,?,?,?,?,?)",
		1, "o1", "BTC_USDT", "buy", "market", "50000", "0.01", "filled")
	db.Exec("INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status) VALUES (?,?,?,?,?,?,?,?)",
		1, "o2", "ETH_USDT", "sell", "limit", "3100", "0.1", "open")

	orders, err := s.GetOrders(context.Background(), 1, 0, 10)
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

	orders, err := s.GetOrders(context.Background(), 1, 0, 10)
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
