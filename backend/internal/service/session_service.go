package service

import (
	"context"

	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/repository"
)

const DefaultPaperBalance = 1000.0

type SessionService struct {
	repo repository.SessionRepository
	PnL  *PnLService
}

func NewSessionService(repo repository.SessionRepository) *SessionService {
	return &SessionService{repo: repo}
}

func NewSessionServiceWithPnL(repo repository.SessionRepository, pnl *PnLService) *SessionService {
	return &SessionService{repo: repo, PnL: pnl}
}

func (s *SessionService) Create(ctx context.Context, userID int64, name, strategy, mode, symbol, config string) (*model.Session, error) {
	session := &model.Session{
		UserID:   userID,
		Name:     name,
		Strategy: strategy,
		Mode:     mode,
		Symbol:   symbol,
		Config:   config,
		Status:   string(model.StatStopped),
	}
	if mode == string(model.ModePaper) {
		bal := DefaultPaperBalance
		session.VirtualBalance = &bal
	}
	return s.repo.Create(ctx, session)
}

func (s *SessionService) List(ctx context.Context, userID int64) ([]model.Session, error) {
	return s.repo.ListByUser(ctx, userID)
}

func (s *SessionService) GetByID(ctx context.Context, id int64) (*model.Session, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *SessionService) Update(ctx context.Context, session *model.Session) error {
	return s.repo.Update(ctx, session)
}

func (s *SessionService) UpdateStatus(ctx context.Context, id int64, status string) error {
	return s.repo.UpdateStatus(ctx, id, status)
}

func (s *SessionService) UpdateStartedAt(ctx context.Context, id int64) error {
	return s.repo.UpdateStartedAt(ctx, id)
}

func (s *SessionService) UpdateStoppedAt(ctx context.Context, id int64) error {
	return s.repo.UpdateStoppedAt(ctx, id)
}
