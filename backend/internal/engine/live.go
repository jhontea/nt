package engine

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
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

	qtyF, _ := strconv.ParseFloat(signal.Quantity, 64)
	priceF, _ := strconv.ParseFloat(price, 64)
	notional := qtyF * priceF

	var riskCfg RiskConfig
	if err := json.Unmarshal([]byte(session.Config), &riskCfg); err != nil {
		riskCfg = RiskConfig{}
	}
	if err := l.risk.Check(riskCfg, notional); err != nil {
		return fmt.Errorf("risk check failed: %w", err)
	}

	side := 0
	if signal.Side == "sell" {
		side = 1
	}

	order, err := l.client.PlaceOrder(tokocrypto.OrderRequest{
		Symbol:   session.Symbol,
		Side:     side,
		Type:     2,
		Quantity: signal.Quantity,
		Price:    price,
	})
	if err != nil {
		return fmt.Errorf("place order: %w", err)
	}

	_, err = l.db.Exec(
		`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, ?, ?, ?)`,
		session.ID, fmt.Sprintf("%d", order.OrderID),
		session.Symbol, signal.Side, price, signal.Quantity,
		strconv.Itoa(order.Status), order.ExecutedQty, order.ExecutedPrice,
	)
	if err != nil {
		log.Printf("save live order error: %v", err)
	}

	log.Printf("LIVE: %s %s %s @ %s (orderId=%d)", signal.Side, session.Symbol, signal.Quantity, price, order.OrderID)
	return nil
}
