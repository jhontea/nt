package handler

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/engine"
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

func (h *SessionHandler) Create(c echo.Context) error {
	var req createSessionRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.Mode == "" {
		req.Mode = "signal"
	}
	userID, _ := strconv.ParseInt(c.Get("user_id").(string), 10, 64)
	session, err := h.svc.Create(userID, req.Name, req.Strategy, req.Mode, req.Symbol, req.Config)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusCreated, session)
}

func (h *SessionHandler) List(c echo.Context) error {
	userID, _ := strconv.ParseInt(c.Get("user_id").(string), 10, 64)
	sessions, err := h.svc.List(userID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, sessions)
}

func (h *SessionHandler) Get(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.svc.GetByID(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}
	return c.JSON(http.StatusOK, session)
}

func (h *SessionHandler) Update(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.svc.GetByID(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}
	var req createSessionRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
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
	if err := h.svc.Update(session); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, session)
}

func (h *SessionHandler) Start(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	session, err := h.svc.GetByID(id)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
	}
	if err := h.engine.Start(*session); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	h.svc.UpdateStatus(id, "running")
	return c.JSON(http.StatusOK, map[string]string{"status": "running"})
}

func (h *SessionHandler) Stop(c echo.Context) error {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	h.engine.Stop(id)
	h.svc.UpdateStatus(id, "stopped")
	return c.JSON(http.StatusOK, map[string]string{"status": "stopped"})
}
