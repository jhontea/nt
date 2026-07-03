package engine

import (
	"fmt"
)

type TrendEngine struct{}

func NewTrendEngine() *TrendEngine {
	return &TrendEngine{}
}

// Evaluate checks SMA crossover and generates buy/sell signals.
// Golden cross (fast SMA crosses above slow SMA) → buy
// Death cross (fast SMA crosses below slow SMA) → sell
func (t *TrendEngine) Evaluate(prices []float64, config TrendConfig) []Signal {
	signals := []Signal{}
	if len(prices) < config.SlowPeriod {
		return signals
	}

	fast := sma(prices, config.FastPeriod)
	slow := sma(prices, config.SlowPeriod)

	prevFast := fast[len(fast)-2]
	prevSlow := slow[len(slow)-2]
	currFast := fast[len(fast)-1]
	currSlow := slow[len(slow)-1]

	if prevFast <= prevSlow && currFast > currSlow {
		signals = append(signals, Signal{
			Side:   "buy",
			Price:  fmt.Sprintf("%.8f", prices[len(prices)-1]),
			Reason: "golden_cross",
		})
	}
	if prevFast >= prevSlow && currFast < currSlow {
		signals = append(signals, Signal{
			Side:   "sell",
			Price:  fmt.Sprintf("%.8f", prices[len(prices)-1]),
			Reason: "death_cross",
		})
	}
	return signals
}

func sma(prices []float64, period int) []float64 {
	result := make([]float64, len(prices))
	for i := period - 1; i < len(prices); i++ {
		sum := 0.0
		for j := i - period + 1; j <= i; j++ {
			sum += prices[j]
		}
		result[i] = sum / float64(period)
	}
	return result
}
