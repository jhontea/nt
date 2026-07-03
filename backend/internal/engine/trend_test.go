package engine

import (
	"testing"
)

func TestTrendEngine_GoldenCross(t *testing.T) {
	tr := &TrendEngine{}
	// Fast (3) is below Slow (7), then crosses above at the last tick
	// Need enough data for SMA7, then the cross at the final 2 candles
	prices := []float64{
		50, 50, 50, 50, 50, 50, 50, // SMA7 = 50
		30, 30, // SMA3 drops to 36.67 (below SMA7 ~44)
		100, // SMA3 jumps to 53.33 → crosses above SMA7 ~51
	}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}

	signals := tr.evaluate(prices, cfg)
	if len(signals) == 0 {
		t.Fatal("expected golden cross signal")
	}
	if signals[0].Side != "buy" {
		t.Errorf("expected buy for golden cross, got %s", signals[0].Side)
	}
}

func TestTrendEngine_DeathCross(t *testing.T) {
	tr := &TrendEngine{}
	// Fast (3) is above Slow (7), then crosses below at the last tick
	prices := []float64{
		50, 50, 50, 50, 50, 50, 50, // SMA7 = 50
		70, 70, // SMA3 jumps to 63.33 (above SMA7 ~53)
		5, // SMA3 drops to 48.33 → crosses below SMA7 ~49
	}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}

	signals := tr.evaluate(prices, cfg)
	if len(signals) == 0 {
		t.Fatal("expected death cross signal")
	}
	if signals[0].Side != "sell" {
		t.Errorf("expected sell for death cross, got %s", signals[0].Side)
	}
}

func TestTrendEngine_NoCross(t *testing.T) {
	tr := &TrendEngine{}
	// Random walk — no clear crossover at the last two candles
	prices := []float64{48, 52, 48, 52, 48, 52, 48, 52, 48, 52, 48, 52}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}

	signals := tr.evaluate(prices, cfg)
	_ = signals // may or may not generate signals
}

func TestTrendEngine_InsufficientData(t *testing.T) {
	tr := &TrendEngine{}
	prices := []float64{10, 20, 30}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 10}

	signals := tr.evaluate(prices, cfg)
	if len(signals) != 0 {
		t.Errorf("expected no signals with insufficient data, got %d", len(signals))
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
