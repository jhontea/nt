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
	if got := computeLivePnLTx(tx, 1, "300", "2"); got != "300.00000000" {
		t.Fatalf("sell P&L = %s, want 300.00000000", got)
	}
}
