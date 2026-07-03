package engine

import "github.com/user/nt/internal/model"

type StrategyEvaluator interface {
	Evaluate(session model.Session, configStr string) []Signal
}
