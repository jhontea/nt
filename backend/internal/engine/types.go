package engine

type Signal struct {
	SessionID int64  `json:"session_id"`
	Symbol    string `json:"symbol"`
	Side      string `json:"side"` // "buy" | "sell"
	Price     string `json:"price"`
	Quantity  string `json:"quantity"`
	Reason    string `json:"reason"`
	Timestamp int64  `json:"timestamp"`
}

type GridConfig struct {
	UpperPrice float64 `json:"upper_price"`
	LowerPrice float64 `json:"lower_price"`
	GridCount  int     `json:"grid_count"`
	Quantity   string  `json:"quantity"`
}

type TrendConfig struct {
	FastPeriod int    `json:"fast_period"`
	SlowPeriod int    `json:"slow_period"`
	Quantity   string `json:"quantity"`
}
