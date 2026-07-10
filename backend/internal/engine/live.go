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
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/tokocrypto"
)

const (
	orderSideBuy    = 0
	orderSideSell   = 1
	orderTypeMarket = 2
)

type LiveEngine struct {
	client   *tokocrypto.Client
	risk     *RiskManager
	db       *sqlx.DB
	notifier *service.Notifier
}

func NewLiveEngine(client *tokocrypto.Client, db *sqlx.DB) *LiveEngine {
	return &LiveEngine{client: client, risk: NewRiskManager(), db: db}
}

func NewLiveEngineWithNotifier(client *tokocrypto.Client, db *sqlx.DB, notifier *service.Notifier) *LiveEngine {
	return &LiveEngine{client: client, risk: NewRiskManager(), db: db, notifier: notifier}
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

	parts := strings.SplitN(symbol, "_", 2)
	if len(parts) != 2 {
		return nil
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
	return nil
}

// liveOrderStatus maps exchange integer status to internal string status.
// ponytail: exchange returns int (2=filled, 3=partially_filled, etc). Map to 'filled' for
// fully-filled market orders so DCA TP/SL queries (status IN ('filled','signal')) work correctly.
func liveOrderStatus(exchangeStatus int) string {
	switch exchangeStatus {
	case 2:
		return string(model.OrdFilled)
	case 3:
		return "partial"
	case 4:
		return string(model.OrdCanceled)
	default:
		return string(model.OrdNew)
	}
}

func (l *LiveEngine) Execute(session model.Session, signal Signal) error {
	// Idempotency check: prevent duplicate orders within a 2-minute window.
	// Guards against double-tick on slow exchange responses or engine restarts.
	var recentCount int
	if err := l.db.Get(&recentCount, l.db.Rebind(
		`SELECT COUNT(*) FROM orders WHERE session_id = ? AND side = ? AND created_at >= NOW() - INTERVAL '2 minutes'`),
		session.ID, signal.Side); err == nil && recentCount > 0 {
		slog.Warn("live: duplicate order suppressed (idempotency window)",
			"session", session.ID, "side", signal.Side, "recent_count", recentCount)
		return nil
	}
	// For grid sell signals: override quantity with actual holdings to avoid
	// selling more than we own. Grid config quantity is per-level, not total.
	resolvedQty := signal.Quantity
	if signal.Side == string(model.SideSell) {
		var actualQty float64
		if err := l.db.Get(&actualQty, l.db.Rebind(
			`SELECT COALESCE(SUM(CAST(executed_qty AS REAL)), 0) FROM orders
			 WHERE session_id = ? AND side = 'buy' AND status = 'filled'`),
			session.ID); err == nil && actualQty > 0 {
			resolvedQty = strconv.FormatFloat(actualQty, 'f', 8, 64)
			slog.Info("live sell: using actual holdings qty", "session", session.ID,
				"signal_qty", signal.Quantity, "actual_qty", resolvedQty)
		}
	}

	ticker, err := l.client.GetTicker(session.Symbol)
	if err != nil {
		return fmt.Errorf("get ticker: %w", err)
	}
	price := ticker.LastPrice

	qtyF, err := strconv.ParseFloat(resolvedQty, 64)
	if err != nil {
		return fmt.Errorf("live execute: invalid quantity %q: %w", resolvedQty, err)
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
		req.Quantity = resolvedQty
	} else {
		req.QuoteOrderQty = strconv.FormatFloat(notional, 'f', 8, 64)
	}

	order, err := l.client.PlaceOrder(req)
	if err != nil {
		return fmt.Errorf("place order: %w", err)
	}

	orderStatus := liveOrderStatus(order.Status)
	orderID := fmt.Sprintf("%d", order.OrderID)

	execPrice := order.ExecutedPrice
	if execPrice == "" {
		execPrice = price
	}
	execQty := order.ExecutedQty
	if execQty == "" {
		execQty = resolvedQty
	}

	// All post-exchange DB writes in one transaction.
	// If this fails, the order is real on the exchange but not locally recorded.
	// Log prominently for manual reconciliation.
	tx, err := l.db.Beginx()
	if err != nil {
		slog.Error("live order placed but failed to begin DB tx — manual reconciliation required",
			"session", session.ID, "order_id", orderID, "symbol", session.Symbol,
			"side", signal.Side, "qty", resolvedQty, "price", price, "error", err)
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err = tx.Exec(
		tx.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, ?, ?, ?)`),
		session.ID, orderID,
		session.Symbol, signal.Side, price, resolvedQty,
		orderStatus, order.ExecutedQty, order.ExecutedPrice,
	); err != nil {
		slog.Error("live order placed on exchange but DB save failed — manual reconciliation required",
			"session", session.ID, "order_id", orderID, "symbol", session.Symbol,
			"side", signal.Side, "qty", resolvedQty, "price", price, "error", err)
		return fmt.Errorf("save order: %w", err)
	}

	pnlStr := "0"
	if signal.Side == string(model.SideSell) {
		// computeLivePnL must read BEFORE buy orders are closed in this tx.
		// We read within the tx so we see consistent state.
		pnlStr = computeLivePnLTx(tx, session.ID, execPrice, execQty)
	}

	// On sell: close all open buy orders AFTER computing PnL
	if signal.Side == string(model.SideSell) {
		if _, err := tx.Exec(
			tx.Rebind(`UPDATE orders SET status = ? WHERE session_id = ? AND side = 'buy' AND status = ?`),
			string(model.OrdClosed), session.ID, string(model.OrdFilled),
		); err != nil {
			return fmt.Errorf("live sell: close buy orders: %w", err)
		}
	}

	if _, err = tx.Exec(
		tx.Rebind(`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl, traded_at)
		 VALUES (?, ?, ?, ?, ?, ?, '0', '', ?, ?)`),
		session.ID, orderID, session.Symbol, signal.Side,
		execPrice, execQty, pnlStr, time.Now(),
	); err != nil {
		return fmt.Errorf("save trade: %w", err)
	}

	if err := tx.Commit(); err != nil {
		slog.Error("live order placed but DB commit failed — manual reconciliation required",
			"session", session.ID, "order_id", orderID, "error", err)
		return fmt.Errorf("commit tx: %w", err)
	}

	slog.Info("live order", "side", signal.Side, "symbol", session.Symbol, "qty", resolvedQty, "price", price, "orderId", order.OrderID)

	if l.notifier != nil {
		l.notifier.SendLiveTrade(session.Name, session.Strategy, session.Symbol,
			signal.Side, orderID, execPrice, execQty, pnlStr)
	}
	return nil
}

// computeLivePnLTx calculates realized PnL for a sell using open buy orders,
// read within the provided transaction for consistent state.
func computeLivePnLTx(tx *sqlx.Tx, sessionID int64, execPrice, execQty string) string {
	type buyPos struct {
		Price    string `db:"price"`
		Quantity string `db:"quantity"`
	}
	var buys []buyPos
	if err := tx.Select(&buys, tx.Rebind(
		`SELECT executed_price as price, executed_qty as quantity FROM orders
		 WHERE session_id = ? AND side = 'buy' AND status = 'filled' ORDER BY created_at ASC`), sessionID); err != nil {
		slog.Warn("computeLivePnLTx: fetch buys", "session", sessionID, "error", err)
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
