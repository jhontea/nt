package engine

import (
	"testing"
)

func TestGridEngine_Evaluate(t *testing.T) {
	tests := []struct {
		name     string
		config   GridConfig
		price    float64
		wantLen  int
		wantSell int
		wantBuy  int
	}{
		{
			name:     "price above all levels — sell at highest level only",
			config:   GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2},
			price:    75000,
			wantLen:  1,
			wantSell: 1,
			wantBuy:  0,
		},
		{
			name:     "price below all levels — buy at lowest level only",
			config:   GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2},
			price:    55000,
			wantLen:  1,
			wantSell: 0,
			wantBuy:  1,
		},
		{
			name:     "price at midpoint — no signals",
			config:   GridConfig{UpperPrice: 70000, LowerPrice: 60000, GridCount: 2},
			price:    65000,
			wantLen:  0,
		},
		{
			name:     "price at upper level — sell above-mid levels",
			config:   GridConfig{UpperPrice: 100, LowerPrice: 0, GridCount: 4},
			price:    100,
			wantLen:  2,
			wantSell: 2,
			wantBuy:  0,
		},
		{
			name:     "invalid config — step=0",
			config:   GridConfig{UpperPrice: 60000, LowerPrice: 60000, GridCount: 5},
			price:    65000,
			wantLen:  0,
		},
	}

	g := &GridEngine{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := g.evaluate(tt.config, tt.price)
			if len(got) != tt.wantLen {
				t.Errorf("got %d signals, want %d", len(got), tt.wantLen)
			}
			buyCount, sellCount := 0, 0
			for _, s := range got {
				if s.Side == "buy" {
					buyCount++
				}
				if s.Side == "sell" {
					sellCount++
				}
				if s.Price == "" {
					t.Error("signal has empty price")
				}
			}
			if tt.wantBuy != 0 && buyCount != tt.wantBuy {
				t.Errorf("got %d buy signals, want %d", buyCount, tt.wantBuy)
			}
			if tt.wantSell != 0 && sellCount != tt.wantSell {
				t.Errorf("got %d sell signals, want %d", sellCount, tt.wantSell)
			}
		})
	}
}

func TestGridEngine_SignalPriceAccuracy(t *testing.T) {
	g := &GridEngine{}
	cfg := GridConfig{UpperPrice: 100, LowerPrice: 0, GridCount: 4}

	// levels: 0, 25, 50, 75, 100, mid=50
	// price=75 → sell at 75
	signals := g.evaluate(cfg, 75)

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

func TestGridEngine_MultipleLevels(t *testing.T) {
	g := &GridEngine{}
	// levels: 0, 20, 40, 60, 80, 100, mid=50
	// price=100 → sell at levels > mid: 60, 80, 100
	cfg := GridConfig{UpperPrice: 100, LowerPrice: 0, GridCount: 5}
	signals := g.evaluate(cfg, 100)
	if len(signals) != 3 {
		t.Errorf("expected 3 sell signals at levels 60,80,100, got %d", len(signals))
	}
}
