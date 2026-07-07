package engine

import (
	"testing"
)

func TestGridEngine_Evaluate_FirstCall(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	sessionID := int64(1)
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}
	// levels: 60000, 65000, 70000, step=5000, mid=65000
	price := 71000.0 // within tolerance of level 70000 (tol=2500)

	signals := g.evaluate(sessionID, cfg, price)
	if len(signals) == 0 {
		t.Fatal("expected at least 1 sell signal on first call")
	}
	for _, s := range signals {
		if s.Side != "sell" {
			t.Errorf("expected sell side, got %s", s.Side)
		}
	}
}

func TestGridEngine_Evaluate_BuySide(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	sessionID := int64(2)
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}
	// levels: 60000, 65000, 70000, step=5000, mid=65000
	price := 59000.0 // within tolerance of level 60000 (tol=2500)

	signals := g.evaluate(sessionID, cfg, price)
	if len(signals) == 0 {
		t.Fatal("expected at least 1 buy signal on first call")
	}
	for _, s := range signals {
		if s.Side != "buy" {
			t.Errorf("expected buy side, got %s", s.Side)
		}
	}
}

func TestGridEngine_Evaluate_Midpoint(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	sessionID := int64(3)
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}
	price := 65000.0 // at midpoint

	signals := g.evaluate(sessionID, cfg, price)
	if len(signals) != 0 {
		t.Errorf("expected 0 signals at midpoint, got %d", len(signals))
	}
}

func TestGridEngine_Evaluate_InvalidConfig(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 60000, LowerPrice: 60000, GridCount: 5}
	signals := g.evaluate(1, cfg, 65000)
	if len(signals) != 0 {
		t.Errorf("expected 0 signals for invalid config, got %d", len(signals))
	}
}

func TestGridEngine_OneSignalPerLevel(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	sessionID := int64(10)
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}
	// levels: 60000, 65000, 70000, mid=65000

	// First call at price 55000 → buy signals at levels below mid
	signals1 := g.evaluate(sessionID, cfg, 55000)
	// at 55000, tolerance = 2500. |55000-60000|=5000 > 2500, so 60000 not touched.
	// Actually we need to be more careful: tolerance = step/2 = 2500
	// |55000 - 60000| = 5000 > 2500, not touched. |55000 - 65000| = 10000, not touched.
	// So no signals expected.
	if len(signals1) != 0 {
		t.Errorf("expected 0 signals at far-below price (no level touched), got %d", len(signals1))
	}

	// Call at exactly lower level 60000
	signals2 := g.evaluate(sessionID, cfg, 60000)
	// |60000 - 60000| = 0 <= 2500, touched. 60000 < 65000 (mid) → buy
	if len(signals2) != 1 {
		t.Fatalf("expected 1 buy signal at level 60000, got %d", len(signals2))
	}

	// Same price again → level already triggered, should not re-emit
	signals3 := g.evaluate(sessionID, cfg, 60000)
	if len(signals3) != 0 {
		t.Errorf("expected 0 signals (level already triggered), got %d", len(signals3))
	}

	// Price moves away (down to 55000) then back up
	g.evaluate(sessionID, cfg, 55000) // price moves away
	signals4 := g.evaluate(sessionID, cfg, 60000)
	// |55000 - 60000| = 5000 >= step(5000) → rearm. Then at 60000 → touched again
	if len(signals4) != 1 {
		t.Errorf("expected 1 buy signal after re-arm, got %d", len(signals4))
	}
}

func TestGridEngine_Reset(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	sessionID := int64(20)
	cfg := GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2}

	g.evaluate(sessionID, cfg, 60000)
	if _, ok := g.states[sessionID]; !ok {
		t.Fatal("expected state to exist")
	}

	g.Reset(sessionID)
	if _, ok := g.states[sessionID]; ok {
		t.Error("expected state to be cleared after Reset")
	}
}

func TestGridEngine_SignalPriceAccuracy(t *testing.T) {
	g := &GridEngine{states: make(map[int64]*gridSessionState)}
	cfg := GridConfig{UpperPrice: 100, LowerPrice: 0, GridCount: 4}
	// levels: 0, 25, 50, 75, 100, mid=50

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