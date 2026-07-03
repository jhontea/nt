package main

import (
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

func main() {
	cfg := config.Load()

	db, err := repository.NewDB(cfg.DatabasePath)
	if err != nil {
		panic(err)
	}
	if err := repository.Migrate(db); err != nil {
		panic(err)
	}

	userRepo := repository.NewUserRepo(db)
	authSvc := service.NewAuthService(userRepo, cfg.JWTSecret)
	authH := handler.NewAuthHandler(authSvc)

	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.CORS())

	e.GET("/api/health", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})

	e.POST("/api/register", authH.Register)
	e.POST("/api/login", authH.Login)

	api := e.Group("/api", authmw.Auth(cfg.JWTSecret))

	sessionRepo := repository.NewSessionRepo(db)
	sessionSvc := service.NewSessionServiceWithPnL(sessionRepo, service.NewPnLService(db))
	tokoClient := tokocrypto.NewClient(cfg.TokenAPIKey, cfg.TokenSecretKey)
	notifier := service.NewNotifier(cfg.TelegramBotToken, cfg.TelegramChatID)
	wsHub := engine.NewWSHub()
	engMgr := engine.NewManager(tokoClient, db, notifier, wsHub)
	sessionH := handler.NewSessionHandler(sessionSvc, engMgr)

	api.POST("/sessions", sessionH.Create)
	api.GET("/sessions", sessionH.List)
	api.GET("/sessions/:id", sessionH.Get)
	api.PUT("/sessions/:id", sessionH.Update)
	api.POST("/sessions/:id/start", sessionH.Start)
	api.POST("/sessions/:id/stop", sessionH.Stop)
	api.GET("/sessions/:id/pnl", sessionH.GetPnL)

	e.GET("/ws/sessions/:id", wsHub.HandleWS)

	e.Logger.Fatal(e.Start(":" + cfg.Port))
}
