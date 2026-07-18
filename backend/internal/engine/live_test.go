package engine

import (
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

func TestLiveOrderStatus(t *testing.T) {
	tests := []struct {
		name           string
		exchangeStatus int
		want           string
	}{
		{name: "system processing", exchangeStatus: -2, want: string(model.OrdProcessing)},
		{name: "new", exchangeStatus: 0, want: string(model.OrdNew)},
		{name: "partially filled", exchangeStatus: 1, want: string(model.OrdPartial)},
		{name: "filled", exchangeStatus: 2, want: string(model.OrdFilled)},
		{name: "canceled", exchangeStatus: 3, want: string(model.OrdCanceled)},
		{name: "pending cancel", exchangeStatus: 4, want: string(model.OrdPendingCancel)},
		{name: "rejected", exchangeStatus: 5, want: string(model.OrdRejected)},
		{name: "expired", exchangeStatus: 6, want: string(model.OrdExpired)},
		{name: "unknown", exchangeStatus: 999, want: string(model.OrdUnknown)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := liveOrderStatus(tt.exchangeStatus); got != tt.want {
				t.Fatalf("liveOrderStatus(%d) = %q, want %q", tt.exchangeStatus, got, tt.want)
			}
		})
	}
}

func TestValidateBuyBalance(t *testing.T) {
	tests := []struct {
		name    string
		account *tokocrypto.Account
		symbol  string
		amount  string
		wantErr string
	}{
		{
			name:    "sufficient balance including buffer",
			account: &tokocrypto.Account{CanTrade: 1, AccountAssets: []tokocrypto.AccountAsset{{Asset: "USDT", Free: "10.02"}}},
			symbol:  "BTC_USDT",
			amount:  "10",
		},
		{
			name:    "insufficient after buffer",
			account: &tokocrypto.Account{CanTrade: 1, AccountAssets: []tokocrypto.AccountAsset{{Asset: "USDT", Free: "10.01"}}},
			symbol:  "BTC_USDT",
			amount:  "10",
			wantErr: "tidak cukup",
		},
		{
			name:    "missing quote asset",
			account: &tokocrypto.Account{CanTrade: 1, AccountAssets: []tokocrypto.AccountAsset{{Asset: "IDR", Free: "100000"}}},
			symbol:  "BTC_USDT",
			amount:  "10",
			wantErr: "tidak ditemukan",
		},
		{
			name:    "invalid free balance",
			account: &tokocrypto.Account{CanTrade: 1, AccountAssets: []tokocrypto.AccountAsset{{Asset: "USDT", Free: "invalid"}}},
			symbol:  "BTC_USDT",
			amount:  "10",
			wantErr: "tidak valid",
		},
		{
			name:    "trading disabled",
			account: &tokocrypto.Account{CanTrade: 0},
			symbol:  "BTC_USDT",
			amount:  "10",
			wantErr: "tidak diizinkan",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateBuyBalance(tt.account, tt.symbol, tt.amount)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("error = %v, want containing %q", err, tt.wantErr)
			}
		})
	}
}

func TestResolveSellQuantity(t *testing.T) {
	tests := []struct {
		name, strategy, requested, net, want string
	}{
		{name: "grid sells one configured lot", strategy: "grid", requested: "0.00009", net: "0.00018", want: "0.00009"},
		{name: "grid clamps partial position", strategy: "grid", requested: "0.00009", net: "0.00007", want: "0.00007"},
		{name: "dca exits full position", strategy: "dca", requested: "0.00009", net: "0.00018", want: "0.00018"},
		{name: "trend exits full position", strategy: "trend", requested: "0.00009", net: "0.00018", want: "0.00018"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveSellQuantity(tt.strategy, tt.requested, tt.net)
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Fatalf("quantity = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestRiskManagerCheckPosition(t *testing.T) {
	r := NewRiskManager()
	cfg := RiskConfig{MaxPositionValue: 6.2}
	if err := r.CheckPosition(cfg, 6.1); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := r.CheckPosition(cfg, 6.3); err == nil {
		t.Fatal("expected max position error")
	}
}

func TestBuyLockSerializesSameQuoteAsset(t *testing.T) {
	engine := NewLiveEngine(nil, nil)
	first := engine.buyLock("USDT")
	second := engine.buyLock("USDT")
	if first != second {
		t.Fatal("expected the same lock for the same quote asset")
	}

	first.Lock()
	acquired := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		second.Lock()
		close(acquired)
		second.Unlock()
	}()

	select {
	case <-acquired:
		t.Fatal("second buy acquired the lock while first buy was active")
	case <-time.After(25 * time.Millisecond):
	}
	first.Unlock()
	select {
	case <-acquired:
	case <-time.After(time.Second):
		t.Fatal("second buy did not proceed after lock release")
	}
	wg.Wait()
}

func TestComputeLivePnLTx_FIFOExcludesPreviouslySoldLots(t *testing.T) {
	_, db := setupDCA(t)
	fixtures := []struct {
		side, qty, price, created string
	}{
		{"buy", "2", "100", "2026-07-12 10:00:00"},
		{"sell", "1", "110", "2026-07-12 10:01:00"},
		{"buy", "1", "200", "2026-07-12 10:02:00"},
	}
	for i, f := range fixtures {
		_, err := db.Exec(`INSERT INTO orders
			(session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, created_at)
			VALUES (1, ?, 'BTC_IDR', ?, 'market', ?, '999', 'filled', ?, ?, ?)`,
			i+1, f.side, f.price, f.qty, f.price, f.created)
		if err != nil {
			t.Fatal(err)
		}
	}
	tx, err := db.Beginx()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()

	// Remaining FIFO lots are 1 @ 100 and 1 @ 200. Selling both @ 300 = 300 P&L.
	if got := computeLivePnLTx(tx, 1, "", "300", "2"); got != "300.00000000" {
		t.Fatalf("sell P&L = %s, want 300.00000000", got)
	}
}

func TestComputeLivePnLTx_ExcludesCurrentFilledSell(t *testing.T) {
	_, db := setupDCA(t)
	_, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, created_at)
		VALUES
		(1, 'buy-1', 'SOL_IDR', 'buy', 'market', '100', '2', 'filled', '2', '100', '2026-07-12 10:00:00'),
		(1, 'sell-current', 'SOL_IDR', 'sell', 'market', '150', '2', 'filled', '2', '150', '2026-07-12 10:01:00')`)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := db.Beginx()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()

	if got := computeLivePnLTx(tx, 1, "sell-current", "150", "2"); got != "100.00000000" {
		t.Fatalf("current sell P&L = %s, want 100.00000000", got)
	}
}
