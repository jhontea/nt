package engine

//go:generate go run go.uber.org/mock/mockgen -source=$GOFILE -destination=mocks/mock_strategy.go -package=mocks

import "github.com/user/nt/internal/model"

type StrategyEvaluator interface {
	Evaluate(session model.Session, configStr string) []Signal
}
