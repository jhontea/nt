package repository

//go:generate go run go.uber.org/mock/mockgen -source=$GOFILE -destination=mocks/mock_session.go -package=mocks

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
)

type SessionRepository interface {
	Create(ctx context.Context, s *model.Session) (*model.Session, error)
	FindByID(ctx context.Context, id int64) (*model.Session, error)
	ListByUser(ctx context.Context, userID int64) ([]model.Session, error)
	UpdateStatus(ctx context.Context, id int64, status string) error
	UpdateStartedAt(ctx context.Context, id int64) error
	UpdateStoppedAt(ctx context.Context, id int64) error
	Update(ctx context.Context, s *model.Session) error
}

type SessionRepo struct {
	db *sqlx.DB
}

func NewSessionRepo(db *sqlx.DB) *SessionRepo {
	return &SessionRepo{db: db}
}

func (r *SessionRepo) Create(ctx context.Context, s *model.Session) (*model.Session, error) {
	var id int64
	err := r.db.GetContext(ctx, &id,
		r.db.Rebind(`INSERT INTO sessions (user_id, name, strategy, mode, symbol, config, status, virtual_balance)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`),
		s.UserID, s.Name, s.Strategy, s.Mode, s.Symbol, s.Config, s.Status, s.VirtualBalance,
	)
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

func (r *SessionRepo) FindByID(ctx context.Context, id int64) (*model.Session, error) {
	var s model.Session
	err := r.db.GetContext(ctx, &s, r.db.Rebind("SELECT * FROM sessions WHERE id = ?"), id)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *SessionRepo) ListByUser(ctx context.Context, userID int64) ([]model.Session, error) {
	var sessions []model.Session
	err := r.db.SelectContext(ctx, &sessions, r.db.Rebind("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC"), userID)
	if err != nil {
		return nil, err
	}
	return sessions, nil
}

func (r *SessionRepo) UpdateStatus(ctx context.Context, id int64, status string) error {
	_, err := r.db.ExecContext(ctx, r.db.Rebind("UPDATE sessions SET status = ? WHERE id = ?"), status, id)
	return err
}

func (r *SessionRepo) UpdateStartedAt(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, r.db.Rebind("UPDATE sessions SET started_at = CURRENT_TIMESTAMP WHERE id = ?"), id)
	return err
}

func (r *SessionRepo) UpdateStoppedAt(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, r.db.Rebind("UPDATE sessions SET stopped_at = CURRENT_TIMESTAMP WHERE id = ?"), id)
	return err
}

func (r *SessionRepo) Update(ctx context.Context, s *model.Session) error {
	_, err := r.db.ExecContext(ctx,
		r.db.Rebind(`UPDATE sessions SET name=?, config=?, symbol=?, strategy=? WHERE id=?`),
		s.Name, s.Config, s.Symbol, s.Strategy, s.ID,
	)
	return err
}

var _ SessionRepository = (*SessionRepo)(nil)