package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

const (
	orderSideBuy  = 0
	orderSideSell = 1
	orderTypeMarket = 2
)

type LiveEngine struct {
	client *tokocrypto.Client
	risk   *RiskManager
	db     *sqlx.DB
}

func NewLiveEngine(client *tokocrypto.Client, db *sqlx.DB) *LiveEngine {
	return &LiveEngine{client: client, risk: NewRiskManager(), db: db}
}

func (l *LiveEngine) Execute(session model.Session, signal Signal) error {
	ticker, err := l.client.GetTicker(session.Symbol)
	if err != nil {
		return fmt.Errorf("get ticker: %w", err)
	}
	price := ticker.LastPrice

	qtyF, err := strconv.ParseFloat(signal.Quantity, 64)
	if err != nil {
		return fmt.Errorf("live execute: invalid quantity %q: %w", signal.Quantity, err)
	}
	priceF, err := strconv.ParseFloat(price, 64)
	if err != nil {
		return fmt.Errorf("live execute: invalid price %q: %w", price, err)
	}
	notional := qtyF * priceF

	var riskCfg RiskConfig
	if err := json.Unmarshal([]byte(session.Config), &riskCfg); err != nil {
		riskCfg = RiskConfig{}
	}
	if err := l.risk.Check(riskCfg, notional); err != nil {
		return fmt.Errorf("risk check failed: %w", err)
	}

	side := orderSideBuy
	if signal.Side == string(model.SideSell) {
		side = orderSideSell
	}

	req := tokocrypto.OrderRequest{
		Symbol: session.Symbol,
		Side:   side,
		Type:   orderTypeMarket,
	}
	if side == orderSideSell {
		req.Quantity = signal.Quantity
	} else {
		req.QuoteOrderQty = strconv.FormatFloat(notional, 'f', 8, 64)
	}

	order, err := l.client.PlaceOrder(req)
	if err != nil {
		return fmt.Errorf("place order: %w", err)
	}

	// Order is live on the exchange — DB write failure must be logged prominently
	// but not retried here to avoid duplicate orders. Reconciliation needed if this fails.
	if _, err = l.db.Exec(
		l.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, ?, ?, ?)`),
		session.ID, fmt.Sprintf("%d", order.OrderID),
		session.Symbol, signal.Side, price, signal.Quantity,
		strconv.Itoa(order.Status), order.ExecutedQty, order.ExecutedPrice,
	); err != nil {
		slog.Error("live order placed on exchange but DB save failed — manual reconciliation required",
			"session", session.ID, "order_id", order.OrderID, "symbol", session.Symbol,
			"side", signal.Side, "qty", signal.Quantity, "price", price, "error", err)
		return fmt.Errorf("save order: %w", err)
	}

	slog.Info("live order", "side", signal.Side, "symbol", session.Symbol, "qty", signal.Quantity, "price", price, "orderId", order.OrderID)
	return nil
}
