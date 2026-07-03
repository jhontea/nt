package service

import (
	"database/sql"
	"strconv"

	"github.com/jmoiron/sqlx"
)

type PnLSummary struct {
	RealizedPnL   string  `json:"realized_pnl"`
	UnrealizedPnL string  `json:"unrealized_pnl"`
	TotalPnL      string  `json:"total_pnl"`
	WinCount      int     `json:"win_count"`
	LossCount     int     `json:"loss_count"`
	WinRate       float64 `json:"win_rate"`
	TradeCount    int     `json:"trade_count"`
	Balance       float64 `json:"balance"`
}

type PnLService struct {
	db *sqlx.DB
}

func NewPnLService(db *sqlx.DB) *PnLService {
	return &PnLService{db: db}
}

func (s *PnLService) GetSessionPnL(sessionID int64) (*PnLSummary, error) {
	var realizedPnL sql.NullFloat64
	if err := s.db.Get(&realizedPnL, "SELECT COALESCE(SUM(CAST(pnl AS REAL)), 0) FROM trades WHERE session_id = ?", sessionID); err != nil {
		return nil, err
	}

	var winCount, lossCount int
	s.db.Get(&winCount, "SELECT COUNT(*) FROM trades WHERE session_id = ? AND CAST(pnl AS REAL) > 0", sessionID)
	s.db.Get(&lossCount, "SELECT COUNT(*) FROM trades WHERE session_id = ? AND CAST(pnl AS REAL) <= 0", sessionID)

	var tradeCount int
	s.db.Get(&tradeCount, "SELECT COUNT(*) FROM trades WHERE session_id = ?", sessionID)

	var balance sql.NullFloat64
	if err := s.db.Get(&balance, "SELECT virtual_balance FROM sessions WHERE id = ?", sessionID); err != nil {
		return nil, err
	}

	winRate := 0.0
	if tradeCount > 0 {
		winRate = float64(winCount) / float64(tradeCount) * 100
	}

	realized := 0.0
	if realizedPnL.Valid {
		realized = realizedPnL.Float64
	}
	bal := 0.0
	if balance.Valid {
		bal = balance.Float64
	}

	return &PnLSummary{
		RealizedPnL:   strconv.FormatFloat(realized, 'f', 2, 64),
		UnrealizedPnL: "0.00",
		TotalPnL:      strconv.FormatFloat(realized, 'f', 2, 64),
		WinCount:      winCount,
		LossCount:     lossCount,
		WinRate:       winRate,
		TradeCount:    tradeCount,
		Balance:       bal,
	}, nil
}
