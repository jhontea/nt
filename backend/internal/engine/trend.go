package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

type TrendEngine struct {
	client *tokocrypto.Client
}

func NewTrendEngine(client *tokocrypto.Client) *TrendEngine {
	return &TrendEngine{client: client}
}

func (t *TrendEngine) Evaluate(session model.Session, configStr string) []Signal {
	var cfg TrendConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		slog.Error("parse trend config", "session", session.ID, "error", err)
		return nil
	}

	raw, err := t.client.GetCandles(session.Symbol, "5m", cfg.SlowPeriod+5)
	if err != nil {
		slog.Error("fetch candles", "session", session.ID, "error", err)
		return nil
	}

	prices := make([]float64, 0, len(raw))
	for _, c := range raw {
		if len(c) < 5 {
			continue
		}
		p, err := strconv.ParseFloat(fmt.Sprintf("%v", c[4]), 64)
		if err != nil {
			slog.Warn("skip candle parse", "error", err)
			continue
		}
		prices = append(prices, p)
	}

	signals := t.evaluate(prices, cfg)
	for i := range signals {
		signals[i].Symbol = session.Symbol
		signals[i].Quantity = cfg.Quantity
	}
	return signals
}

func (t *TrendEngine) evaluate(prices []float64, config TrendConfig) []Signal {
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
			Side: string(model.SideBuy), Price: fmt.Sprintf("%.8f", prices[len(prices)-1]), Reason: "golden_cross",
		})
	}
	if prevFast >= prevSlow && currFast < currSlow {
		signals = append(signals, Signal{
			Side: string(model.SideSell), Price: fmt.Sprintf("%.8f", prices[len(prices)-1]), Reason: "death_cross",
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
