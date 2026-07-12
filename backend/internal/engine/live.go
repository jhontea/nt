package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strconv"
	"strings"
	"sync"
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
	position *service.PositionService
	buyMu    sync.Mutex
	buyLocks map[string]*sync.Mutex
}

func NewLiveEngine(client *tokocrypto.Client, db *sqlx.DB) *LiveEngine {
	return &LiveEngine{client: client, risk: NewRiskManager(), db: db, position: service.NewPositionService(db), buyLocks: make(map[string]*sync.Mutex)}
}

func NewLiveEngineWithNotifier(client *tokocrypto.Client, db *sqlx.DB, notifier *service.Notifier) *LiveEngine {
	return &LiveEngine{client: client, risk: NewRiskManager(), db: db, notifier: notifier, position: service.NewPositionService(db), buyLocks: make(map[string]*sync.Mutex)}
}

const buyBalanceBufferBPS int64 = 20 // reserve 0.20% for fees and small balance movements

// PreflightBuy validates API access and the quote balance needed for one buy.
// Execute performs the same check again immediately before placing every order.
func (l *LiveEngine) PreflightBuy(symbol, quoteOrderQty string) error {
	acc, err := l.client.GetAccount()
	if err != nil {
		return fmt.Errorf("tidak bisa terhubung ke TokoCrypto: %w", err)
	}
	return validateBuyBalance(acc, symbol, quoteOrderQty)
}

func (l *LiveEngine) buyLock(quoteAsset string) *sync.Mutex {
	l.buyMu.Lock()
	defer l.buyMu.Unlock()
	if l.buyLocks == nil {
		l.buyLocks = make(map[string]*sync.Mutex)
	}
	lock, ok := l.buyLocks[quoteAsset]
	if !ok {
		lock = &sync.Mutex{}
		l.buyLocks[quoteAsset] = lock
	}
	return lock
}

func validateBuyBalance(account *tokocrypto.Account, symbol, quoteOrderQty string) error {
	if account == nil {
		return fmt.Errorf("akun TokoCrypto tidak tersedia")
	}
	if account.CanTrade != 1 {
		return fmt.Errorf("akun TokoCrypto tidak diizinkan trading (CanTrade=%d)", account.CanTrade)
	}
	parts := strings.SplitN(symbol, "_", 2)
	if len(parts) != 2 || parts[1] == "" {
		return fmt.Errorf("symbol tidak valid: %s", symbol)
	}
	quoteAsset := parts[1]
	required, ok := new(big.Rat).SetString(quoteOrderQty)
	if !ok || required.Sign() <= 0 {
		return fmt.Errorf("quoteOrderQty tidak valid: %q", quoteOrderQty)
	}
	bufferedRequired := new(big.Rat).Mul(required, big.NewRat(10_000+buyBalanceBufferBPS, 10_000))

	for _, asset := range account.AccountAssets {
		if asset.Asset != quoteAsset {
			continue
		}
		free, valid := new(big.Rat).SetString(asset.Free)
		if !valid || free.Sign() < 0 {
			return fmt.Errorf("saldo free %s tidak valid: %q", quoteAsset, asset.Free)
		}
		if free.Cmp(bufferedRequired) < 0 {
			return fmt.Errorf("saldo %s tidak cukup: tersedia %s, order %s ditambah buffer %.2f%%",
				quoteAsset, asset.Free, quoteOrderQty, float64(buyBalanceBufferBPS)/100)
		}
		return nil
	}
	return fmt.Errorf("saldo %s tidak ditemukan di akun TokoCrypto", quoteAsset)
}

type orderNotSubmittedError struct{ err error }

func (e *orderNotSubmittedError) Error() string { return e.err.Error() }
func (e *orderNotSubmittedError) Unwrap() error { return e.err }

func (l *LiveEngine) placeOrder(req tokocrypto.OrderRequest) (*tokocrypto.OrderResponseData, error) {
	if req.Side != orderSideBuy {
		return l.client.PlaceOrder(req)
	}
	parts := strings.SplitN(req.Symbol, "_", 2)
	if len(parts) != 2 || parts[1] == "" {
		return nil, fmt.Errorf("symbol tidak valid: %s", req.Symbol)
	}

	lock := l.buyLock(parts[1])
	lock.Lock()
	defer lock.Unlock()

	account, err := l.client.GetAccount()
	if err != nil {
		return nil, &orderNotSubmittedError{err: fmt.Errorf("tidak dapat memverifikasi saldo sebelum buy: %w", err)}
	}
	if err := validateBuyBalance(account, req.Symbol, req.QuoteOrderQty); err != nil {
		return nil, &orderNotSubmittedError{err: err}
	}
	return l.client.PlaceOrder(req)
}

// liveOrderStatus maps Tokocrypto's integer order status to the internal status.
func liveOrderStatus(exchangeStatus int) string {
	return tokocrypto.ExchangeOrderStatus(exchangeStatus)
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
	// Sell only the quantity owned by this session and currently free on exchange.
	resolvedQty := signal.Quantity
	if signal.Side == string(model.SideSell) {
		position, err := l.position.GetSessionPosition(context.Background(), session.ID, session.Symbol)
		if err != nil {
			return fmt.Errorf("live sell: resolve session position: %w", err)
		}
		if position.NetQty == "0" {
			return fmt.Errorf("live sell: session has no position to sell")
		}
		resolvedQty = position.NetQty

		baseAsset := strings.Split(session.Symbol, "_")[0]
		account, err := l.client.GetAccount()
		if err != nil {
			return fmt.Errorf("live sell: cannot verify exchange balance: %w", err)
		}
		balanceResolved := false
		for _, a := range account.AccountAssets {
			if a.Asset == baseAsset {
				exchangeQty, err := strconv.ParseFloat(a.Free, 64)
				if err != nil {
					return fmt.Errorf("live sell: invalid %s free balance %q: %w", baseAsset, a.Free, err)
				}
				if exchangeQty <= 0 {
					return fmt.Errorf("live sell: no free %s balance available", baseAsset)
				}
				resolvedQty, err = service.MinDecimalString(position.NetQty, a.Free)
				if err != nil {
					return fmt.Errorf("live sell: clamp session position to exchange balance: %w", err)
				}
				resolvedQty, err = l.client.NormalizeMarketQuantity(
					session.Symbol,
					resolvedQty,
				)
				if err != nil {
					return fmt.Errorf("live sell: normalize quantity: %w", err)
				}
				balanceResolved = true
				break
			}
		}
		if !balanceResolved {
			return fmt.Errorf("live sell: %s balance not found in exchange account", baseAsset)
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
	clientID := tokocrypto.NewClientID("live")
	req.ClientID = clientID
	if _, err := l.db.Exec(l.db.Rebind(`INSERT INTO orders
		(session_id, order_id, client_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, executed_quote_qty)
		VALUES (?, '', ?, ?, ?, 'market', ?, ?, ?, '0', '0', '0')`),
		session.ID, clientID, session.Symbol, signal.Side, price, resolvedQty, string(model.OrdSubmitting)); err != nil {
		return fmt.Errorf("persist order intent: %w", err)
	}

	order, err := l.placeOrder(req)
	if err != nil {
		status := string(model.OrdUnknown)
		var notSubmitted *orderNotSubmittedError
		if errors.As(err, &notSubmitted) || tokocrypto.IsDefiniteOrderRejection(err) {
			status = string(model.OrdRejected)
		}
		if _, updateErr := l.db.Exec(l.db.Rebind(`UPDATE orders SET status = ? WHERE client_id = ?`), status, clientID); updateErr != nil {
			slog.Error("live: failed to update unsuccessful order intent", "client_id", clientID, "status", status, "error", updateErr)
		}
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
	if execQtyF, _ := strconv.ParseFloat(execQty, 64); orderStatus == string(model.OrdFilled) && execQtyF <= 0 {
		execPriceF, _ := strconv.ParseFloat(execPrice, 64)
		execQuoteQtyF, _ := strconv.ParseFloat(order.ExecutedQuoteQty, 64)
		if execPriceF > 0 && execQuoteQtyF > 0 {
			execQty = strconv.FormatFloat(execQuoteQtyF/execPriceF, 'f', 8, 64)
		} else {
			execQty = resolvedQty
		}
	}
	if execQty == "" {
		execQty = "0"
	}
	if orderStatus != string(model.OrdFilled) {
		if _, updateErr := l.db.Exec(l.db.Rebind(`UPDATE orders SET
			order_id=?, status=?, executed_qty=?, executed_price=?, executed_quote_qty=? WHERE client_id=?`),
			orderID, orderStatus, execQty, execPrice, order.ExecutedQuoteQty, clientID); updateErr != nil {
			return fmt.Errorf("order accepted but failed to save pending state: %w", updateErr)
		}
		return fmt.Errorf("order accepted with status %s; awaiting reconciliation", orderStatus)
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
		tx.Rebind(`UPDATE orders SET order_id=?, status=?, executed_qty=?, executed_price=?, executed_quote_qty=?
			WHERE client_id=?`),
		orderID, orderStatus, execQty, execPrice, order.ExecutedQuoteQty, clientID,
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
	fee, feeAsset := order.Fee()

	if _, err = tx.Exec(
		tx.Rebind(`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl, traded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
		session.ID, orderID, session.Symbol, signal.Side,
		execPrice, execQty, fee, feeAsset, pnlStr, time.Now(),
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
