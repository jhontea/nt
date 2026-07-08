package engine

import (
	"testing"
	"time"

	"github.com/user/nt/internal/model"
)

func makeTrendSignal(signalType string, signalPrice string, ageMin int) model.StrategySignal {
	created := time.Now().Add(-time.Duration(ageMin) * time.Minute)
	return model.StrategySignal{
		ID:                     1,
		SignalType:             signalType,
		GridLevelPrice:         signalPrice,
		ValidationStatus:       "pending",
		ValidationMode:         "percent",
		ValidationTargetValue:  2.0,
		ValidationInvalidValue: 1.0,
		ValidationWindowMinutes: 120,
		CreatedAt:              created,
	}
}

func TestTrendValidator_BuyConfirmed(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 103, 101, 99)
	if len(res) != 1 || res[0].status != "confirmed" {
		t.Fatalf("expected 1 confirmed, got %+v", res)
	}
	if res[0].note != "target reached" {
		t.Errorf("note mismatch: %s", res[0].note)
	}
}

func TestTrendValidator_BuyInvalidatedByAdverse(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 98.5, 99, 101)
	if len(res) != 1 || res[0].status != "invalidated" {
		t.Fatalf("expected 1 invalidated (price moved down > 1pct), got %+v", res)
	}
	if res[0].note != "invalid threshold reached" {
		t.Errorf("note mismatch: %s", res[0].note)
	}
}

func TestTrendValidator_BuyInvalidatedBySMAReversal(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	// price moved +3% (target hit) but SMA reversed (fast < slow)
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 103, 99, 101)
	if len(res) != 1 || res[0].status != "invalidated" {
		t.Fatalf("expected invalidated (SMA reversed), got %+v", res)
	}
	if res[0].note != "percent hit but SMA reversed" {
		t.Errorf("note mismatch: %s", res[0].note)
	}
}

func TestTrendValidator_SellConfirmed(t *testing.T) {
	sig := makeTrendSignal("sell", "100", 5)
	v := NewTrendValidator()
	// price fell 3% (target hit), SMA still death-aligned (fast < slow)
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 97, 99, 101)
	if len(res) != 1 || res[0].status != "confirmed" {
		t.Fatalf("expected 1 confirmed, got %+v", res)
	}
}

func TestTrendValidator_SellSMAReversal(t *testing.T) {
	sig := makeTrendSignal("sell", "100", 5)
	v := NewTrendValidator()
	// price fell 3% (target hit) but SMA reversed (fast > slow)
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 97, 101, 99)
	if len(res) != 1 || res[0].status != "invalidated" {
		t.Fatalf("expected invalidated, got %+v", res)
	}
	if res[0].note != "percent hit but SMA reversed" {
		t.Errorf("note mismatch: %s", res[0].note)
	}
}

func TestTrendValidator_Expired(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 200) // 200 minutes ago > 120 window
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 101, 100, 99)
	if len(res) != 1 || res[0].status != "expired" {
		t.Fatalf("expected expired, got %+v", res)
	}
}

func TestTrendValidator_PendingKeepsPending(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	// small move, no trigger
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 100.5, 100, 99)
	if len(res) != 0 {
		t.Fatalf("expected no transition, got %+v", res)
	}
}

func TestTrendValidator_TracksMaxFavorable(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 103, 101, 99)[0]
	if res.maxFavPct < 2.9 || res.maxFavPct > 3.1 {
		t.Errorf("maxFavPct ~= 3.0 expected, got %f", res.maxFavPct)
	}
}

func TestTrendValidator_SkipsNonPending(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	sig.ValidationStatus = "confirmed"
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 103, 101, 99)
	if len(res) != 0 {
		t.Fatalf("expected skip for non-pending, got %+v", res)
	}
}

func TestTrendValidator_GracePeriodSkip(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 0) // just created
	sig.CreatedAt = time.Now()
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 110, 101, 99)
	if len(res) != 0 {
		t.Fatalf("expected skip during 60s grace, got %+v", res)
	}
}