package model

type Mode string
type Strategy string
type Status string
type Side string
type OrderStatus string

const (
	ModeSignal Mode = "signal"
	ModePaper  Mode = "paper"
	ModeLive   Mode = "live"
)

const (
	StratGrid  Strategy = "grid"
	StratTrend Strategy = "trend"
	StratDCA   Strategy = "dca"
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
