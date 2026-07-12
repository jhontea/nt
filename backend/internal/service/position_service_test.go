package service

import (
	"context"
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

func setupPositionService(t *testing.T) (*PositionService, *sqlx.DB) {
	t.Helper()
	file, err := os.CreateTemp("", "position-*.db")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sqlx.Open("sqlite", file.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		os.Remove(file.Name())
	})
	_, err = db.Exec(`CREATE TABLE orders (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id INTEGER,
		symbol TEXT,
		side TEXT,
		status TEXT,
		executed_qty TEXT
	)`)
	if err != nil {
		t.Fatal(err)
	}
	return NewPositionService(db), db
}

func TestPositionServiceUsesExecutedBuyMinusSell(t *testing.T) {
	service, db := setupPositionService(t)
	orders := []struct {
		sessionID int64
		symbol    string
		side      string
		status    string
		qty       string
	}{
		{1, "BTC_IDR", "buy", "filled", "0.01000000"},
		{1, "BTC_IDR", "buy", "partial", "0.00250000"},
		{1, "BTC_IDR", "sell", "filled", "0.00400000"},
		{1, "BTC_IDR", "buy", "new", "99"},
		{2, "BTC_IDR", "buy", "filled", "0.50000000"},
		{1, "ETH_IDR", "buy", "filled", "1.5"},
	}
	for _, order := range orders {
		_, err := db.Exec(`INSERT INTO orders (session_id, symbol, side, status, executed_qty) VALUES (?, ?, ?, ?, ?)`,
			order.sessionID, order.symbol, order.side, order.status, order.qty)
		if err != nil {
			t.Fatal(err)
		}
	}

	position, err := service.GetSessionPosition(context.Background(), 1, "BTC_IDR")
	if err != nil {
		t.Fatal(err)
	}
	if position.BoughtQty != "0.0125" || position.SoldQty != "0.004" || position.NetQty != "0.0085" {
		t.Fatalf("unexpected position: %+v", position)
	}
}

func TestMinDecimalString(t *testing.T) {
	got, err := MinDecimalString("0.00850000", "0.00799999")
	if err != nil {
		t.Fatal(err)
	}
	if got != "0.00799999" {
		t.Fatalf("got %q, want 0.00799999", got)
	}
}
