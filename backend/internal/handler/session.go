package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/engine"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/repository"
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/tokocrypto"
	"github.com/user/nt/internal/validator"
)

type SessionHandler struct {
	svc        *service.SessionService
	engine     *engine.Manager
	db         *sqlx.DB
	client     *tokocrypto.Client
	position   *service.PositionService
	signalRepo repository.StrategySignalRepository
}

func NewSessionHandler(svc *service.SessionService, engine *engine.Manager, db *sqlx.DB, client *tokocrypto.Client, signalRepo repository.StrategySignalRepository) *SessionHandler {
	return &SessionHandler{svc: svc, engine: engine, db: db, client: client, position: service.NewPositionService(db), signalRepo: signalRepo}
}

type createSessionRequest struct {
	Name           string   `json:"name"`
	Strategy       string   `json:"strategy"`
	Mode           string   `json:"mode"`
	Symbol         string   `json:"symbol"`
	Config         string   `json:"config"`
	InitialBalance *float64 `json:"initial_balance,omitempty"`
}

func (h *SessionHandler) userID(c echo.Context) int64 {
	id, _ := strconv.ParseInt(c.Get("user_id").(string), 10, 64)
	return id
}

func (h *SessionHandler) reqContext(c echo.Context) context.Context {
	ctx := c.Request().Context()
	if ctx == nil {
		ctx = context.Background()
	}
	return ctx
}

func filterSessionsByStrategy(sessions []model.Session, strategy string) []model.Session {
	if strategy == "" {
		return sessions
	}
	out := make([]model.Session, 0, len(sessions))
	for _, s := range sessions {
		if string(s.Strategy) == strategy {
			out = append(out, s)
		}
	}
	return out
}

func (h *SessionHandler) checkOwnership(c echo.Context, sessionID int64) (*model.Session, error) {
	session, err := h.svc.GetByID(h.reqContext(c), sessionID)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusNotFound, "session not found")
	}
	if session.UserID != h.userID(c) {
		return nil, echo.NewHTTPError(http.StatusForbidden, "access denied")
	}
	return session, nil
}

func (h *SessionHandler) Create(c echo.Context) error {
	var req createSessionRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid request"))
	}
	if strat, ok := c.Get("strategy").(string); ok && strat != "" {
		req.Strategy = strat
	}
	if req.Mode == "" {
		req.Mode = string(model.ModeSignal)
	}
	if err := validator.ValidateSession(req.Mode, req.Strategy, req.Config); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON(err.Error()))
	}
	if err := validator.Symbol(req.Symbol); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid symbol: "+err.Error()))
	}

	session, err := h.svc.Create(h.reqContext(c), h.userID(c), req.Name, req.Strategy, req.Mode, req.Symbol, req.Config, req.InitialBalance)
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusCreated, session)
}

func (h *SessionHandler) List(c echo.Context) error {
	start := time.Now()
	sessions, err := h.svc.List(h.reqContext(c), h.userID(c))
	if err != nil {
		slog.Error("list sessions failed", "path", c.Path(), "user_id", h.userID(c), "error", err, "elapsed", time.Since(start))
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	if strat, ok := c.Get("strategy").(string); ok && strat != "" {
		sessions = filterSessionsByStrategy(sessions, strat)
	}
	type sessionWithStatus struct {
		*model.Session
		IsAlive bool `json:"is_alive"`
	}
	result := make([]sessionWithStatus, len(sessions))
	for i, s := range sessions {
		result[i] = sessionWithStatus{
			Session: &s,
			IsAlive: h.engine.IsRunning(s.ID),
		}
	}
	slog.Info("list sessions ok", "path", c.Path(), "user_id", h.userID(c), "strategy", c.Get("strategy"), "count", len(result), "elapsed", time.Since(start))
	return c.JSON(http.StatusOK, result)
}

func (h *SessionHandler) Get(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, session)
}

func (h *SessionHandler) Update(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	var req createSessionRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid request"))
	}
	if req.Name != "" {
		session.Name = req.Name
	}
	if req.Config != "" {
		session.Config = req.Config
	}
	if req.Symbol != "" {
		session.Symbol = req.Symbol
	}
	if req.Strategy != "" {
		session.Strategy = req.Strategy
	}
	if err := h.svc.Update(h.reqContext(c), session); err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusOK, session)
}

func (h *SessionHandler) Start(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	if session.Status == string(model.StatLiquidating) || session.Status == string(model.StatLiquidationFailed) {
		return c.JSON(http.StatusConflict, ErrorJSON("session sedang dalam lifecycle liquidation; selesaikan force sell sebelum start"))
	}

	// Pre-flight check for live sessions: validate API key + account trading permission
	if session.Mode == string(model.ModeLive) {
		if h.client == nil {
			return c.JSON(http.StatusBadRequest, ErrorJSON("API key TokoCrypto belum dikonfigurasi di server"))
		}
		acc, err := h.client.GetAccount()
		if err != nil {
			return c.JSON(http.StatusBadRequest, ErrorJSON("Gagal terhubung ke TokoCrypto: "+err.Error()))
		}
		if acc.CanTrade != 1 {
			return c.JSON(http.StatusBadRequest, ErrorJSON("Akun TokoCrypto tidak diizinkan trading (CanTrade=0). Periksa izin API key."))
		}
	}

	if err := h.engine.Start(*session); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON(err.Error()))
	}
	if err := h.svc.UpdateStarted(h.reqContext(c), id); err != nil {
		slog.Warn("failed to update session started", "id", id, "error", err)
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "running"})
}

func (h *SessionHandler) GetPnL(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if _, err := h.checkOwnership(c, id); err != nil {
		return err
	}
	ctx := h.reqContext(c)
	pnl, err := h.svc.PnL.GetSessionPnL(ctx, id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusOK, pnl)
}

func (h *SessionHandler) GetOrders(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if _, err := h.checkOwnership(c, id); err != nil {
		return err
	}
	cursor, _ := strconv.ParseInt(c.QueryParam("cursor"), 10, 64)
	limit, _ := strconv.ParseInt(c.QueryParam("limit"), 10, 64)
	if limit <= 0 || limit > 500 {
		limit = 10
	}
	orders, err := h.svc.PnL.GetOrders(h.reqContext(c), id, cursor, limit)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusOK, orders)
}

func (h *SessionHandler) GetDCAStats(c echo.Context) error {
	start := time.Now()
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if _, err := h.checkOwnership(c, id); err != nil {
		return err
	}
	stats, err := h.svc.PnL.GetDCAStats(h.reqContext(c), id)
	if err != nil {
		slog.Error("get dca stats failed", "session_id", id, "path", c.Path(), "error", err, "elapsed", time.Since(start))
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	slog.Info("get dca stats ok", "session_id", id, "path", c.Path(), "buy_count", stats.BuyCount, "total_qty", stats.TotalQty, "elapsed", time.Since(start))
	return c.JSON(http.StatusOK, stats)
}

// computeLivePnLTx calculates realized PnL for a sell using open buy orders within tx.
// ponytail: duplicated from engine/live.go — shared if a third caller appears
func computeLivePnLTx(tx *sqlx.Tx, sessionID int64, execPrice, execQty string) string {
	type fill struct {
		Side     string `db:"side"`
		Price    string `db:"price"`
		Quantity string `db:"quantity"`
	}
	type lot struct{ qty, price float64 }
	var fills []fill
	if err := tx.Select(&fills, tx.Rebind(
		`SELECT side, executed_price as price, executed_qty as quantity FROM orders
		 WHERE session_id = ? AND status = 'filled' ORDER BY created_at ASC, id ASC`), sessionID); err != nil {
		slog.Warn("computeLivePnLTx: fetch fills", "session", sessionID, "error", err)
		return "0"
	}
	lots := make([]lot, 0)
	for _, f := range fills {
		q, _ := strconv.ParseFloat(f.Quantity, 64)
		p, _ := strconv.ParseFloat(f.Price, 64)
		if f.Side == string(model.SideBuy) {
			lots = append(lots, lot{qty: q, price: p})
			continue
		}
		if f.Side == string(model.SideSell) {
			for q > 1e-12 && len(lots) > 0 {
				matched := q
				if lots[0].qty < matched {
					matched = lots[0].qty
				}
				q -= matched
				lots[0].qty -= matched
				if lots[0].qty <= 1e-12 {
					lots = lots[1:]
				}
			}
		}
	}
	sellQty, _ := strconv.ParseFloat(execQty, 64)
	sellPrice, _ := strconv.ParseFloat(execPrice, 64)
	pnl := 0.0
	for sellQty > 1e-12 && len(lots) > 0 {
		matched := sellQty
		if lots[0].qty < matched {
			matched = lots[0].qty
		}
		pnl += (sellPrice - lots[0].price) * matched
		sellQty -= matched
		lots[0].qty -= matched
		if lots[0].qty <= 1e-12 {
			lots = lots[1:]
		}
	}
	return strconv.FormatFloat(pnl, 'f', 8, 64)
}

func canStartForceSell(status string) bool {
	return status == string(model.StatRunning) || status == string(model.StatLiquidationFailed)
}

func (h *SessionHandler) ForceSell(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}

	if session.Mode != string(model.ModeLive) {
		return c.JSON(http.StatusBadRequest, ErrorJSON("force sell hanya tersedia untuk live session"))
	}
	if !canStartForceSell(session.Status) {
		return c.JSON(http.StatusConflict, ErrorJSON("force sell hanya dapat dimulai dari status running atau liquidation_failed"))
	}

	ctx := h.reqContext(c)
	result, err := h.db.ExecContext(ctx, h.db.Rebind(
		`UPDATE sessions SET status = ? WHERE id = ? AND status IN (?, ?)`),
		string(model.StatLiquidating), id, string(model.StatRunning), string(model.StatLiquidationFailed))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON("failed to start liquidation: "+err.Error()))
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return c.JSON(http.StatusConflict, ErrorJSON("session liquidation sudah diproses oleh request lain"))
	}

	// Stop all strategy ticks before reading position or placing the sell order.
	h.engine.Stop(id)
	failBeforeOrder := func(statusCode int, message string) error {
		if _, updateErr := h.db.ExecContext(ctx, h.db.Rebind(`UPDATE sessions SET status = ? WHERE id = ? AND status = ?`),
			string(model.StatLiquidationFailed), id, string(model.StatLiquidating)); updateErr != nil {
			slog.Error("force sell: failed to mark liquidation failure", "session", id, "error", updateErr)
		}
		return c.JSON(statusCode, ErrorJSON(message))
	}
	finishDust := func(qty, reason string) error {
		if _, updateErr := h.db.ExecContext(ctx, h.db.Rebind(
			`UPDATE sessions SET status = ?, stopped_at = ? WHERE id = ? AND status = ?`),
			string(model.StatStopped), time.Now(), id, string(model.StatLiquidating)); updateErr != nil {
			return c.JSON(http.StatusInternalServerError, ErrorJSON("failed to finalize dust position: "+updateErr.Error()))
		}
		return c.JSON(http.StatusOK, map[string]string{
			"status":   "stopped",
			"qty_sold": "0",
			"dust_qty": qty,
			"reason":   reason,
		})
	}

	position, err := h.position.GetSessionPosition(ctx, id, session.Symbol)
	if err != nil {
		return failBeforeOrder(http.StatusBadGateway, "failed to resolve session position: "+err.Error())
	}
	if position.NetQty == "0" {
		return finishDust("0", "session has no sellable position")
	}

	baseAsset := strings.Split(session.Symbol, "_")[0]
	account, err := h.client.GetAccount()
	if err != nil {
		return failBeforeOrder(http.StatusBadGateway, "failed to fetch account balance: "+err.Error())
	}
	exchangeQty := ""
	for _, a := range account.AccountAssets {
		if a.Asset == baseAsset {
			exchangeQty = a.Free
			break
		}
	}
	if exchangeQty == "" {
		return failBeforeOrder(http.StatusBadRequest, "tidak ada balance aset untuk dijual")
	}
	sellQty, err := service.MinDecimalString(position.NetQty, exchangeQty)
	if err != nil {
		return failBeforeOrder(http.StatusBadGateway, "failed to resolve sell quantity: "+err.Error())
	}

	fmtQty, err := h.client.NormalizeMarketQuantity(
		session.Symbol,
		sellQty,
	)
	if err != nil {
		if errors.Is(err, tokocrypto.ErrQuantityBelowMinimum) {
			return finishDust(sellQty, err.Error())
		}
		return failBeforeOrder(http.StatusBadGateway, "failed to normalize sell quantity: "+err.Error())
	}

	ticker, err := h.client.GetTicker(session.Symbol)
	if err != nil {
		return failBeforeOrder(http.StatusBadGateway, "failed to fetch price for dust validation: "+err.Error())
	}
	qtyValue, qtyErr := strconv.ParseFloat(fmtQty, 64)
	priceValue, priceErr := strconv.ParseFloat(ticker.LastPrice, 64)
	if qtyErr != nil || priceErr != nil || qtyValue <= 0 || priceValue <= 0 {
		return failBeforeOrder(http.StatusBadGateway, "invalid quantity or price during dust validation")
	}
	minNotional := 5.0
	if strings.HasSuffix(session.Symbol, "_IDR") {
		minNotional = 20000
	}
	if qtyValue*priceValue < minNotional {
		return finishDust(fmtQty, "position value is below market minimum notional")
	}

	clientID := tokocrypto.NewClientID("force")
	if _, err := h.db.ExecContext(ctx, h.db.Rebind(`INSERT INTO orders
		(session_id, order_id, client_id, symbol, side, type, price, quantity, status, executed_qty, executed_price, executed_quote_qty)
		VALUES (?, '', ?, ?, 'sell', 'market', ?, ?, ?, '0', '0', '0')`),
		id, clientID, session.Symbol, ticker.LastPrice, fmtQty, string(model.OrdSubmitting)); err != nil {
		return failBeforeOrder(http.StatusInternalServerError, "failed to persist force sell intent: "+err.Error())
	}

	order, err := h.client.PlaceOrder(tokocrypto.OrderRequest{
		Symbol:   session.Symbol,
		Side:     1,
		Type:     2,
		Quantity: fmtQty,
		ClientID: clientID,
	})
	if err != nil {
		status := string(model.OrdUnknown)
		definiteRejection := tokocrypto.IsDefiniteOrderRejection(err)
		if definiteRejection {
			status = string(model.OrdRejected)
		}
		if _, updateErr := h.db.ExecContext(ctx, h.db.Rebind(`UPDATE orders SET status = ? WHERE client_id = ?`),
			status, clientID); updateErr != nil {
			slog.Error("force sell: failed to mark unsuccessful intent", "session", id, "client_id", clientID, "status", status, "error", updateErr)
		}
		if definiteRejection {
			if _, updateErr := h.db.ExecContext(ctx, h.db.Rebind(`UPDATE sessions SET status=? WHERE id=? AND status=?`),
				string(model.StatLiquidationFailed), id, string(model.StatLiquidating)); updateErr != nil {
				slog.Error("force sell: failed to mark definite rejection", "session", id, "client_id", clientID, "error", updateErr)
			}
			return c.JSON(http.StatusBadGateway, ErrorJSON("sell order rejected by exchange; boleh retry setelah koreksi balance/qty: "+err.Error()))
		}
		// A transport/5xx error can mean execution is unknown. Keep liquidating so
		// a user retry cannot create a duplicate sell before reconciliation.
		return c.JSON(http.StatusBadGateway, ErrorJSON("sell order status unknown; retry diblokir sampai rekonsiliasi: "+err.Error()))
	}
	h.client.InvalidateAccountCache()

	orderID := strconv.FormatInt(order.OrderID, 10)
	orderStatus := tokocrypto.ExchangeOrderStatus(order.StatusInt())
	execPrice := order.ExecutedPrice
	if execPrice == "" {
		execPrice = "0"
	}
	execQty := order.ExecutedQty
	if execQty == "" {
		if orderStatus == string(model.OrdFilled) {
			execQty = fmtQty
		} else {
			execQty = "0"
		}
	}
	if orderStatus != string(model.OrdFilled) {
		if _, updateErr := h.db.ExecContext(ctx, h.db.Rebind(`UPDATE orders SET
			order_id=?, status=?, executed_qty=?, executed_price=?, executed_quote_qty=? WHERE client_id=?`),
			orderID, orderStatus, execQty, execPrice, order.ExecutedQuoteQty, clientID); updateErr != nil {
			return c.JSON(http.StatusInternalServerError, ErrorJSON("order accepted but failed to save pending state: "+updateErr.Error()))
		}
		if orderStatus == string(model.OrdCanceled) || orderStatus == string(model.OrdRejected) || orderStatus == string(model.OrdExpired) {
			_, _ = h.db.ExecContext(ctx, h.db.Rebind(`UPDATE sessions SET status=? WHERE id=? AND status=?`),
				string(model.StatLiquidationFailed), id, string(model.StatLiquidating))
		}
		return c.JSON(http.StatusAccepted, map[string]string{
			"status":        orderStatus,
			"order_id":      orderID,
			"executed_qty":  execQty,
			"requested_qty": fmtQty,
		})
	}

	tx, err := h.db.BeginTxx(ctx, nil)
	if err != nil {
		slog.Error("force sell: order placed but failed to begin DB tx — manual reconciliation required",
			"session", id, "order_id", orderID, "symbol", session.Symbol, "qty", fmtQty, "error", err)
		return c.JSON(http.StatusBadGateway, ErrorJSON("order placed but DB error: "+err.Error()))
	}
	defer tx.Rollback()

	pnlStr := computeLivePnLTx(tx, id, execPrice, execQty)
	fee, feeAsset := order.Fee()

	if _, err := tx.Exec(tx.Rebind(`UPDATE orders
		SET order_id = ?, status = ?, executed_qty = ?, executed_price = ?, executed_quote_qty = ?
		WHERE client_id = ?`), orderID, orderStatus, execQty, execPrice, order.ExecutedQuoteQty, clientID); err != nil {
		return c.JSON(http.StatusBadGateway, ErrorJSON("order placed but failed to save order: "+err.Error()))
	}

	if _, err := tx.Exec(tx.Rebind(`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl, traded_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
		id, orderID, session.Symbol, "sell", execPrice, execQty, fee, feeAsset, pnlStr, time.Now()); err != nil {
		return c.JSON(http.StatusBadGateway, ErrorJSON("order placed but failed to save trade: "+err.Error()))
	}

	if _, err := tx.Exec(tx.Rebind(`UPDATE sessions SET status = 'stopped', stopped_at = ? WHERE id = ?`),
		time.Now(), id); err != nil {
		return c.JSON(http.StatusBadGateway, ErrorJSON("order placed but failed to stop session: "+err.Error()))
	}
	if _, err := tx.Exec(tx.Rebind(`UPDATE sessions SET started_at = CURRENT_TIMESTAMP WHERE id = ?`), id); err != nil {
		return c.JSON(http.StatusBadGateway, ErrorJSON("order placed but failed to refresh cycle start: "+err.Error()))
	}

	if err := tx.Commit(); err != nil {
		slog.Error("force sell: order placed but DB commit failed — manual reconciliation required",
			"session", id, "order_id", orderID, "symbol", session.Symbol, "qty", fmtQty, "error", err)
		return c.JSON(http.StatusBadGateway, ErrorJSON("order placed but DB commit failed: "+err.Error()))
	}

	return c.JSON(http.StatusOK, map[string]string{
		"status":       "stopped",
		"qty_sold":     execQty,
		"sell_price":   execPrice,
		"realized_pnl": pnlStr,
	})
}

func (h *SessionHandler) Stop(c echo.Context) error {
	start := time.Now()
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	slog.Info("stop session requested", "session_id", id, "mode", session.Mode, "strategy", session.Strategy, "status", session.Status, "path", c.Path())
	h.engine.Stop(id)
	if err := h.svc.UpdateStopped(h.reqContext(c), id); err != nil {
		slog.Warn("failed to update session stopped", "id", id, "error", err)
	}
	slog.Info("stop session completed", "session_id", id, "elapsed", time.Since(start))
	return c.JSON(http.StatusOK, map[string]string{"status": "stopped"})
}

func (h *SessionHandler) Delete(c echo.Context) error {
	start := time.Now()
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	slog.Info("delete session requested", "session_id", id, "mode", session.Mode, "strategy", session.Strategy, "status", session.Status, "path", c.Path())
	// Graceful delete only applies to live sessions.
	// Paper/signal sessions can be deleted directly without waiting for engine shutdown.
	if session.Mode == string(model.ModeLive) {
		h.engine.Stop(id)
	}
	if err := h.svc.Delete(h.reqContext(c), id); err != nil {
		slog.Error("delete session failed", "session_id", id, "mode", session.Mode, "strategy", session.Strategy, "status", session.Status, "error", err, "elapsed", time.Since(start))
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	slog.Info("delete session completed", "session_id", id, "mode", session.Mode, "strategy", session.Strategy, "status", session.Status, "elapsed", time.Since(start))
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *SessionHandler) UpdateNotes(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if _, err := h.checkOwnership(c, id); err != nil {
		return err
	}
	var req struct {
		Notes string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid request"))
	}
	if _, err := h.db.ExecContext(h.reqContext(c),
		h.db.Rebind("UPDATE sessions SET notes = ? WHERE id = ?"),
		req.Notes, id,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *SessionHandler) GetPortfolio(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	if session.Mode != string(model.ModePaper) {
		return c.JSON(http.StatusBadRequest, ErrorJSON("portfolio only available for paper sessions"))
	}

	balance := 0.0
	if session.VirtualBalance != nil {
		balance = *session.VirtualBalance
	}
	var initialBalance *float64
	if session.InitialBalance != nil {
		initialBalance = session.InitialBalance
	}

	type holding struct {
		Price    string `db:"price"    json:"avg_price"`
		Quantity string `db:"quantity" json:"qty"`
	}
	var holdings []holding
	if err := h.db.SelectContext(h.reqContext(c), &holdings,
		h.db.Rebind(`SELECT price, quantity FROM orders WHERE session_id=? AND side='buy' AND status='filled' ORDER BY id ASC`),
		id,
	); err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}

	// Compute unrealized PnL from live ticker
	unrealizedPnL := 0.0
	if len(holdings) > 0 && h.client != nil {
		if ticker, err := h.client.GetTicker(session.Symbol); err == nil {
			currentPrice, _ := strconv.ParseFloat(ticker.LastPrice, 64)
			for _, h := range holdings {
				buyPrice, _ := strconv.ParseFloat(h.Price, 64)
				qty, _ := strconv.ParseFloat(h.Quantity, 64)
				unrealizedPnL += (currentPrice - buyPrice) * qty
			}
			unrealizedPnL = math.Round(unrealizedPnL*1e8) / 1e8
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"virtual_balance": balance,
		"initial_balance": initialBalance,
		"holdings":        holdings,
		"unrealized_pnl":  unrealizedPnL,
	})
}

type ReevaluateResult struct {
	CurrentPrice    float64 `json:"current_price"`
	InRange         bool    `json:"in_range"`
	PositionPct     float64 `json:"position_pct"` // 0=at lower, 100=at upper
	LevelsTriggered int     `json:"levels_triggered"`
	TotalLevels     int     `json:"total_levels"`
	CoveragePct     float64 `json:"coverage_pct"`
	Suggestion      string  `json:"suggestion"`
	SuggestedLower  float64 `json:"suggested_lower"`
	SuggestedUpper  float64 `json:"suggested_upper"`
	SuggestedCount  int     `json:"suggested_count"`
	CurrentLower    float64 `json:"current_lower"`
	CurrentUpper    float64 `json:"current_upper"`
	CurrentCount    int     `json:"current_count"`
	StepSize        float64 `json:"step_size"`
}

func (h *SessionHandler) Reevaluate(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	if session.Strategy != string(model.StratGrid) {
		return c.JSON(http.StatusBadRequest, ErrorJSON("reevaluate only available for grid sessions"))
	}

	var cfg struct {
		UpperPrice float64 `json:"upper_price"`
		LowerPrice float64 `json:"lower_price"`
		GridCount  int     `json:"grid_count"`
		Quantity   string  `json:"quantity"`
	}
	if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid config"))
	}

	// Fetch current price
	ticker, err := h.client.GetTicker(session.Symbol)
	if err != nil {
		return c.JSON(http.StatusBadGateway, ErrorJSON("failed to fetch ticker"))
	}
	currentPrice, _ := strconv.ParseFloat(ticker.LastPrice, 64)

	step := (cfg.UpperPrice - cfg.LowerPrice) / float64(cfg.GridCount)
	inRange := currentPrice >= cfg.LowerPrice && currentPrice <= cfg.UpperPrice

	positionPct := 0.0
	if cfg.UpperPrice > cfg.LowerPrice {
		positionPct = (currentPrice - cfg.LowerPrice) / (cfg.UpperPrice - cfg.LowerPrice) * 100
	}

	// Count triggered levels from orders
	var triggeredCount int
	h.db.GetContext(h.reqContext(c), &triggeredCount,
		h.db.Rebind(`SELECT COUNT(DISTINCT price) FROM orders WHERE session_id=? AND side='buy' AND (status='filled' OR status='closed')`), id)

	// Suggest new range — ±15% around current price, same grid count
	const boundaryPct = 0.15
	suggestedLower := math.Round(currentPrice*(1-boundaryPct)*100) / 100
	suggestedUpper := math.Round(currentPrice*(1+boundaryPct)*100) / 100

	// Build suggestion text
	var suggestion string
	switch {
	case !inRange && currentPrice < cfg.LowerPrice:
		suggestion = "Harga turun di bawah batas bawah grid. Pertimbangkan untuk geser range ke bawah atau buat session baru dengan range yang lebih rendah."
	case !inRange && currentPrice > cfg.UpperPrice:
		suggestion = "Harga naik di atas batas atas grid. Pertimbangkan untuk geser range ke atas atau buat session baru dengan range yang lebih tinggi."
	case positionPct < 20:
		suggestion = "Harga mendekati batas bawah grid. Bot aktif membeli. Pantau apakah harga akan bounce atau terus turun keluar range."
	case positionPct > 80:
		suggestion = "Harga mendekati batas atas grid. Bot aktif menjual. Pertimbangkan apakah mau naikkan batas atas untuk memberi ruang lebih."
	default:
		suggestion = "Harga berada di tengah range grid. Kondisi optimal untuk grid trading."
	}

	coveragePct := 0.0
	if cfg.GridCount > 0 {
		coveragePct = float64(triggeredCount) / float64(cfg.GridCount) * 100
	}

	return c.JSON(http.StatusOK, ReevaluateResult{
		CurrentPrice:    currentPrice,
		InRange:         inRange,
		PositionPct:     math.Round(positionPct*10) / 10,
		LevelsTriggered: triggeredCount,
		TotalLevels:     cfg.GridCount,
		CoveragePct:     math.Round(coveragePct*10) / 10,
		Suggestion:      suggestion,
		SuggestedLower:  suggestedLower,
		SuggestedUpper:  suggestedUpper,
		SuggestedCount:  cfg.GridCount,
		CurrentLower:    cfg.LowerPrice,
		CurrentUpper:    cfg.UpperPrice,
		CurrentCount:    cfg.GridCount,
		StepSize:        math.Round(step*1e8) / 1e8,
	})
}

func (h *SessionHandler) ApplyConfig(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	if session.Status == string(model.StatRunning) {
		return c.JSON(http.StatusBadRequest, ErrorJSON("stop session before applying new config"))
	}

	var req struct {
		Config string `json:"config"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid request"))
	}
	if err := validator.ValidateSession(session.Mode, session.Strategy, req.Config); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON(err.Error()))
	}

	session.Config = req.Config
	if err := h.svc.Update(h.reqContext(c), session); err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusOK, session)
}

func (h *SessionHandler) GetGridInsights(c echo.Context) error {
	symbol := c.QueryParam("symbol")
	if symbol == "" {
		return c.JSON(http.StatusBadRequest, ErrorJSON("symbol is required"))
	}
	insights, err := h.signalRepo.GetGridInsights(h.reqContext(c), symbol, h.userID(c))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusOK, insights)
}

func (h *SessionHandler) GetTrendSessionsStatus(c echo.Context) error {
	ctx := h.reqContext(c)
	userID := h.userID(c)

	sessions, err := h.svc.ListByStrategy(ctx, userID, "trend")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}

	type signalHistoryEntry = service.SignalHistoryEntry

	type sessionStatus struct {
		SessionID        int64                `json:"session_id"`
		SessionName      string               `json:"session_name"`
		Symbol           string               `json:"symbol"`
		Mode             string               `json:"mode"`
		FastSMA          *float64             `json:"fast_sma,omitempty"`
		SlowSMA          *float64             `json:"slow_sma,omitempty"`
		CrossStatus      string               `json:"cross_status"`
		PricePositionPct *float64             `json:"price_position_pct,omitempty"`
		CurrentPrice     *float64             `json:"current_price,omitempty"`
		RecentPrices     []float64            `json:"recent_prices,omitempty"`
		RecentFastSMA    []float64            `json:"recent_fast_sma,omitempty"`
		RecentSlowSMA    []float64            `json:"recent_slow_sma,omitempty"`
		NextCandleETA    string               `json:"next_candle_eta,omitempty"`
		HoldingQty       *float64             `json:"holding_qty,omitempty"`
		HoldingValue     *float64             `json:"holding_value,omitempty"`
		UnrealizedPnL    *float64             `json:"unrealized_pnl,omitempty"`
		UnrealizedPnLPct *float64             `json:"unrealized_pnl_pct,omitempty"`
		LastSignalType   *string              `json:"last_signal_type,omitempty"`
		LastSignalResult *float64             `json:"last_signal_result,omitempty"`
		LastSignalTime   *string              `json:"last_signal_time,omitempty"`
		SignalHistory    []signalHistoryEntry `json:"signal_history,omitempty"`
	}

	results := make([]sessionStatus, 0, len(sessions))
	for _, s := range sessions {
		status := engine.ComputeTrendStatus(h.client, s, s.Config)
		entry := sessionStatus{
			SessionID:   s.ID,
			SessionName: s.Name,
			Symbol:      s.Symbol,
			Mode:        s.Mode,
			CrossStatus: "unknown",
		}
		if status != nil {
			entry.FastSMA = &status.FastSMA
			entry.SlowSMA = &status.SlowSMA
			entry.CrossStatus = status.CrossStatus
			entry.PricePositionPct = &status.PricePositionPct
			entry.CurrentPrice = &status.CurrentPrice
			entry.RecentPrices = status.RecentPrices
			entry.RecentFastSMA = status.RecentFastSMA
			entry.RecentSlowSMA = status.RecentSlowSMA
			entry.NextCandleETA = status.NextCandleETA
		}

		// Holding info
		if s.Mode == "paper" || s.Mode == "live" {
			pos, err := h.svc.PnL.GetHoldingPosition(ctx, s.ID)
			if err == nil && pos.TotalQty > 0 {
				entry.HoldingQty = &pos.TotalQty
				if status != nil {
					holdVal := pos.TotalQty * status.CurrentPrice
					entry.HoldingValue = &holdVal
					costBasis := pos.TotalQty * pos.AvgPrice
					pnl := holdVal - costBasis
					entry.UnrealizedPnL = &pnl
					if costBasis > 0 {
						pnlPct := (pnl / costBasis) * 100
						entry.UnrealizedPnLPct = &pnlPct
					}
				}
			}
		}

		// Last confirmed signal
		sig, err := h.svc.PnL.GetLastSignal(ctx, s.ID)
		if err == nil {
			entry.LastSignalType = &sig.SignalType
			entry.LastSignalResult = sig.ResultPct
			entry.LastSignalTime = &sig.CreatedAt
		}

		// Signal history (last 5)
		history, err := h.svc.PnL.GetSignalHistory(ctx, s.ID, 5)
		if err == nil {
			entry.SignalHistory = history
		}

		results = append(results, entry)
	}

	return c.JSON(http.StatusOK, results)
}
