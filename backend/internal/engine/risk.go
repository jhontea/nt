package engine

import "fmt"

type RiskConfig struct {
	MaxOrderValue float64 `json:"max_order_value"`
}

type RiskManager struct{}

func NewRiskManager() *RiskManager {
	return &RiskManager{}
}

func (r *RiskManager) Check(cfg RiskConfig, notional float64) error {
	if cfg.MaxOrderValue > 0 && notional > cfg.MaxOrderValue {
		return fmt.Errorf("order value %.2f exceeds max %.2f", notional, cfg.MaxOrderValue)
	}
	return nil
}
