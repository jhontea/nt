package engine

import (
	"fmt"
	"math"
)

type GridEngine struct{}

func NewGridEngine() *GridEngine {
	return &GridEngine{}
}

// Evaluate generates buy/sell signals based on grid price levels.
// Buy signals when price is in lower half of grid, sell when in upper half.
func (g *GridEngine) Evaluate(config GridConfig, currentPrice float64) []Signal {
	signals := []Signal{}
	step := (config.UpperPrice - config.LowerPrice) / float64(config.GridCount)
	if step <= 0 {
		return signals
	}

	midPrice := (config.UpperPrice + config.LowerPrice) / 2

	for i := 0; i <= config.GridCount; i++ {
		level := config.LowerPrice + step*float64(i)
		levelRounded := math.Round(level*1e8) / 1e8

		if currentPrice >= levelRounded && levelRounded > midPrice {
			signals = append(signals, Signal{
				Side:   "sell",
				Price:  fmt.Sprintf("%.8f", levelRounded),
				Reason: "grid_level",
			})
		}
		if currentPrice <= levelRounded && levelRounded < midPrice {
			signals = append(signals, Signal{
				Side:   "buy",
				Price:  fmt.Sprintf("%.8f", levelRounded),
				Reason: "grid_level",
			})
		}
	}
	return signals
}
