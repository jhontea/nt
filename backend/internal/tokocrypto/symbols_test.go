package tokocrypto

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestNormalizeMarketQuantity(t *testing.T) {
	tests := []struct {
		name    string
		info    SymbolInfo
		qty     string
		want    string
		wantErr bool
	}{
		{
			name: "uses market lot size and floors",
			info: SymbolInfo{Symbol: "BTC_IDR", Filters: []SymbolFilter{
				{FilterType: "LOT_SIZE", MinQty: "0.00000100", MaxQty: "100", StepSize: "0.00000100"},
				{FilterType: "MARKET_LOT_SIZE", MinQty: "0.00001000", MaxQty: "100", StepSize: "0.00001000"},
			}},
			qty:  "0.12345678",
			want: "0.12345",
		},
		{
			name: "falls back to lot size",
			info: SymbolInfo{Symbol: "DOGE_IDR", Filters: []SymbolFilter{
				{FilterType: "LOT_SIZE", MinQty: "1", MaxQty: "100000", StepSize: "1"},
			}},
			qty:  "12.9",
			want: "12",
		},
		{
			name: "respects non-zero minimum offset",
			info: SymbolInfo{Symbol: "TEST_USDT", Filters: []SymbolFilter{
				{FilterType: "MARKET_LOT_SIZE", MinQty: "0.005", MaxQty: "10", StepSize: "0.002"},
			}},
			qty:  "0.0109",
			want: "0.009",
		},
		{
			name: "rejects below minimum",
			info: SymbolInfo{Symbol: "ETH_USDT", Filters: []SymbolFilter{
				{FilterType: "MARKET_LOT_SIZE", MinQty: "0.001", MaxQty: "10", StepSize: "0.001"},
			}},
			qty:     "0.0009",
			wantErr: true,
		},
		{
			name:    "rejects missing filter",
			info:    SymbolInfo{Symbol: "UNKNOWN"},
			qty:     "1",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeMarketQuantity(tt.info, tt.qty)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got quantity %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeMarketQuantity failed: %v", err)
			}
			if got != tt.want {
				t.Fatalf("quantity = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestGetSymbolInfoCachesResponse(t *testing.T) {
	calls := 0
	_, client := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/open/v1/common/symbols" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		json.NewEncoder(w).Encode(SymbolsResponse{
			Code: 0,
			Data: SymbolsData{List: []SymbolInfo{{
				Symbol: "BTC_USDT",
				Filters: []SymbolFilter{{
					FilterType: "MARKET_LOT_SIZE",
					MinQty:     "0.00001",
					MaxQty:     "100",
					StepSize:   "0.00001",
				}},
			}}},
		})
	})

	for i := 0; i < 2; i++ {
		info, err := client.GetSymbolInfo("BTC_USDT")
		if err != nil {
			t.Fatalf("GetSymbolInfo failed: %v", err)
		}
		if info.Symbol != "BTC_USDT" {
			t.Fatalf("unexpected symbol: %s", info.Symbol)
		}
	}
	if calls != 1 {
		t.Fatalf("expected one metadata request, got %d", calls)
	}
}
