package validator

import (
	"strings"
	"testing"
)

func TestRequired(t *testing.T) {
	if err := Required(""); err == nil {
		t.Error("expected error for empty string")
	}
	if err := Required("abc"); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestMinLength(t *testing.T) {
	if err := MinLength("ab", 3); err == nil {
		t.Error("expected error for too short")
	}
	if err := MinLength("abc", 3); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestIn(t *testing.T) {
	if err := In("x", []string{"a", "b"}); err == nil {
		t.Error("expected error for invalid value")
	}
	if err := In("a", []string{"a", "b"}); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestSymbol(t *testing.T) {
	tests := []struct {
		symbol string
		valid  bool
	}{
		{"BTC_USDT", true},
		{"ETH_IDR", true},
		{"BTCUSDT", false},
		{"BTC_", false},
		{"_USDT", false},
		{"", false},
		{"A_B_C", false},
	}
	for _, tt := range tests {
		err := Symbol(tt.symbol)
		if tt.valid && err != nil {
			t.Errorf("expected '%s' to be valid, got: %v", tt.symbol, err)
		}
		if !tt.valid && err == nil {
			t.Errorf("expected '%s' to be invalid", tt.symbol)
		}
	}
}

func TestPosFloat(t *testing.T) {
	if err := PosFloat("0"); err == nil {
		t.Error("expected error for 0")
	}
	if err := PosFloat("-1"); err == nil {
		t.Error("expected error for negative")
	}
	if err := PosFloat("abc"); err == nil {
		t.Error("expected error for non-number")
	}
	if err := PosFloat("1.5"); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestErrors_Add(t *testing.T) {
	var e Errors
	e.Add(nil)
	if len(e) != 0 {
		t.Error("expected no errors when adding nil")
	}
	e.Add(Required(""))
	if len(e) != 1 {
		t.Error("expected 1 error")
	}
}

func TestErrors_Err(t *testing.T) {
	var e Errors
	if err := e.Err(); err != nil {
		t.Errorf("expected nil for empty errors, got %v", err)
	}
	e.Add(Required(""))
	err := e.Err()
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "field is required") {
		t.Errorf("unexpected message: %s", err.Error())
	}
}

func TestValidateSession(t *testing.T) {
	if err := ValidateSession("invalid", "grid", "{}"); err == nil {
		t.Error("expected error for invalid mode")
	}
	if err := ValidateSession("signal", "invalid", "{}"); err == nil {
		t.Error("expected error for invalid strategy")
	}
	if err := ValidateSession("signal", "grid", `{"upper_price":70000,"lower_price":60000,"grid_count":10,"quantity":"0.001"}`); err != nil {
		t.Errorf("valid config rejected: %v", err)
	}
	if err := ValidateSession("signal", "dca", `{"interval_sec":3600,"amount":"10","take_profit_pct":5}`); err != nil {
		t.Errorf("valid DCA config rejected: %v", err)
	}
}

func TestTrendConfig_RejectsInvalidInterval(t *testing.T) {
	if err := ValidateSession("signal", "trend", `{"fast_period":3,"slow_period":10,"quantity":"0.001","interval":"1d"}`); err == nil {
		t.Fatal("expected error for invalid interval")
	}
}

func TestTrendConfig_AcceptsValidInterval(t *testing.T) {
	cases := []string{
		`{"fast_period":3,"slow_period":10,"quantity":"0.001","interval":"5m"}`,
		`{"fast_period":3,"slow_period":10,"quantity":"0.001","interval":"1h"}`,
	}
	for _, c := range cases {
		if err := ValidateSession("signal", "trend", c); err != nil {
			t.Errorf("expected ok for %s, got %v", c, err)
		}
	}
}

func TestTrendConfig_DefaultsIntervalTo5m(t *testing.T) {
	if err := ValidateSession("signal", "trend", `{"fast_period":3,"slow_period":10,"quantity":"0.001"}`); err != nil {
		t.Errorf("expected ok without interval, got %v", err)
	}
}

func TestTrendConfig_RejectsEmptyQuantity(t *testing.T) {
	if err := ValidateSession("signal", "trend", `{"fast_period":3,"slow_period":10,"quantity":"0"}`); err == nil {
		t.Fatal("expected error for zero quantity")
	}
}

func TestTrendConfig_RejectsNonPercentValidationMode(t *testing.T) {
	if err := ValidateSession("signal", "trend", `{"fast_period":3,"slow_period":10,"quantity":"0.001","validation_mode":"grid_steps"}`); err == nil {
		t.Fatal("expected error for non-percent validation_mode on trend")
	}
}
