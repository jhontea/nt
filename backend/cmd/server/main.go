package main

import (
	"context"
	"fmt"
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
	"github.com/user/nt/internal/config"
	"github.com/user/nt/internal/engine"
	"github.com/user/nt/internal/handler"
	authmw "github.com/user/nt/internal/middleware"
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
		msg = fmt.Sprintf("%v", he.Message)
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
		AllowOrigins: cfg.AllowedOrigins,
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
	wsHub.SetAllowedOrigins(cfg.AllowedOrigins)
	engMgr := engine.NewManager(tokoClient, db, notifier, wsHub, signalRepo)

	// Auto-restart sessions that were running before shutdown
	recoverRunningSessions(sessionRepo, engMgr)

	sessionH := handler.NewSessionHandler(sessionSvc, engMgr, db, tokoClient, signalRepo)

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

	v1.GET("/market/movers", func(c echo.Context) error {
		return c.JSON(200, tokoClient.GetMovers())
	})

	v1.POST("/sessions", sessionH.Create)
	v1.GET("/sessions", sessionH.List)
	v1.GET("/sessions/:id", sessionH.Get)
	v1.PUT("/sessions/:id", sessionH.Update)
	v1.POST("/sessions/:id/start", sessionH.Start)
	v1.POST("/sessions/:id/stop", sessionH.Stop)
	v1.GET("/sessions/:id/pnl", sessionH.GetPnL)
	v1.GET("/sessions/:id/orders", sessionH.GetOrders)
	v1.GET("/sessions/:id/dca-stats", sessionH.GetDCAStats)
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
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			return c.JSON(400, ErrorResponse{Error: "invalid session id"})
		}
		signals, err := signalRepo.ListBySession(c.Request().Context(), id, 100)
		if err != nil {
			return c.JSON(500, ErrorResponse{Error: "failed to fetch signals: " + err.Error()})
		}
		return c.JSON(200, signals)
	})
	v1.GET("/sessions/:id/signals/summary", func(c echo.Context) error {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			return c.JSON(400, ErrorResponse{Error: "invalid session id"})
		}
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
	v1.GET("/grid/insights", sessionH.GetGridInsights)
	v1.GET("/trend/sessions/status", sessionH.GetTrendSessionsStatus)

	// Live account balance endpoint
	v1.GET("/account/balance", func(c echo.Context) error {
		if tokoClient == nil {
			return c.JSON(400, ErrorResponse{Error: "API key tidak dikonfigurasi"})
		}
		acc, err := tokoClient.GetAccount()
		if err != nil {
			return c.JSON(502, ErrorResponse{Error: "gagal ambil data akun: " + err.Error()})
		}
		type assetInfo struct {
			Asset  string `json:"asset"`
			Free   string `json:"free"`
			Locked string `json:"locked"`
		}
		// Only return assets with non-zero balance
		assets := make([]assetInfo, 0)
		for _, a := range acc.AccountAssets {
			freeF, _ := strconv.ParseFloat(a.Free, 64)
			lockedF, _ := strconv.ParseFloat(a.Locked, 64)
			if freeF > 0 || lockedF > 0 {
				assets = append(assets, assetInfo{Asset: a.Asset, Free: a.Free, Locked: a.Locked})
			}
		}
		return c.JSON(200, map[string]any{
			"can_trade": acc.CanTrade,
			"assets":    assets,
		})
	})

	// Candle data for frontend backtest
	v1.GET("/candles", func(c echo.Context) error {
		symbol := c.QueryParam("symbol")
		interval := c.QueryParam("interval")
		if symbol == "" {
			return c.JSON(400, ErrorResponse{Error: "symbol required"})
		}
		if interval == "" {
			interval = "1h"
		}
		limit := 200
		if n, err := strconv.Atoi(c.QueryParam("limit")); err == nil && n > 0 && n <= 500 {
			limit = n
		}
		candles, err := tokoClient.GetCandles(symbol, interval, limit)
		if err != nil {
			return c.JSON(502, ErrorResponse{Error: "failed to fetch candles: " + err.Error()})
		}
		// Return as [{time, open, high, low, close, volume}]
		type candleRow struct {
			Time   any    `json:"t"`
			Open   string `json:"o"`
			High   string `json:"h"`
			Low    string `json:"l"`
			Close  string `json:"c"`
			Volume string `json:"v"`
		}
		rows := make([]candleRow, 0, len(candles))
		for _, c := range candles {
			if len(c) < 6 {
				continue
			}
			rows = append(rows, candleRow{
				Time: c[0], Open: fmt.Sprintf("%v", c[1]),
				High: fmt.Sprintf("%v", c[2]), Low: fmt.Sprintf("%v", c[3]),
				Close: fmt.Sprintf("%v", c[4]), Volume: fmt.Sprintf("%v", c[5]),
			})
		}
		return c.JSON(200, rows)
	})
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
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	e.Shutdown(shutdownCtx)
}

func recoverRunningSessions(sessionRepo repository.SessionRepository, mgr *engine.Manager) {
	sessions, err := sessionRepo.ListRunning(context.Background())
	if err != nil {
		slog.Warn("recover sessions query", "error", err)
		return
	}
	for _, s := range sessions {
		s := s // capture loop var
		go func() {
			if err := mgr.Start(s); err != nil {
				slog.Warn("recover session failed", "id", s.ID, "name", s.Name, "error", err)
			} else {
				slog.Info("session auto-restarted", "id", s.ID, "name", s.Name)
			}
		}()
	}
}
