package engine

import "github.com/user/nt/internal/model"

// StrategyEvaluator defines the interface for all trading strategies.
// Each strategy receives the session context and its config JSON string,
// and returns zero or more trading signals.
type StrategyEvaluator interface {
	Evaluate(session model.Session, configStr string) []Signal
}
