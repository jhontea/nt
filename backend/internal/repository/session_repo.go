package repository

import (
	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
)

type SessionRepo struct {
	db *sqlx.DB
}

func NewSessionRepo(db *sqlx.DB) *SessionRepo {
	return &SessionRepo{db: db}
}

func (r *SessionRepo) Create(s *model.Session) (*model.Session, error) {
	result, err := r.db.Exec(
		`INSERT INTO sessions (user_id, name, strategy, mode, symbol, config, status, virtual_balance)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		s.UserID, s.Name, s.Strategy, s.Mode, s.Symbol, s.Config, s.Status, s.VirtualBalance,
	)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	return r.FindByID(id)
}

func (r *SessionRepo) FindByID(id int64) (*model.Session, error) {
	var s model.Session
	err := r.db.Get(&s, "SELECT * FROM sessions WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *SessionRepo) ListByUser(userID int64) ([]model.Session, error) {
	var sessions []model.Session
	err := r.db.Select(&sessions, "SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC", userID)
	if err != nil {
		return nil, err
	}
	return sessions, nil
}

func (r *SessionRepo) UpdateStatus(id int64, status string) error {
	_, err := r.db.Exec("UPDATE sessions SET status = ? WHERE id = ?", status, id)
	return err
}

func (r *SessionRepo) UpdateStartedAt(id int64) error {
	_, err := r.db.Exec("UPDATE sessions SET started_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	return err
}

func (r *SessionRepo) UpdateStoppedAt(id int64) error {
	_, err := r.db.Exec("UPDATE sessions SET stopped_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	return err
}

func (r *SessionRepo) Update(s *model.Session) error {
	_, err := r.db.Exec(
		`UPDATE sessions SET name=?, config=?, symbol=?, strategy=? WHERE id=?`,
		s.Name, s.Config, s.Symbol, s.Strategy, s.ID,
	)
	return err
}
