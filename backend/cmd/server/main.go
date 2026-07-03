package main

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/user/nt/internal/config"
	"github.com/user/nt/internal/handler"
	"github.com/user/nt/internal/repository"
	"github.com/user/nt/internal/service"
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

	e.Logger.Fatal(e.Start(":" + cfg.Port))
}
