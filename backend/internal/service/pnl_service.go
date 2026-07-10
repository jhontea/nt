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

type HoldingPosition struct {
	TotalQty float64 `db:"total_qty"`
	AvgPrice float64 `db:"avg_price"`
}

type LastSignal struct {
	SignalType string   `db:"signal_type" json:"signal_type"`
	ResultPct  *float64 `db:"result_pct"  json:"result_pct"`
	CreatedAt  string   `db:"created_at"  json:"created_at"`
}

func (s *PnLService) GetHoldingPosition(ctx context.Context, sessionID int64) (*HoldingPosition, error) {
	var pos HoldingPosition
	err := s.db.GetContext(ctx, &pos, s.db.Rebind(
		`SELECT COALESCE(SUM(CAST(quantity AS REAL)),0) as total_qty,
		        COALESCE(AVG(CAST(price AS REAL)),0) as avg_price
		 FROM orders WHERE session_id = ? AND side = 'buy' AND status = 'filled'`), sessionID)
	if err != nil {
		return nil, err
	}
	return &pos, nil
}

func (s *PnLService) GetLastSignal(ctx context.Context, sessionID int64) (*LastSignal, error) {
	var sig LastSignal
	err := s.db.GetContext(ctx, &sig, s.db.Rebind(
		`SELECT signal_type, result_pct, created_at FROM strategy_signals
		 WHERE session_id = ? AND validation_status = 'confirmed'
		 ORDER BY created_at DESC LIMIT 1`), sessionID)
	if err != nil {
		return nil, err
	}
	return &sig, nil
}

type SignalHistoryEntry struct {
	Side      string   `db:"signal_type"            json:"side"`
	Price     string   `db:"market_price_at_signal" json:"price"`
	ResultPct *float64 `db:"result_pct"             json:"result_pct,omitempty"`
	CreatedAt string   `db:"created_at"             json:"created_at"`
}

func (s *PnLService) GetSignalHistory(ctx context.Context, sessionID int64, limit int) ([]SignalHistoryEntry, error) {
	var history []SignalHistoryEntry
	err := s.db.SelectContext(ctx, &history, s.db.Rebind(
		`SELECT signal_type, market_price_at_signal, result_pct, created_at
		 FROM strategy_signals WHERE session_id = ? AND validation_status = 'confirmed'
		 ORDER BY created_at DESC LIMIT ?`), sessionID, limit)
	if err != nil {
		return nil, err
	}
	return history, nil
}

type DCAStats struct {
	BuyCount      int     `json:"buy_count"`
	TotalQty      float64 `json:"total_qty"`
	TotalInvested float64 `json:"total_invested"`
	AvgBuyPrice   float64 `json:"avg_buy_price"`
	LastBuyPrice  float64 `json:"last_buy_price"`
}

func (s *PnLService) GetDCAStats(ctx context.Context, sessionID int64) (*DCAStats, error) {
	var row struct {
		BuyCount      int     `db:"buy_count"`
		TotalQty      float64 `db:"total_qty"`
		TotalInvested float64 `db:"total_invested"`
		LastBuyPrice  float64 `db:"last_buy_price"`
	}
	err := s.db.GetContext(ctx, &row, s.db.Rebind(`
		SELECT
			COUNT(*) AS buy_count,
			COALESCE(SUM(CAST(quantity AS REAL)), 0) AS total_qty,
			COALESCE(SUM(
				CASE WHEN executed_quote_qty IS NOT NULL AND CAST(executed_quote_qty AS REAL) > 0
				THEN CAST(executed_quote_qty AS REAL)
				ELSE CAST(quantity AS REAL) * CAST(price AS REAL)
				END
			), 0) AS total_invested,
			COALESCE((SELECT CAST(price AS REAL) FROM orders
				WHERE session_id=? AND side='buy'
				AND status IN ('filled','signal') ORDER BY id DESC LIMIT 1), 0) AS last_buy_price
		FROM orders
		WHERE session_id=? AND side='buy' AND status IN ('filled','signal')
	`), sessionID, sessionID)
	if err != nil {
		return nil, err
	}
	avgBuyPrice := 0.0
	if row.TotalQty > 0 {
		avgBuyPrice = row.TotalInvested / row.TotalQty
	}
	return &DCAStats{
		BuyCount:      row.BuyCount,
		TotalQty:      row.TotalQty,
		TotalInvested: row.TotalInvested,
		AvgBuyPrice:   avgBuyPrice,
		LastBuyPrice:  row.LastBuyPrice,
	}, nil
}

func (s *PnLService) GetOrders(ctx context.Context, sessionID, cursor, limit int64) ([]model.Order, error) {
	orders := []model.Order{}
	var err error
	if cursor > 0 {
		err = s.db.SelectContext(ctx, &orders,
			s.db.Rebind(`SELECT id, session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, created_at
			 FROM orders WHERE session_id = ? AND id < ? ORDER BY id DESC LIMIT ?`), sessionID, cursor, limit)
	} else {
		err = s.db.SelectContext(ctx, &orders,
			s.db.Rebind(`SELECT id, session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, created_at
			 FROM orders WHERE session_id = ? ORDER BY id DESC LIMIT ?`), sessionID, limit)
	}
	if err != nil {
		return nil, err
	}
	return orders, nil
}