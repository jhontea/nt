package handler

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/service"
)

type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

type authRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(c echo.Context) error {
	var req authRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid request"))
	}
	if req.Username == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, ErrorJSON("username and password required"))
	}
	ctx := c.Request().Context()
	if ctx == nil {
		ctx = context.Background()
	}
	token, err := h.svc.Register(ctx, req.Username, req.Password)
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON(err.Error()))
	}
	return c.JSON(http.StatusCreated, map[string]string{"token": token})
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req authRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorJSON("invalid request"))
	}
	ctx := c.Request().Context()
	if ctx == nil {
		ctx = context.Background()
	}
	token, err := h.svc.Login(ctx, req.Username, req.Password)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, ErrorJSON("invalid credentials"))
	}
	return c.JSON(http.StatusOK, map[string]string{"token": token})
}
