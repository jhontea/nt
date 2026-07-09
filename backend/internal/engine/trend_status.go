package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/user/nt/internal/model"
)

// TrendStatus holds the real-time SMA/cross status for a trend session.
type TrendStatus struct {
	FastSMA          float64   `json:"fast_sma"`
	SlowSMA          float64   `json:"slow_sma"`
	CrossStatus      string    `json:"cross_status"` // "golden", "death", "neutral"
	PricePositionPct float64   `json:"price_position_pct"`
	CurrentPrice     float64   `json:"current_price"`
	RecentPrices     []float64 `json:"recent_prices"`      // last N closing prices for sparkline
	RecentFastSMA    []float64 `json:"recent_fast_sma"`    // last N fast SMA values
	RecentSlowSMA    []float64 `json:"recent_slow_sma"`    // last N slow SMA values
	NextCandleETA    string    `json:"next_candle_eta"`    // estimated time to next candle close
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

	// Sparkline data: last 20 data points
	sparkLen := 20
	if sparkLen > len(prices) {
		sparkLen = len(prices)
	}
	recentPrices := make([]float64, sparkLen)
	copy(recentPrices, prices[len(prices)-sparkLen:])

	recentFast := make([]float64, sparkLen)
	recentSlow := make([]float64, sparkLen)
	smaOffset := len(fast) - sparkLen
	if smaOffset < 0 {
		smaOffset = 0
	}
	for i := 0; i < sparkLen; i++ {
		srcIdx := smaOffset + i
		if srcIdx < len(fast) {
			recentFast[i] = fast[srcIdx]
		}
		if srcIdx < len(slow) {
			recentSlow[i] = slow[srcIdx]
		}
	}

	// Next candle ETA
	nextCandle := computeNextCandleETA(interval)

	return &TrendStatus{
		FastSMA:          currFast,
		SlowSMA:          currSlow,
		CrossStatus:      crossStatus,
		PricePositionPct: pct,
		CurrentPrice:     currentPrice,
		RecentPrices:     recentPrices,
		RecentFastSMA:    recentFast,
		RecentSlowSMA:    recentSlow,
		NextCandleETA:    nextCandle,
	}
}

// computeNextCandleETA returns a human-readable countdown to the next candle close.
func computeNextCandleETA(interval string) string {
	now := time.Now()
	var dur time.Duration
	switch interval {
	case "1m":
		dur = time.Duration(60-now.Second()) * time.Second
	case "3m":
		sec := now.Minute()*60 + now.Second()
		dur = time.Duration(180-sec%180) * time.Second
	case "5m":
		sec := now.Minute()*60 + now.Second()
		dur = time.Duration(300-sec%300) * time.Second
	case "15m":
		sec := now.Minute()*60 + now.Second()
		dur = time.Duration(900-sec%900) * time.Second
	case "30m":
		sec := now.Minute()*60 + now.Second()
		dur = time.Duration(1800-sec%1800) * time.Second
	case "1h":
		dur = time.Duration(60-now.Minute())*time.Minute - time.Duration(now.Second())*time.Second
	case "4h":
		minIn4h := (now.Hour()%4)*60 + now.Minute()
		dur = time.Duration(240-minIn4h)*time.Minute - time.Duration(now.Second())*time.Second
	default:
		dur = time.Duration(300-now.Minute()*60-now.Second()) * time.Second
	}
	if dur < 0 {
		dur += time.Duration(1) * time.Hour // fallback
	}
	m := int(dur.Minutes())
	s := int(dur.Seconds()) % 60
	if m > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}
