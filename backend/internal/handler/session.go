package handler

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/engine"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/tokocrypto"
	"github.com/user/nt/internal/validator"
)

type SessionHandler struct {
	svc    *service.SessionService
	engine *engine.Manager
	db     *sqlx.DB
	client *tokocrypto.Client
}

func NewSessionHandler(svc *service.SessionService, engine *engine.Manager, db *sqlx.DB, client *tokocrypto.Client) *SessionHandler {
	return &SessionHandler{svc: svc, engine: engine, db: db, client: client}
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
	sessions, err := h.svc.List(h.reqContext(c), h.userID(c))
	if err != nil {
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
	CurrentPrice      float64 `json:"current_price"`
	InRange           bool    `json:"in_range"`
	PositionPct       float64 `json:"position_pct"`        // 0=at lower, 100=at upper
	LevelsTriggered   int     `json:"levels_triggered"`
	TotalLevels       int     `json:"total_levels"`
	CoveragePct       float64 `json:"coverage_pct"`
	Suggestion        string  `json:"suggestion"`
	SuggestedLower    float64 `json:"suggested_lower"`
	SuggestedUpper    float64 `json:"suggested_upper"`
	SuggestedCount    int     `json:"suggested_count"`
	CurrentLower      float64 `json:"current_lower"`
	CurrentUpper      float64 `json:"current_upper"`
	CurrentCount      int     `json:"current_count"`
	StepSize          float64 `json:"step_size"`
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
