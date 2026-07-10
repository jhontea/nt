package engine

import (
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
)

// StrategyEvaluator defines the interface for all trading strategies.
// Each strategy receives the session context and its config JSON string,
// and returns zero or more trading signals.
type StrategyEvaluator interface {
	Evaluate(session model.Session, configStr string) []Signal
}

// intervalAgo returns a SQL expression for "now minus duration" compatible with
// both PostgreSQL (pgx) and SQLite (used in tests).
func intervalAgo(db *sqlx.DB, minutes int) string {
	if db.DriverName() == "sqlite" {
		return fmt.Sprintf("datetime('now', '-%d minutes')", minutes)
	}
	return fmt.Sprintf("NOW() - INTERVAL '%d minutes'", minutes)
}
