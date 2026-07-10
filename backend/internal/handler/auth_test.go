package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/repository/mocks"
	"github.com/user/nt/internal/service"
	"go.uber.org/mock/gomock"
)

func setupAuthTest(t *testing.T) (*AuthHandler, *mocks.MockUserRepository) {
	ctrl := gomock.NewController(t)
	mockRepo := mocks.NewMockUserRepository(ctrl)
	svc := service.NewAuthService(mockRepo, "test-secret", 24, map[string]bool{"hafizhipb49@gmail.com": true})
	h := NewAuthHandler(svc, "client-id", "client-secret", "http://localhost:8100/api/v1/auth/google/callback", "http://localhost:3100")
	return h, mockRepo
}

func TestAuthHandler_GoogleLogin_Redirects(t *testing.T) {
	h, _ := setupAuthTest(t)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	_ = h.GoogleLogin(c)

	if rec.Code != http.StatusTemporaryRedirect {
		t.Errorf("expected 307, got %d", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if loc == "" {
		t.Error("expected redirect Location header")
	}
}

func TestAuthHandler_GoogleCallback_NoCode(t *testing.T) {
	h, _ := setupAuthTest(t)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/callback", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	_ = h.GoogleCallback(c)

	if rec.Code != http.StatusTemporaryRedirect {
		t.Errorf("expected 307, got %d", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if loc != "http://localhost:3100/login?error=no_code" {
		t.Errorf("unexpected redirect: %s", loc)
	}
}
