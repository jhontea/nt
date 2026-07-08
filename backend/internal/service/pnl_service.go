package service

import (
	"context"
	"database/sql"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
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

func (s *PnLService) GetSessionPnL(ctx context.Context, sessionID int64) (*PnLSummary, error) {
	var realizedPnL sql.NullFloat64
	var winCount, lossCount, tradeCount int
	if err := s.db.QueryRowContext(ctx,
		s.db.Rebind(`SELECT
			COALESCE(SUM(CAST(pnl AS REAL)), 0),
			COUNT(*) FILTER (WHERE CAST(pnl AS REAL) > 0),
			COUNT(*) FILTER (WHERE CAST(pnl AS REAL) <= 0),
			COUNT(*)
		FROM trades WHERE session_id = ?`), sessionID,
	).Scan(&realizedPnL, &winCount, &lossCount, &tradeCount); err != nil {
		return nil, err
	}

	var balance sql.NullFloat64
	if err := s.db.GetContext(ctx, &balance, s.db.Rebind("SELECT virtual_balance FROM sessions WHERE id = ?"), sessionID); err != nil {
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

func (s *PnLService) GetOrders(ctx context.Context, sessionID int64) ([]model.Order, error) {
	var orders []model.Order
	err := s.db.SelectContext(ctx, &orders,
		s.db.Rebind(`SELECT id, session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, created_at
		 FROM orders WHERE session_id = ? ORDER BY created_at DESC LIMIT 50`), sessionID)
	if err != nil {
		return nil, err
	}
	return orders, nil
}