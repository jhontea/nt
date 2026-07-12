package model

import "time"

type User struct {
	ID           int64     `db:"id" json:"id"`
	Username     string    `db:"username" json:"username"`
	Email        string    `db:"email" json:"email"`
	PasswordHash string    `db:"password_hash" json:"-"`
	CreatedAt    time.Time `db:"created_at" json:"created_at"`
}

type APIKey struct {
	ID        int64     `db:"id" json:"id"`
	UserID    int64     `db:"user_id" json:"user_id"`
	APIKey    string    `db:"api_key" json:"api_key"`
	SecretKey string    `db:"secret_key" json:"-"`
	IsActive  bool      `db:"is_active" json:"is_active"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

type Session struct {
	ID             int64      `db:"id" json:"id"`
	UserID         int64      `db:"user_id" json:"user_id"`
	Name           string     `db:"name" json:"name"`
	Strategy       string     `db:"strategy" json:"strategy"`
	Mode           string     `db:"mode" json:"mode"`
	Symbol         string     `db:"symbol" json:"symbol"`
	Config         string     `db:"config" json:"config"`
	Status         string     `db:"status" json:"status"`
	VirtualBalance *float64   `db:"virtual_balance" json:"virtual_balance,omitempty"`
	InitialBalance *float64   `db:"initial_balance" json:"initial_balance,omitempty"`
	Notes          string     `db:"notes"           json:"notes"`
	StartedAt      *time.Time `db:"started_at" json:"started_at,omitempty"`
	StoppedAt      *time.Time `db:"stopped_at" json:"stopped_at,omitempty"`
	CreatedAt      time.Time  `db:"created_at" json:"created_at"`
}

type Order struct {
	ID               int64     `db:"id" json:"id"`
	SessionID        *int64    `db:"session_id" json:"session_id,omitempty"`
	OrderID          string    `db:"order_id" json:"order_id"`
	ClientID         string    `db:"client_id" json:"client_id"`
	Symbol           string    `db:"symbol" json:"symbol"`
	Side             string    `db:"side" json:"side"`
	Type             string    `db:"type" json:"type"`
	Price            string    `db:"price" json:"price"`
	Quantity         string    `db:"quantity" json:"quantity"`
	Status           string    `db:"status" json:"status"`
	ExecutedQty      string    `db:"executed_qty" json:"executed_qty"`
	ExecutedPrice    string    `db:"executed_price" json:"executed_price"`
	ExecutedQuoteQty string    `db:"executed_quote_qty" json:"executed_quote_qty"`
	CreatedAt        time.Time `db:"created_at" json:"created_at"`
}

type Trade struct {
	ID        int64     `db:"id" json:"id"`
	SessionID *int64    `db:"session_id" json:"session_id,omitempty"`
	OrderID   string    `db:"order_id" json:"order_id"`
	Symbol    string    `db:"symbol" json:"symbol"`
	Side      string    `db:"side" json:"side"`
	Price     string    `db:"price" json:"price"`
	Quantity  string    `db:"quantity" json:"quantity"`
	Fee       string    `db:"fee" json:"fee"`
	FeeAsset  string    `db:"fee_asset" json:"fee_asset"`
	PnL       string    `db:"pnl" json:"pnl"`
	TradedAt  time.Time `db:"traded_at" json:"traded_at"`
}

type Candle struct {
	ID       int64  `db:"id" json:"id"`
	Symbol   string `db:"symbol" json:"symbol"`
	Interval string `db:"interval" json:"interval"`
	OpenTime int64  `db:"open_time" json:"open_time"`
	Open     string `db:"open" json:"open"`
	High     string `db:"high" json:"high"`
	Low      string `db:"low" json:"low"`
	Close    string `db:"close" json:"close"`
	Volume   string `db:"volume" json:"volume"`
}

type StrategySignal struct {
	ID                      int64      `db:"id" json:"id"`
	SessionID               int64      `db:"session_id" json:"session_id"`
	Symbol                  string     `db:"symbol" json:"symbol"`
	Strategy                string     `db:"strategy" json:"strategy"`
	SignalType              string     `db:"signal_type" json:"signal_type"`
	GridLevelIndex          int        `db:"grid_level_index" json:"grid_level_index"`
	GridLevelPrice          string     `db:"grid_level_price" json:"grid_level_price"`
	MarketPriceAtSignal     string     `db:"market_price_at_signal" json:"market_price_at_signal"`
	Quantity                string     `db:"quantity" json:"quantity"`
	Reason                  string     `db:"reason" json:"reason"`
	ValidationMode          string     `db:"validation_mode" json:"validation_mode"`
	ValidationTargetValue   float64    `db:"validation_target_value" json:"validation_target_value"`
	ValidationInvalidValue  float64    `db:"validation_invalid_value" json:"validation_invalid_value"`
	ValidationWindowMinutes int        `db:"validation_window_minutes" json:"validation_window_minutes"`
	ValidationStatus        string     `db:"validation_status" json:"validation_status"`
	CreatedAt               time.Time  `db:"created_at" json:"created_at"`
	ValidationStartedAt     *time.Time `db:"validation_started_at" json:"validation_started_at,omitempty"`
	ValidationFinishedAt    *time.Time `db:"validation_finished_at" json:"validation_finished_at,omitempty"`
	ResultPct               *float64   `db:"result_pct" json:"result_pct,omitempty"`
	ResultGridSteps         *float64   `db:"result_grid_steps" json:"result_grid_steps,omitempty"`
	MaxFavorableMovePct     *float64   `db:"max_favorable_move_pct" json:"max_favorable_move_pct,omitempty"`
	MaxAdverseMovePct       *float64   `db:"max_adverse_move_pct" json:"max_adverse_move_pct,omitempty"`
	MaxFavorableGridSteps   *float64   `db:"max_favorable_grid_steps" json:"max_favorable_grid_steps,omitempty"`
	MaxAdverseGridSteps     *float64   `db:"max_adverse_grid_steps" json:"max_adverse_grid_steps,omitempty"`
	ValidationNote          string     `db:"validation_note" json:"validation_note,omitempty"`
}

type SignalSummary struct {
	SessionID        int64   `json:"session_id"`
	TotalCount       int     `json:"total_count"`
	BuyCount         int     `json:"buy_count"`
	SellCount        int     `json:"sell_count"`
	PendingCount     int     `json:"pending_count"`
	ConfirmedCount   int     `json:"confirmed_count"`
	InvalidatedCount int     `json:"invalidated_count"`
	ExpiredCount     int     `json:"expired_count"`
	SuccessRate      float64 `json:"success_rate"`
}
