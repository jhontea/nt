package model

import "time"

type User struct {
	ID           int64     `db:"id" json:"id"`
	Username     string    `db:"username" json:"username"`
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
	ID        int64      `db:"id" json:"id"`
	UserID    int64      `db:"user_id" json:"user_id"`
	Name      string     `db:"name" json:"name"`
	Strategy  string     `db:"strategy" json:"strategy"`
	Mode      string     `db:"mode" json:"mode"`
	Symbol    string     `db:"symbol" json:"symbol"`
	Config    string     `db:"config" json:"config"`
	Status    string     `db:"status" json:"status"`
	StartedAt *time.Time `db:"started_at" json:"started_at,omitempty"`
	StoppedAt *time.Time `db:"stopped_at" json:"stopped_at,omitempty"`
	CreatedAt time.Time  `db:"created_at" json:"created_at"`
}

type Order struct {
	ID            int64     `db:"id" json:"id"`
	SessionID     *int64    `db:"session_id" json:"session_id,omitempty"`
	OrderID       string    `db:"order_id" json:"order_id"`
	Symbol        string    `db:"symbol" json:"symbol"`
	Side          string    `db:"side" json:"side"`
	Type          string    `db:"type" json:"type"`
	Price         string    `db:"price" json:"price"`
	Quantity      string    `db:"quantity" json:"quantity"`
	Status        string    `db:"status" json:"status"`
	ExecutedQty   string    `db:"executed_qty" json:"executed_qty"`
	ExecutedPrice string    `db:"executed_price" json:"executed_price"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
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
