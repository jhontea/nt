package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/user/nt/internal/model"
)

// TrendStatus holds the real-time SMA/cross status for a trend session.
type TrendStatus struct {
	FastSMA          float64 `json:"fast_sma"`
	SlowSMA          float64 `json:"slow_sma"`
	CrossStatus      string  `json:"cross_status"` // "golden", "death", "neutral"
	PricePositionPct float64 `json:"price_position_pct"`
	CurrentPrice     float64 `json:"current_price"`
}

// CandleFetcher is the minimal interface for fetching kline data.
type CandleFetcher interface {
	GetCandles(symbol, interval string, limit int) ([][]any, error)
}

// ComputeTrendStatus calculates current SMA, cross status, and price position for a trend session.
func ComputeTrendStatus(fetcher CandleFetcher, session model.Session, configStr string) *TrendStatus {
	var cfg TrendConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		slog.Error("parse trend config", "session", session.ID, "error", err)
		return nil
	}

	interval := cfg.Interval
	if interval == "" {
		interval = "5m"
	}

	needed := cfg.SlowPeriod + 5
	if needed < 30 {
		needed = 30
	}

	raw, err := fetcher.GetCandles(session.Symbol, interval, needed)
	if err != nil {
		slog.Error("fetch candles for status", "session", session.ID, "error", err)
		return nil
	}

	if len(raw) == 0 {
		slog.Warn("GetCandles returned empty", "session", session.ID, "symbol", session.Symbol, "interval", interval)
		return nil
	}
	slog.Info("candle sample", "session", session.ID, "first", raw[0], "len", len(raw[0]))

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

	if len(prices) < cfg.SlowPeriod {
		slog.Warn("not enough candles", "session", session.ID, "have", len(prices), "need", cfg.SlowPeriod)
		return nil
	}

	fast := sma(prices, cfg.FastPeriod)
	slow := sma(prices, cfg.SlowPeriod)

	currFast := fast[len(fast)-1]
	currSlow := slow[len(slow)-1]
	currentPrice := prices[len(prices)-1]

	crossStatus := "neutral"
	if currFast > currSlow {
		crossStatus = "golden"
	} else if currFast < currSlow {
		crossStatus = "death"
	}

	lower := currFast
	upper := currSlow
	if lower > upper {
		lower, upper = upper, lower
	}
	pct := 50.0
	if upper > lower {
		pct = ((currentPrice - lower) / (upper - lower)) * 100
	}
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}

	return &TrendStatus{
		FastSMA:          currFast,
		SlowSMA:          currSlow,
		CrossStatus:      crossStatus,
		PricePositionPct: pct,
		CurrentPrice:     currentPrice,
	}
}
