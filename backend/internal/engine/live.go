package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

const (
	orderSideBuy    = 0
	orderSideSell   = 1
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

// PreflightCheck validates API key and sufficient balance before starting a live session.
func (l *LiveEngine) PreflightCheck(symbol, side, quantity, price string) error {
	acc, err := l.client.GetAccount()
	if err != nil {
		return fmt.Errorf("tidak bisa terhubung ke TokoCrypto: %w", err)
	}
	if acc.CanTrade != 1 {
		return fmt.Errorf("akun TokoCrypto tidak diizinkan trading (CanTrade=%d)", acc.CanTrade)
	}

	// Determine which asset we need and how much
	parts := strings.SplitN(symbol, "_", 2)
	if len(parts) != 2 {
		return nil // can't parse symbol, skip balance check
	}
	baseAsset := parts[0]
	quoteAsset := parts[1]

	qtyF, _ := strconv.ParseFloat(quantity, 64)
	priceF, _ := strconv.ParseFloat(price, 64)
	notional := qtyF * priceF

	for _, a := range acc.AccountAssets {
		if side == string(model.SideBuy) && a.Asset == quoteAsset {
			free, _ := strconv.ParseFloat(a.Free, 64)
			if free < notional {
				return fmt.Errorf("saldo %s tidak cukup: tersedia %.4f, dibutuhkan %.4f", quoteAsset, free, notional)
			}
			return nil
		}
		if side == string(model.SideSell) && a.Asset == baseAsset {
			free, _ := strconv.ParseFloat(a.Free, 64)
			if free < qtyF {
				return fmt.Errorf("saldo %s tidak cukup: tersedia %.4f, dibutuhkan %.4f", baseAsset, free, qtyF)
			}
			return nil
		}
	}
	return nil // asset not found in account = zero balance, order will fail at exchange
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
	// but not retried here to avoid duplicate orders.
	orderID := fmt.Sprintf("%d", order.OrderID)
	if _, err = l.db.Exec(
		l.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, ?, ?, ?)`),
		session.ID, orderID,
		session.Symbol, signal.Side, price, signal.Quantity,
		strconv.Itoa(order.Status), order.ExecutedQty, order.ExecutedPrice,
	); err != nil {
		slog.Error("live order placed on exchange but DB save failed — manual reconciliation required",
			"session", session.ID, "order_id", order.OrderID, "symbol", session.Symbol,
			"side", signal.Side, "qty", signal.Quantity, "price", price, "error", err)
		return fmt.Errorf("save order: %w", err)
	}

	// Write to trades table for P&L tracking
	execPrice := order.ExecutedPrice
	if execPrice == "" {
		execPrice = price
	}
	execQty := order.ExecutedQty
	if execQty == "" {
		execQty = signal.Quantity
	}

	// Compute PnL for sell orders (avg buy price from open positions)
	pnlStr := "0"
	if signal.Side == string(model.SideSell) {
		pnlStr = l.computeLivePnL(session.ID, execPrice, execQty)
	}

	if _, err = l.db.Exec(
		l.db.Rebind(`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl, traded_at)
		 VALUES (?, ?, ?, ?, ?, ?, '0', '', ?, ?)`),
		session.ID, orderID, session.Symbol, signal.Side,
		execPrice, execQty, pnlStr, time.Now(),
	); err != nil {
		slog.Error("live trade record save failed", "session", session.ID, "order_id", order.OrderID, "error", err)
		// non-fatal: order already saved, just P&L tracking affected
	}

	slog.Info("live order", "side", signal.Side, "symbol", session.Symbol, "qty", signal.Quantity, "price", price, "orderId", order.OrderID)
	return nil
}

// computeLivePnL calculates realized PnL for a sell by averaging all open buy orders.
func (l *LiveEngine) computeLivePnL(sessionID int64, execPrice, execQty string) string {
	type buyPos struct {
		Price    string `db:"price"`
		Quantity string `db:"quantity"`
	}
	var buys []buyPos
	if err := l.db.Select(&buys, l.db.Rebind(
		`SELECT executed_price as price, executed_qty as quantity FROM orders
		 WHERE session_id = ? AND side = 'buy' AND status != 'signal' ORDER BY created_at ASC`), sessionID); err != nil {
		return "0"
	}
	totalQty := 0.0
	totalCost := 0.0
	for _, b := range buys {
		q, _ := strconv.ParseFloat(b.Quantity, 64)
		p, _ := strconv.ParseFloat(b.Price, 64)
		totalQty += q
		totalCost += q * p
	}
	if totalQty == 0 {
		return "0"
	}
	avgBuy := totalCost / totalQty
	sellQty, _ := strconv.ParseFloat(execQty, 64)
	sellPrice, _ := strconv.ParseFloat(execPrice, 64)
	pnl := (sellPrice - avgBuy) * sellQty
	return strconv.FormatFloat(pnl, 'f', 8, 64)
}
