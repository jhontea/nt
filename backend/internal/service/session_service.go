package service

import (
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/repository"
)

const DefaultPaperBalance = 1000.0

type SessionService struct {
	repo *repository.SessionRepo
	PnL  *PnLService
}

func NewSessionService(repo *repository.SessionRepo) *SessionService {
	return &SessionService{repo: repo}
}

func NewSessionServiceWithPnL(repo *repository.SessionRepo, pnl *PnLService) *SessionService {
	return &SessionService{repo: repo, PnL: pnl}
}

func (s *SessionService) Create(userID int64, name, strategy, mode, symbol, config string) (*model.Session, error) {
	session := &model.Session{
		UserID:   userID,
		Name:     name,
		Strategy: strategy,
		Mode:     mode,
		Symbol:   symbol,
		Config:   config,
		Status:   "stopped",
	}
	if mode == "paper" {
		bal := DefaultPaperBalance
		session.VirtualBalance = &bal
	}
	return s.repo.Create(session)
}

func (s *SessionService) List(userID int64) ([]model.Session, error) {
	return s.repo.ListByUser(userID)
}

func (s *SessionService) GetByID(id int64) (*model.Session, error) {
	return s.repo.FindByID(id)
}

func (s *SessionService) Update(session *model.Session) error {
	return s.repo.Update(session)
}

func (s *SessionService) UpdateStatus(id int64, status string) error {
	return s.repo.UpdateStatus(id, status)
}

func (s *SessionService) UpdateStartedAt(id int64) error {
	return s.repo.UpdateStartedAt(id)
}

func (s *SessionService) UpdateStoppedAt(id int64) error {
	return s.repo.UpdateStoppedAt(id)
}
