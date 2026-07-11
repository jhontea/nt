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
		`SELECT COUNT(*) FROM orders WHERE session_id = ? AND side = ? AND created_at >= `+intervalAgo(l.db, 2)),
		session.ID, signal.Side); err == nil && recentCount > 0 {
		slog.Warn("live: duplicate order suppressed (idempotency window)",
			"session", session.ID, "side", signal.Side, "recent_count", recentCount)
		return nil
	}
	// For sell signals: use minimum of DB holdings vs actual exchange balance
	// to avoid selling more than we own (DB can exceed exchange due to prior sells/fees).
	resolvedQty := signal.Quantity
	if signal.Side == string(model.SideSell) {
		var dbQty float64
		if err := l.db.Get(&dbQty, l.db.Rebind(
			`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) FROM orders
			 WHERE session_id = ? AND side = 'buy' AND status = 'filled'`),
			session.ID); err == nil && dbQty > 0 {
			resolvedQty = strconv.FormatFloat(dbQty, 'f', 8, 64)
		}
		// clamp to actual exchange balance to avoid 2202 insufficient balance errors
		baseAsset := strings.Split(session.Symbol, "_")[0]
		if account, err := l.client.GetAccount(); err == nil {
			for _, a := range account.AccountAssets {
				if a.Asset == baseAsset {
					if exchangeQty, err := strconv.ParseFloat(a.Free, 64); err == nil && exchangeQty > 0 {
						dbQtyF, _ := strconv.ParseFloat(resolvedQty, 64)
						useQty := exchangeQty
						if useQty > dbQtyF {
							useQty = dbQtyF
						}
					// ponytail: stepSize precision per IDR symbol from exchange API
					// upgrade to symbol-info API call if more symbols need different steps
					idrPrecision := map[string]int{
						"BTC_IDR": 5, "ETH_IDR": 4, "BNB_IDR": 3,
						"SOL_IDR": 4, "DOGE_IDR": 0, "XRP_IDR": 1,
						"ADA_IDR": 1, "AVAX_IDR": 2, "HBAR_IDR": 1,
						"POL_IDR": 1, "TKO_IDR": 2, "ARB_IDR": 1,
						"SUI_IDR": 2, "WLD_IDR": 2, "WIF_IDR": 2,
					}
					precision := 8
					if strings.HasSuffix(session.Symbol, "_IDR") {
						if p, ok := idrPrecision[session.Symbol]; ok {
							precision = p
						} else {
							precision = 2 // safe default for unknown IDR pairs
						}
					}
					factor := 1.0
					for i := 0; i < precision; i++ {
						factor *= 10
					}
					if factor == 0 {
						factor = 1
					}
					useQty = float64(int64(useQty*factor)) / factor
						resolvedQty = strconv.FormatFloat(useQty, 'f', precision, 64)
					}
					break
				}
			}
		}
		slog.Info("live sell: resolved qty", "session", session.ID,
			"signal_qty", signal.Quantity, "resolved_qty", resolvedQty)
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

	// IDR pairs have 20000 min notional; USDT pairs ~5. Skip dust sells.
	if signal.Side == string(model.SideSell) {
		minNotional := 5.0
		if strings.HasSuffix(session.Symbol, "_IDR") {
			minNotional = 20000.0
		}
		if notional < minNotional {
			slog.Warn("live sell: notional below minimum, skipping dust",
				"session", session.ID, "notional", notional, "min", minNotional, "qty", resolvedQty)
			return nil
		}
	}

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
	} else if signal.QuoteQty != "" {
		// DCA: use exact quote amount to avoid qty rounding causing notional < minNotional
		req.QuoteOrderQty = signal.QuoteQty
	} else {
		req.QuoteOrderQty = strconv.FormatFloat(notional, 'f', 8, 64)
	}

	order, err := l.client.PlaceOrder(req)
	if err != nil {
		return fmt.Errorf("place order: %w", err)
	}

	orderStatus := liveOrderStatus(order.StatusInt())
	orderID := fmt.Sprintf("%d", order.OrderID)

	execPrice := order.ExecutedPrice
	if execPrice == "" {
		execPrice = price
	}
	execQty := order.ExecutedQty
	// ponytail: for quoteOrderQty market buys, executedQty may be "0" or wrong (LOT_SIZE stepSize)
	// compute actual received qty from executedQuoteQty/executedPrice when executedQty looks wrong
	if execQtyF, _ := strconv.ParseFloat(execQty, 64); execQtyF <= 0 {
		execPriceF, _ := strconv.ParseFloat(execPrice, 64)
		execQuoteQtyF, _ := strconv.ParseFloat(order.ExecutedQuoteQty, 64)
		if execPriceF > 0 && execQuoteQtyF > 0 {
			execQty = strconv.FormatFloat(execQuoteQtyF/execPriceF, 'f', 8, 64)
		} else {
			execQty = resolvedQty
		}
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
		tx.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, executed_quote_qty)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, ?, ?, ?, ?)`),
		session.ID, orderID,
		session.Symbol, signal.Side, price, resolvedQty,
		orderStatus, order.ExecutedQty, order.ExecutedPrice, order.ExecutedQuoteQty,
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
