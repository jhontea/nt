package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestWithStrategyRoutePropagatesStrategy(t *testing.T) {
	e := echo.New()
	e.GET("/v1/:strat/sessions", withStrategy("grid", func(c echo.Context) error {
		return c.String(http.StatusOK, c.Get("strategy").(string))
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/grid/sessions", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if rec.Body.String() != "grid" {
		t.Fatalf("expected strategy 'grid' in context, got %q", rec.Body.String())
	}
}
