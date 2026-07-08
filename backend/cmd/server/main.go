package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/config"
	"github.com/user/nt/internal/engine"
	"github.com/user/nt/internal/handler"
	authmw "github.com/user/nt/internal/middleware"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/repository"
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/tokocrypto"
)

type ErrorResponse struct {
	Error string `json:"error"`
}

func customHTTPErrorHandler(err error, c echo.Context) {
	code := http.StatusInternalServerError
	msg := "internal server error"
	if he, ok := err.(*echo.HTTPError); ok {
		code = he.Code
		msg = he.Message.(string)
	} else if c.Response().Committed {
		return
	}
	slog.Warn("http error", "path", c.Path(), "code", code, "error", msg)
	c.JSON(code, ErrorResponse{Error: msg})
}

func withStrategy(strat string, h echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		c.Set("strategy", strat)
		return h(c)
	}
}

func main() {
	cfg := config.Load()

	if cfg.TokenAPIKey == "" || cfg.TokenSecretKey == "" {
		slog.Warn("TOKO_API_KEY or TOKO_SECRET_KEY not set. Live trading will fail.")
	}
	if cfg.JWTSecret == "change-me" {
		slog.Warn("JWT_SECRET is still default. Change it in .env for security.")
	}

	db, err := repository.NewDB(cfg)
	if err != nil {
		slog.Error("database", "error", err)
		os.Exit(1)
	}
	if err := repository.Migrate(db); err != nil {
		slog.Error("migration", "error", err)
		os.Exit(1)
	}

	userRepo := repository.NewUserRepo(db)
	authSvc := service.NewAuthService(userRepo, cfg.JWTSecret, cfg.TokenExpiryHours)
	authH := handler.NewAuthHandler(authSvc)

	e := echo.New()
	e.HTTPErrorHandler = customHTTPErrorHandler
	e.Use(middleware.BodyLimit("1MB"))
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:3100", "http://localhost:3000"},
		AllowHeaders: []string{"Authorization", "Content-Type"},
	}))
	e.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(60)))
	e.Use(middleware.Recover())

	e.Use(middleware.TimeoutWithConfig(middleware.TimeoutConfig{
		Timeout: 30 * time.Second,
	}))

	// Public routes
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})
	e.GET("/ready", func(c echo.Context) error {
		if err := db.Ping(); err != nil {
			return c.JSON(503, ErrorResponse{Error: "database not ready"})
		}
		return c.JSON(200, map[string]string{"status": "ready"})
	})

	// Auth routes (public, strict rate limit)
	auth := e.Group("/v1")
	auth.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(5)))
	auth.POST("/register", authH.Register)
	auth.POST("/login", authH.Login)

	// API v1 (authenticated)
	v1 := e.Group("/v1", authmw.Auth(cfg.JWTSecret))

	sessionRepo := repository.NewSessionRepo(db)
	signalRepo := repository.NewStrategySignalRepo(db)
	sessionSvc := service.NewSessionServiceWithPnL(sessionRepo, service.NewPnLService(db))
	tokoClient := tokocrypto.NewClient(cfg.TokenAPIKey, cfg.TokenSecretKey)
	notifier := service.NewNotifier(cfg.TelegramBotToken, cfg.TelegramChatID)
	wsHub := engine.NewWSHub(cfg.JWTSecret)
	engMgr := engine.NewManager(tokoClient, db, notifier, wsHub, signalRepo)

	// Auto-restart sessions that were running before shutdown
	recoverRunningSessions(db, engMgr)

	sessionH := handler.NewSessionHandler(sessionSvc, engMgr, db, tokoClient)

	v1.GET("/ticker/:symbol", func(c echo.Context) error {
		ticker, err := tokoClient.GetTicker(c.Param("symbol"))
		if err != nil {
			return c.JSON(502, ErrorResponse{Error: "failed to fetch ticker: " + err.Error()})
		}
		return c.JSON(200, ticker)
	})

	v1.GET("/tickers", func(c echo.Context) error {
		symbols := strings.Split(c.QueryParam("symbols"), ",")
		result := make(map[string]any, len(symbols))
		for _, sym := range symbols {
			sym = strings.TrimSpace(sym)
			if sym == "" {
				continue
			}
			t, err := tokoClient.GetTicker(sym)
			if err != nil {
				result[sym] = map[string]string{"error": err.Error()}
			} else {
				result[sym] = t
			}
		}
		return c.JSON(200, result)
	})

	v1.POST("/sessions", sessionH.Create)
	v1.GET("/sessions", sessionH.List)
	v1.GET("/sessions/:id", sessionH.Get)
	v1.PUT("/sessions/:id", sessionH.Update)
	v1.POST("/sessions/:id/start", sessionH.Start)
	v1.POST("/sessions/:id/stop", sessionH.Stop)
	v1.GET("/sessions/:id/pnl", sessionH.GetPnL)
	v1.GET("/sessions/:id/orders", sessionH.GetOrders)
	v1.GET("/sessions/:id/portfolio", sessionH.GetPortfolio)
	v1.PATCH("/sessions/:id/notes", sessionH.UpdateNotes)
	v1.GET("/sessions/:id/reevaluate", sessionH.Reevaluate)
	v1.PATCH("/sessions/:id/config", sessionH.ApplyConfig)
  v1.DELETE("/sessions/:id", sessionH.Delete)

	// Per-strategy scoped routes — strategy injected from path so the same
	// handler serves /v1/{strategy}/sessions with filtering and create override.
	for _, strat := range []string{"grid", "trend", "dca"} {
		g := v1.Group("/" + strat)
		g.GET("/sessions", withStrategy(strat, sessionH.List))
		g.POST("/sessions", withStrategy(strat, sessionH.Create))
	}
	v1.GET("/sessions/:id/signals", func(c echo.Context) error {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		signals, err := signalRepo.ListBySession(c.Request().Context(), id, 100)
		if err != nil {
			return c.JSON(500, ErrorResponse{Error: "failed to fetch signals: " + err.Error()})
		}
		return c.JSON(200, signals)
	})
	v1.GET("/sessions/:id/signals/summary", func(c echo.Context) error {
		id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
		summary, err := signalRepo.GetSummary(c.Request().Context(), id)
		if err != nil {
			return c.JSON(500, ErrorResponse{Error: "failed to fetch summary: " + err.Error()})
		}
		return c.JSON(200, summary)
	})
	v1.GET("/grid/recommend", func(c echo.Context) error {
		symbol := c.QueryParam("symbol")
		if symbol == "" {
			return c.JSON(400, ErrorResponse{Error: "symbol is required"})
		}
		horizon := engine.Horizon(c.QueryParam("horizon"))
		if horizon == "" {
			horizon = engine.HorizonMedium
		}
		capitalStr := c.QueryParam("capital")
		capital, _ := strconv.ParseFloat(capitalStr, 64)
		if capital <= 0 {
			capital = 100
		}
		vMode := engine.ValidationGridSteps
		if c.QueryParam("validation_mode") == "percent" {
			vMode = engine.ValidationPercent
		}
		ticker, err := tokoClient.GetTicker(symbol)
		if err != nil {
			return c.JSON(502, ErrorResponse{Error: "failed to fetch ticker: " + err.Error()})
		}
		price, _ := strconv.ParseFloat(ticker.LastPrice, 64)
		rec, err := engine.RecommendGrid(symbol, price, horizon, capital, vMode)
		if err != nil {
			return c.JSON(400, ErrorResponse{Error: err.Error()})
		}
		return c.JSON(200, rec)
	})

	// Trend Signal recommendation: returns recommended SMA fast/slow, interval, qty, and validation defaults per pair/horizon.
	v1.GET("/trend/recommend", func(c echo.Context) error {
		symbol := c.QueryParam("symbol")
		if symbol == "" {
			return c.JSON(400, ErrorResponse{Error: "symbol is required"})
		}
		horizon := engine.Horizon(c.QueryParam("horizon"))
		if horizon == "" {
			horizon = engine.HorizonMedium
		}
		capitalStr := c.QueryParam("capital")
		capital, _ := strconv.ParseFloat(capitalStr, 64)
		if capital <= 0 {
			capital = 100
		}
		ticker, err := tokoClient.GetTicker(symbol)
		if err != nil {
			return c.JSON(502, ErrorResponse{Error: "failed to fetch ticker: " + err.Error()})
		}
		price, _ := strconv.ParseFloat(ticker.LastPrice, 64)
		rec, err := engine.RecommendTrend(symbol, price, horizon, capital)
		if err != nil {
			return c.JSON(400, ErrorResponse{Error: err.Error()})
		}
		return c.JSON(200, rec)
	})

	// Grid insights: analyze past signal data for recommendations
	v1.GET("/grid/insights", func(c echo.Context) error {
		symbol := c.QueryParam("symbol")
		if symbol == "" {
			return c.JSON(400, ErrorResponse{Error: "symbol is required"})
		}

		// Find grid signal sessions for this pair with their signal stats
		type insight struct {
			SessionID   int64   `json:"session_id"`
			Name        string  `json:"name"`
			Config      string  `json:"config"`
			Total       int     `json:"total"`
			Confirmed   int     `json:"confirmed"`
			Invalidated int     `json:"invalidated"`
			SuccessRate float64 `json:"success_rate"`
		}

		var insights []insight
		err := db.Select(&insights, db.Rebind(`
			SELECT s.id as session_id, s.name, s.config,
				COUNT(ss.id) as total,
				SUM(CASE WHEN ss.validation_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
				SUM(CASE WHEN ss.validation_status = 'invalidated' THEN 1 ELSE 0 END) as invalidated
			FROM sessions s
			LEFT JOIN strategy_signals ss ON ss.session_id = s.id
			WHERE s.symbol = ? AND s.strategy = 'grid' AND s.mode = 'signal'
			GROUP BY s.id, s.name, s.config
			HAVING COUNT(ss.id) > 0
			ORDER BY s.created_at DESC
			LIMIT 20`), symbol)
		if err != nil {
			return c.JSON(500, ErrorResponse{Error: err.Error()})
		}

		// Calculate success rates
		for i := range insights {
			if insights[i].Total > 0 {
				insights[i].SuccessRate = float64(insights[i].Confirmed) / float64(insights[i].Total) * 100
			}
		}

		return c.JSON(200, insights)
	})

	// Trend session status: real-time SMA/cross monitoring for running trend sessions
	v1.GET("/trend/sessions/status", func(c echo.Context) error {
		userIDStr := c.Get("user_id").(string)
		userID, _ := strconv.ParseInt(userIDStr, 10, 64)

		var sessions []model.Session
		err := db.Select(&sessions, db.Rebind(
			`SELECT * FROM sessions WHERE user_id = ? AND strategy = 'trend' ORDER BY created_at DESC`), userID)
		if err != nil {
			return c.JSON(500, ErrorResponse{Error: err.Error()})
		}

		type sessionStatus struct {
			SessionID        int64    `json:"session_id"`
			SessionName      string   `json:"session_name"`
			Symbol           string   `json:"symbol"`
			Mode             string   `json:"mode"`
			FastSMA          *float64 `json:"fast_sma,omitempty"`
			SlowSMA          *float64 `json:"slow_sma,omitempty"`
			CrossStatus      string   `json:"cross_status"`
			PricePositionPct *float64 `json:"price_position_pct,omitempty"`
			CurrentPrice     *float64 `json:"current_price,omitempty"`
			LastSignalType   *string  `json:"last_signal_type,omitempty"`
			LastSignalResult *float64 `json:"last_signal_result,omitempty"`
		}

		results := make([]sessionStatus, 0, len(sessions))
		for _, s := range sessions {
			slog.Info("trend status compute", "session", s.ID, "symbol", s.Symbol, "config", s.Config)
			status := engine.ComputeTrendStatus(tokoClient, s, s.Config)
			slog.Info("trend status result", "session", s.ID, "status_nil", status == nil)
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
			}

			var sig struct {
				SignalType string  `db:"signal_type"`
				ResultPct  *float64 `db:"result_pct"`
			}
			err := db.Get(&sig, db.Rebind(
				`SELECT signal_type, result_pct FROM strategy_signals WHERE session_id = ? AND validation_status = 'confirmed' ORDER BY created_at DESC LIMIT 1`), s.ID)
			if err == nil {
				entry.LastSignalType = &sig.SignalType
				entry.LastSignalResult = sig.ResultPct
			}

			results = append(results, entry)
		}

		return c.JSON(200, results)
	})

	// WebSocket (public, unauthenticated)
	e.GET("/ws/sessions/:id", wsHub.HandleWS)

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := e.Start(":" + cfg.Port); err != nil {
			slog.Error("server", "error", err)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down gracefully...")
	engMgr.StopAll()
	e.Shutdown(context.Background())
}

func recoverRunningSessions(db *sqlx.DB, mgr *engine.Manager) {
	var sessions []model.Session
	if err := db.Select(&sessions, "SELECT * FROM sessions WHERE status = 'running'"); err != nil {
		slog.Warn("recover sessions query", "error", err)
		return
	}
	for _, s := range sessions {
		if err := mgr.Start(s); err != nil {
			slog.Warn("recover session failed", "id", s.ID, "name", s.Name, "error", err)
		} else {
			slog.Info("session auto-restarted", "id", s.ID, "name", s.Name)
		}
	}
}
