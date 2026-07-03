package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strconv"

	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

type GridEngine struct {
	client *tokocrypto.Client
}

func NewGridEngine(client *tokocrypto.Client) *GridEngine {
	return &GridEngine{client: client}
}

func (g *GridEngine) Evaluate(session model.Session, configStr string) []Signal {
	var cfg GridConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		slog.Error("parse grid config", "session", session.ID, "error", err)
		return nil
	}

	ticker, err := g.client.GetTicker(session.Symbol)
	if err != nil {
		slog.Error("fetch ticker", "session", session.ID, "error", err)
		return nil
	}
	price, err := strconv.ParseFloat(ticker.LastPrice, 64)
	if err != nil {
		slog.Error("parse price", "price", ticker.LastPrice, "error", err)
		return nil
	}

	signals := g.evaluate(cfg, price)
	for i := range signals {
		signals[i].Symbol = session.Symbol
		signals[i].Quantity = cfg.Quantity
	}
	return signals
}

func (g *GridEngine) evaluate(config GridConfig, currentPrice float64) []Signal {
	signals := []Signal{}
	step := (config.UpperPrice - config.LowerPrice) / float64(config.GridCount)
	if step <= 0 {
		return signals
	}

	midPrice := (config.UpperPrice + config.LowerPrice) / 2

	for i := 0; i <= config.GridCount; i++ {
		level := config.LowerPrice + step*float64(i)
		levelRounded := math.Round(level*1e8) / 1e8
		priceStr := fmt.Sprintf("%.8f", levelRounded)

		if currentPrice >= levelRounded && levelRounded > midPrice {
			signals = append(signals, Signal{Side: string(model.SideSell), Price: priceStr, Reason: "grid_level"})
		}
		if currentPrice <= levelRounded && levelRounded < midPrice {
			signals = append(signals, Signal{Side: string(model.SideBuy), Price: priceStr, Reason: "grid_level"})
		}
	}
	return signals
}
