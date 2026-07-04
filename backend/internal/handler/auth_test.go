package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/repository/mocks"
	"github.com/user/nt/internal/service"
	"go.uber.org/mock/gomock"
)

func setupAuthTest(t *testing.T) (*AuthHandler, *mocks.MockUserRepository, echo.Context, *httptest.ResponseRecorder) {
	ctrl := gomock.NewController(t)
	mockRepo := mocks.NewMockUserRepository(ctrl)
	svc := service.NewAuthService(mockRepo, "test-secret", 24)
	h := NewAuthHandler(svc)

	e := echo.New()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = req.WithContext(context.Background())
	c := e.NewContext(req, rec)
	return h, mockRepo, c, rec
}

func TestAuthHandler_Register_Success(t *testing.T) {
	h, mockRepo, c, rec := setupAuthTest(t)

	body := `{"username":"testuser","password":"secret123"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.Background())
	c.SetRequest(req)

	mockRepo.EXPECT().Create(gomock.Any(), "testuser", gomock.Any()).Return(&model.User{ID: 1, Username: "testuser"}, nil)
	_ = h.Register(c)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", rec.Code)
	}
}

func TestAuthHandler_Register_ShortPassword(t *testing.T) {
	h, _, c, rec := setupAuthTest(t)

	body := `{"username":"testuser","password":"ab"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.Background())
	c.SetRequest(req)

	_ = h.Register(c)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "minimum 4") {
		t.Errorf("expected password validation error, got %s", rec.Body.String())
	}
}

func TestAuthHandler_Login_InvalidCredentials(t *testing.T) {
	h, mockRepo, c, rec := setupAuthTest(t)

	body := `{"username":"nonexistent","password":"pass1234"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.Background())
	c.SetRequest(req)

	mockRepo.EXPECT().FindByUsername(gomock.Any(), "nonexistent").Return(nil, echo.NewHTTPError(404))

	_ = h.Login(c)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}
