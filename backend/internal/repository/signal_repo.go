package repository

import (
	"context"
	"database/sql"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
)

//go:generate go run go.uber.org/mock/mockgen -source=$GOFILE -destination=mocks/mock_signal.go -package=mocks

type StrategySignalRepository interface {
	Create(ctx context.Context, s *model.StrategySignal) (*model.StrategySignal, error)
	ListBySession(ctx context.Context, sessionID int64, limit int) ([]model.StrategySignal, error)
	ListPending(ctx context.Context, sessionID int64) ([]model.StrategySignal, error)
	UpdateValidation(ctx context.Context, id int64, status string, resultPct, resultGridSteps, maxFavPct, maxAdvPct, maxFavGrid, maxAdvGrid float64, note string) error
	GetSummary(ctx context.Context, sessionID int64) (*model.SignalSummary, error)
}

type StrategySignalRepo struct {
	db *sqlx.DB
}

func NewStrategySignalRepo(db *sqlx.DB) *StrategySignalRepo {
	return &StrategySignalRepo{db: db}
}

func (r *StrategySignalRepo) Create(ctx context.Context, s *model.StrategySignal) (*model.StrategySignal, error) {
	var id int64
	err := r.db.GetContext(ctx, &id,
		r.db.Rebind(`INSERT INTO strategy_signals (session_id, symbol, strategy, signal_type, grid_level_index, grid_level_price,
			market_price_at_signal, quantity, reason, validation_mode, validation_target_value,
			validation_invalid_value, validation_window_minutes, validation_status, validation_note)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '') RETURNING id`),
		s.SessionID, s.Symbol, s.Strategy, s.SignalType, s.GridLevelIndex, s.GridLevelPrice,
		s.MarketPriceAtSignal, s.Quantity, s.Reason, s.ValidationMode, s.ValidationTargetValue,
		s.ValidationInvalidValue, s.ValidationWindowMinutes,
	)
	if err != nil {
		return nil, err
	}
	return r.findByID(ctx, id)
}

func (r *StrategySignalRepo) findByID(ctx context.Context, id int64) (*model.StrategySignal, error) {
	var s model.StrategySignal
	err := r.db.GetContext(ctx, &s, r.db.Rebind("SELECT * FROM strategy_signals WHERE id = ?"), id)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *StrategySignalRepo) ListBySession(ctx context.Context, sessionID int64, limit int) ([]model.StrategySignal, error) {
	var signals []model.StrategySignal
	if limit <= 0 {
		limit = 50
	}
	err := r.db.SelectContext(ctx, &signals,
		r.db.Rebind("SELECT * FROM strategy_signals WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"), sessionID, limit)
	if err != nil {
		return nil, err
	}
	return signals, nil
}

func (r *StrategySignalRepo) ListPending(ctx context.Context, sessionID int64) ([]model.StrategySignal, error) {
	var signals []model.StrategySignal
	err := r.db.SelectContext(ctx, &signals,
		r.db.Rebind("SELECT * FROM strategy_signals WHERE session_id = ? AND validation_status = 'pending' ORDER BY created_at ASC"),
		sessionID)
	if err != nil {
		return nil, err
	}
	return signals, nil
}

func (r *StrategySignalRepo) UpdateValidation(ctx context.Context, id int64, status string, resultPct, resultGridSteps, maxFavPct, maxAdvPct, maxFavGrid, maxAdvGrid float64, note string) error {
	_, err := r.db.ExecContext(ctx,
		r.db.Rebind(`UPDATE strategy_signals SET validation_status = ?, result_pct = ?, result_grid_steps = ?,
			max_favorable_move_pct = ?, max_adverse_move_pct = ?,
			max_favorable_grid_steps = ?, max_adverse_grid_steps = ?,
			validation_note = ?, validation_finished_at = CURRENT_TIMESTAMP WHERE id = ?`),
		status, resultPct, resultGridSteps, maxFavPct, maxAdvPct, maxFavGrid, maxAdvGrid, note, id)
	return err
}

func (r *StrategySignalRepo) GetSummary(ctx context.Context, sessionID int64) (*model.SignalSummary, error) {
	var summary model.SignalSummary
	summary.SessionID = sessionID

	err := r.db.QueryRowContext(ctx,
		r.db.Rebind(`SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE validation_status = 'confirmed'),
			COUNT(*) FILTER (WHERE validation_status = 'invalidated'),
			COUNT(*) FILTER (WHERE validation_status = 'expired'),
			COUNT(*) FILTER (WHERE validation_status = 'pending'),
			COUNT(*) FILTER (WHERE signal_type = 'buy'),
			COUNT(*) FILTER (WHERE signal_type = 'sell')
		FROM strategy_signals WHERE session_id = ?`), sessionID,
	).Scan(
		&summary.TotalCount,
		&summary.ConfirmedCount,
		&summary.InvalidatedCount,
		&summary.ExpiredCount,
		&summary.PendingCount,
		&summary.BuyCount,
		&summary.SellCount,
	)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	if summary.TotalCount > 0 {
		summary.SuccessRate = float64(summary.ConfirmedCount) / float64(summary.TotalCount) * 100
	}

	return &summary, nil
}

var _ StrategySignalRepository = (*StrategySignalRepo)(nil)