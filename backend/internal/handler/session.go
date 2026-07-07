package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/engine"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/validator"
)

type SessionHandler struct {
	svc    *service.SessionService
	engine *engine.Manager
	db     *sqlx.DB
}

func NewSessionHandler(svc *service.SessionService, engine *engine.Manager, db *sqlx.DB) *SessionHandler {
	return &SessionHandler{svc: svc, engine: engine, db: db}
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
	sessions, err := h.svc.List(h.reqContext(c), h.userID(c))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
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
	if err := h.engine.Start(*session); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON(err.Error()))
	}
	h.svc.UpdateStatus(h.reqContext(c), id, string(model.StatRunning))
	h.svc.UpdateStartedAt(h.reqContext(c), id)
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
	orders, err := h.svc.PnL.GetOrders(h.reqContext(c), id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusOK, orders)
}

func (h *SessionHandler) Stop(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	_, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	h.engine.Stop(id)
	h.svc.UpdateStatus(h.reqContext(c), id, string(model.StatStopped))
	h.svc.UpdateStoppedAt(h.reqContext(c), id)
	return c.JSON(http.StatusOK, map[string]string{"status": "stopped"})
}

func (h *SessionHandler) Delete(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	_, err := h.checkOwnership(c, id)
	if err != nil {
		return err
	}
	// Stop if running
	h.engine.Stop(id)
	if err := h.svc.Delete(h.reqContext(c), id); err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
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

	return c.JSON(http.StatusOK, map[string]any{
		"virtual_balance": balance,
		"initial_balance": initialBalance,
		"holdings":        holdings,
	})
}
