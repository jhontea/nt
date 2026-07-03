package model

// Mode represents the trading execution mode.
type Mode string

// Strategy represents the trading strategy type.
type Strategy string

// Status represents the session running status.
type Status string

// Side represents buy or sell.
type Side string

// OrderStatus represents the lifecycle status of an order.
type OrderStatus string

const (
	ModeSignal Mode = "signal" // generate signals only, no execution
	ModePaper  Mode = "paper"  // simulated trading with virtual balance
	ModeLive   Mode = "live"   // real trading via exchange API
)

const (
	StratGrid  Strategy = "grid"  // grid trading: buy/sell at fixed price levels
	StratTrend Strategy = "trend" // trend following: SMA crossover detection
	StratDCA   Strategy = "dca"   // dollar-cost average: periodic fixed-amount buys
)

const (
	StatRunning Status = "running"
	StatStopped Status = "stopped"
	StatPaused  Status = "paused"
)

const (
	SideBuy  Side = "buy"
	SideSell Side = "sell"
)

const (
	OrdNew      OrderStatus = "new"
	OrdFilled   OrderStatus = "filled"
	OrdClosed   OrderStatus = "closed"
	OrdSignal   OrderStatus = "signal"
	OrdCanceled OrderStatus = "canceled"
)
