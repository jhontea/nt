package validator

import (
	"encoding/json"
	"strconv"

	"github.com/user/nt/internal/model"
)

func GridConfig(s string) error {
	var cfg struct {
		UpperPrice float64 `json:"upper_price"`
		LowerPrice float64 `json:"lower_price"`
		GridCount  int     `json:"grid_count"`
		Quantity   string  `json:"quantity"`
	}
	if err := json.Unmarshal([]byte(s), &cfg); err != nil {
		return err
	}
	var e Errors
	if cfg.UpperPrice <= 0 {
		e.Add(ErrField("upper_price", "must be > 0"))
	}
	if cfg.LowerPrice <= 0 {
		e.Add(ErrField("lower_price", "must be > 0"))
	}
	if cfg.UpperPrice <= cfg.LowerPrice {
		e.Add(ErrField("upper_price", "must be greater than lower_price"))
	}
	if cfg.GridCount < 2 {
		e.Add(ErrField("grid_count", "minimum 2"))
	}
	if cfg.GridCount > 100 {
		e.Add(ErrField("grid_count", "maximum 100"))
	}
	if f, _ := strconv.ParseFloat(cfg.Quantity, 64); f <= 0 {
		e.Add(ErrField("quantity", "must be > 0"))
	}
	return e.Err()
}

func TrendConfig(s string) error {
	var cfg struct {
		FastPeriod int    `json:"fast_period"`
		SlowPeriod int    `json:"slow_period"`
		Quantity   string `json:"quantity"`
	}
	if err := json.Unmarshal([]byte(s), &cfg); err != nil {
		return err
	}
	var e Errors
	if cfg.FastPeriod < 2 {
		e.Add(ErrField("fast_period", "minimum 2"))
	}
	if cfg.SlowPeriod < cfg.FastPeriod+2 {
		e.Add(ErrField("slow_period", "must be at least fast_period + 2"))
	}
	if cfg.SlowPeriod > 200 {
		e.Add(ErrField("slow_period", "maximum 200"))
	}
	if f, _ := strconv.ParseFloat(cfg.Quantity, 64); f <= 0 {
		e.Add(ErrField("quantity", "must be > 0"))
	}
	return e.Err()
}

func DCAConfig(s string) error {
	var cfg struct {
		IntervalSec   int     `json:"interval_sec"`
		Amount        string  `json:"amount"`
		TakeProfitPct float64 `json:"take_profit_pct"`
	}
	if err := json.Unmarshal([]byte(s), &cfg); err != nil {
		return err
	}
	var e Errors
	if cfg.IntervalSec < 60 {
		e.Add(ErrField("interval_sec", "minimum 60 seconds"))
	}
	if cfg.IntervalSec > 604800 {
		e.Add(ErrField("interval_sec", "maximum 7 days"))
	}
	if f, _ := strconv.ParseFloat(cfg.Amount, 64); f <= 0 {
		e.Add(ErrField("amount", "must be > 0"))
	}
	if cfg.TakeProfitPct < 0 {
		e.Add(ErrField("take_profit_pct", "cannot be negative"))
	}
	if cfg.TakeProfitPct > 1000 {
		e.Add(ErrField("take_profit_pct", "maximum 1000%"))
	}
	return e.Err()
}

func ErrField(field, msg string) error {
	return &FieldError{Field: field, Message: msg}
}

type FieldError struct {
	Field   string
	Message string
}

func (e *FieldError) Error() string {
	return "field '" + e.Field + "' " + e.Message
}

func ValidateSession(mode, strategy, config string) error {
	var e Errors
	e.Add(In(mode, []string{string(model.ModeSignal), string(model.ModePaper), string(model.ModeLive)}))
	e.Add(In(strategy, []string{string(model.StratGrid), string(model.StratTrend), string(model.StratDCA)}))

	if err := e.Err(); err != nil {
		return err
	}

	switch strategy {
	case string(model.StratGrid):
		return GridConfig(config)
	case string(model.StratTrend):
		return TrendConfig(config)
	case string(model.StratDCA):
		return DCAConfig(config)
	}
	return nil
}
