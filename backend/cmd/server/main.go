package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
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

	dsn := cfg.DatabaseDSN
	if cfg.DatabaseDriver == "" || cfg.DatabaseDriver == "sqlite" {
		dsn = cfg.DatabasePath
	}
	db, err := repository.NewDB(dsn)
	if err != nil {
		slog.Error("database", "error", err)
		os.Exit(1)
	}
	if err := repository.Migrate(db); err != nil {
		slog.Error("migration", "error", err)
		os.Exit(1)
	}

	userRepo := repository.NewUserRepo(db)
	authSvc := service.NewAuthService(userRepo, cfg.JWTSecret)
	authH := handler.NewAuthHandler(authSvc)

	e := echo.New()
	e.HTTPErrorHandler = customHTTPErrorHandler
	e.Use(middleware.Logger())
	e.Use(middleware.CORS())
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

	// Auth routes (public)
	e.POST("/v1/register", authH.Register)
	e.POST("/v1/login", authH.Login)

	// API v1 (authenticated)
	v1 := e.Group("/v1", authmw.Auth(cfg.JWTSecret))

	sessionRepo := repository.NewSessionRepo(db)
	sessionSvc := service.NewSessionServiceWithPnL(sessionRepo, service.NewPnLService(db))
	tokoClient := tokocrypto.NewClient(cfg.TokenAPIKey, cfg.TokenSecretKey)
	notifier := service.NewNotifier(cfg.TelegramBotToken, cfg.TelegramChatID)
	wsHub := engine.NewWSHub()
	engMgr := engine.NewManager(tokoClient, db, notifier, wsHub)
	sessionH := handler.NewSessionHandler(sessionSvc, engMgr)

	v1.POST("/sessions", sessionH.Create)
	v1.GET("/sessions", sessionH.List)
	v1.GET("/sessions/:id", sessionH.Get)
	v1.PUT("/sessions/:id", sessionH.Update)
	v1.POST("/sessions/:id/start", sessionH.Start)
	v1.POST("/sessions/:id/stop", sessionH.Stop)
	v1.GET("/sessions/:id/pnl", sessionH.GetPnL)
	v1.GET("/sessions/:id/orders", sessionH.GetOrders)

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
