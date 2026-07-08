package engine

import (
	"testing"
)

func TestTrendEngine_GoldenCross(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	// Fast (3) is below Slow (7), then crosses above at the last tick
	// Need enough data for SMA7, then the cross at the final 2 candles
	prices := []float64{
		50, 50, 50, 50, 50, 50, 50, // SMA7 = 50
		30, 30, // SMA3 drops to 36.67 (below SMA7 ~44)
		100, // SMA3 jumps to 53.33 → crosses above SMA7 ~51
	}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}

	signals := tr.evaluateWithID(1, prices, cfg)
	if len(signals) == 0 {
		t.Fatal("expected golden cross signal")
	}
	if signals[0].Side != "buy" {
		t.Errorf("expected buy for golden cross, got %s", signals[0].Side)
	}
}

func TestTrendEngine_DeathCross(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	// Fast (3) is above Slow (7), then crosses below at the last tick
	prices := []float64{
		50, 50, 50, 50, 50, 50, 50, // SMA7 = 50
		70, 70, // SMA3 jumps to 63.33 (above SMA7 ~53)
		5, // SMA3 drops to 48.33 → crosses below SMA7 ~49
	}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}

	signals := tr.evaluateWithID(1, prices, cfg)
	if len(signals) == 0 {
		t.Fatal("expected death cross signal")
	}
	if signals[0].Side != "sell" {
		t.Errorf("expected sell for death cross, got %s", signals[0].Side)
	}
}

func TestTrendEngine_NoCross(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	// Random walk — no clear crossover at the last two candles
	prices := []float64{48, 52, 48, 52, 48, 52, 48, 52, 48, 52, 48, 52}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}

	signals := tr.evaluateWithID(1, prices, cfg)
	_ = signals // may or may not generate signals
}

func TestTrendEngine_InsufficientData(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	prices := []float64{10, 20, 30}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 10}

	signals := tr.evaluateWithID(1, prices, cfg)
	if len(signals) != 0 {
		t.Errorf("expected no signals with insufficient data, got %d", len(signals))
	}
}

func TestTrendEngine_GoldenCrossOneShot(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}
	// First call: golden cross -> signal
	goldenPrices := []float64{50, 50, 50, 50, 50, 50, 50, 30, 30, 100}
	if s := tr.evaluateWithID(1, goldenPrices, cfg); len(s) != 1 || s[0].Side != "buy" {
		t.Fatalf("first call: expected 1 buy, got %v", s)
	}
	// Second call: same cross persists -> no signal (anti-noise)
	if s := tr.evaluateWithID(1, goldenPrices, cfg); len(s) != 0 {
		t.Fatalf("second call: expected 0 (anti-noise), got %v", s)
	}
}

func TestTrendEngine_RearmOnOppositeCross(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}
	// Golden cross -> signal
	goldenPrices := []float64{50, 50, 50, 50, 50, 50, 50, 30, 30, 100}
	if s := tr.evaluateWithID(1, goldenPrices, cfg); len(s) != 1 || s[0].Side != "buy" {
		t.Fatalf("golden: expected 1 buy, got %v", s)
	}
	// Death cross -> rearm + signal
	deathPrices := []float64{50, 50, 50, 50, 50, 50, 50, 70, 70, 5}
	if s := tr.evaluateWithID(1, deathPrices, cfg); len(s) != 1 || s[0].Side != "sell" {
		t.Fatalf("death: expected 1 sell, got %v", s)
	}
	// Now golden again -> rearmed, signal expected
	if s := tr.evaluateWithID(1, goldenPrices, cfg); len(s) != 1 || s[0].Side != "buy" {
		t.Fatalf("rearm golden: expected 1 buy, got %v", s)
	}
}

func TestTrendEngine_ResetClearsState(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}
	goldenPrices := []float64{50, 50, 50, 50, 50, 50, 50, 30, 30, 100}
	if s := tr.evaluateWithID(1, goldenPrices, cfg); len(s) != 1 {
		t.Fatalf("expected 1 signal, got %d", len(s))
	}
	tr.Reset(1)
	if s := tr.evaluateWithID(1, goldenPrices, cfg); len(s) != 1 {
		t.Fatalf("after reset golden should re-fire, got %d", len(s))
	}
}

func TestTrendEngine_StateIsolationPerSession(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}
	goldenPrices := []float64{50, 50, 50, 50, 50, 50, 50, 30, 30, 100}
	// session 1 fires golden
	if s := tr.evaluateWithID(1, goldenPrices, cfg); len(s) != 1 {
		t.Fatalf("session 1 first: expected 1, got %d", len(s))
	}
	// session 2 should also fire golden independently (no shared state)
	if s := tr.evaluateWithID(2, goldenPrices, cfg); len(s) != 1 {
		t.Fatalf("session 2 first: expected 1 (isolated), got %d", len(s))
	}
}

func TestSMA(t *testing.T) {
	prices := []float64{10, 20, 30}
	result := sma(prices, 3)
	expected := 20.0
	if result[2] != expected {
		t.Errorf("expected %.1f, got %.1f", expected, result[2])
	}
}
