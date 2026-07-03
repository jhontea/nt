package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/engine"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/service"
)

type SessionHandler struct {
	svc    *service.SessionService
	engine *engine.Manager
}

func NewSessionHandler(svc *service.SessionService, engine *engine.Manager) *SessionHandler {
	return &SessionHandler{svc: svc, engine: engine}
}

type createSessionRequest struct {
	Name     string `json:"name"`
	Strategy string `json:"strategy"`
	Mode     string `json:"mode"`
	Symbol   string `json:"symbol"`
	Config   string `json:"config"`
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
	validModes := map[string]bool{string(model.ModeSignal): true, string(model.ModePaper): true, string(model.ModeLive): true}
	if !validModes[req.Mode] {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid mode: must be signal, paper, or live"))
	}
	validStrats := map[string]bool{string(model.StratGrid): true, string(model.StratTrend): true, string(model.StratDCA): true}
	if !validStrats[req.Strategy] {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid strategy: must be grid, trend, or dca"))
	}

	session, err := h.svc.Create(h.reqContext(c), h.userID(c), req.Name, req.Strategy, req.Mode, req.Symbol, req.Config)
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
	return c.JSON(http.StatusOK, sessions)
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
