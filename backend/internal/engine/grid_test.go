package engine

import (
	"testing"
)

func TestGridEngine_Evaluate_FirstCall(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}

	signals := g.evaluate(1, cfg, 71000)
	if len(signals) == 0 {
		t.Fatal("expected sell signal on first call")
	}
	for _, s := range signals {
		if s.Side != "sell" {
			t.Errorf("expected sell, got %s", s.Side)
		}
	}
}

func TestGridEngine_Evaluate_BuySide(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}

	signals := g.evaluate(2, cfg, 59000)
	if len(signals) == 0 {
		t.Fatal("expected buy signal on first call")
	}
	for _, s := range signals {
		if s.Side != "buy" {
			t.Errorf("expected buy, got %s", s.Side)
		}
	}
}

func TestGridEngine_Evaluate_Midpoint(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}
	signals := g.evaluate(3, cfg, 65000)
	if len(signals) != 0 {
		t.Errorf("expected 0 signals at midpoint, got %d", len(signals))
	}
}

func TestGridEngine_Evaluate_InvalidConfig(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 60000, LowerPrice: 60000, GridCount: 5}
	signals := g.evaluate(1, cfg, 65000)
	if len(signals) != 0 {
		t.Errorf("expected 0 signals, got %d", len(signals))
	}
}

func TestGridEngine_OneSignalPerLevel(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}

	// First touch triggers signal
	signals := g.evaluate(10, cfg, 60000)
	if len(signals) != 1 {
		t.Fatalf("expected 1 buy signal, got %d", len(signals))
	}

	// Same price — level already triggered, no signal
	signals = g.evaluate(10, cfg, 60000)
	if len(signals) != 0 {
		t.Errorf("expected 0 signals (already triggered), got %d", len(signals))
	}

	// Price moves away → re-arm
	g.evaluate(10, cfg, 55000)
	signals = g.evaluate(10, cfg, 60000)
	if len(signals) != 1 {
		t.Errorf("expected 1 buy signal after re-arm, got %d", len(signals))
	}
}

func TestGridEngine_Reset(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}

	g.evaluate(20, cfg, 60000)
	if _, ok := g.states[20]; !ok {
		t.Fatal("expected state to exist")
	}
	g.Reset(20)
	if _, ok := g.states[20]; ok {
		t.Error("expected state cleared after Reset")
	}
}

func TestGridEngine_SignalPriceAccuracy(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 100, LowerPrice: 0, GridCount: 4}

	signals := g.evaluate(1, cfg, 75)
	found := false
	for _, s := range signals {
		if s.Price == "75.00000000" && s.Side == "sell" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected sell signal at price 75.00000000")
	}
}