package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
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
		msg = he.Message.(string)
	} else if c.Response().Committed {
		return
	}
	slog.Warn("http error", "path", c.Path(), "code", code, "error", msg)
	c.JSON(code, ErrorResponse{Error: msg})
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
	e.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(20)))
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
	sessionH := handler.NewSessionHandler(sessionSvc, engMgr)

	v1.GET("/ticker/:symbol", func(c echo.Context) error {
		ticker, err := tokoClient.GetTicker(c.Param("symbol"))
		if err != nil {
			return c.JSON(502, ErrorResponse{Error: "failed to fetch ticker: " + err.Error()})
		}
		return c.JSON(200, ticker)
	})

	v1.POST("/sessions", sessionH.Create)
	v1.GET("/sessions", sessionH.List)
	v1.GET("/sessions/:id", sessionH.Get)
	v1.PUT("/sessions/:id", sessionH.Update)
	v1.POST("/sessions/:id/start", sessionH.Start)
	v1.POST("/sessions/:id/stop", sessionH.Stop)
	v1.GET("/sessions/:id/pnl", sessionH.GetPnL)
	v1.GET("/sessions/:id/orders", sessionH.GetOrders)
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
