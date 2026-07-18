package engine

import "fmt"

type RiskConfig struct {
	MaxOrderValue    float64 `json:"max_order_value"`
	MaxPositionValue float64 `json:"max_position_value"`
}

func (r *RiskManager) CheckPosition(cfg RiskConfig, projectedNotional float64) error {
	if cfg.MaxPositionValue > 0 && projectedNotional > cfg.MaxPositionValue {
		return fmt.Errorf("projected position value %.2f exceeds max %.2f", projectedNotional, cfg.MaxPositionValue)
	}
	return nil
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
