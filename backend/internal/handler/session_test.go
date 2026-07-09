package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/engine"
	"github.com/user/nt/internal/model"
	mockrepo "github.com/user/nt/internal/repository/mocks"
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/tokocrypto"
	"go.uber.org/mock/gomock"
	_ "modernc.org/sqlite"
)

func setupSessionTest(t *testing.T) (*SessionHandler, *mockrepo.MockSessionRepository, echo.Context, *httptest.ResponseRecorder) {
	t.Helper()
	ctrl := gomock.NewController(t)
	mockRepo := mockrepo.NewMockSessionRepository(ctrl)
	svc := service.NewSessionServiceWithPnL(mockRepo, service.NewPnLService(nil))

	client := tokocrypto.NewClient("", "")
	wsHub := engine.NewWSHub("test")
	notifier := service.NewNotifier("", "")
	mgr := engine.NewManager(client, nil, notifier, wsHub, nil)
	h := NewSessionHandler(svc, mgr, nil, nil, nil)

	e := echo.New()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = req.WithContext(context.WithValue(context.Background(), "user_id", "1"))
	c := e.NewContext(req, rec)
	c.Set("user_id", "1")
	return h, mockRepo, c, rec
}

// setupSessionTestWithPnL creates handler with a real SQLite-backed PnL service for GetPnL/GetOrders tests.
func setupSessionTestWithPnL(t *testing.T) (*SessionHandler, *mockrepo.MockSessionRepository, echo.Context, *httptest.ResponseRecorder) {
	t.Helper()
	ctrl := gomock.NewController(t)
	mockRepo := mockrepo.NewMockSessionRepository(ctrl)

	f, _ := os.CreateTemp("", "handler-pnl-*.db")
	db, err := sqlx.Open("sqlite", f.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close(); os.Remove(f.Name()) })
	db.Exec(`
		CREATE TABLE sessions (id INTEGER PRIMARY KEY, virtual_balance REAL DEFAULT 0);
		CREATE TABLE trades (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, order_id TEXT,
			symbol TEXT, side TEXT, price TEXT, quantity TEXT, fee TEXT, fee_asset TEXT,
			pnl TEXT, traded_at DATETIME DEFAULT CURRENT_TIMESTAMP);
		CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, order_id TEXT,
			symbol TEXT, side TEXT, type TEXT, price TEXT, quantity TEXT, status TEXT,
			executed_qty TEXT DEFAULT '0', executed_price TEXT DEFAULT '0', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
	`)
	db.Exec("INSERT INTO sessions (id, virtual_balance) VALUES (1, 1100)")

	pnlSvc := service.NewPnLService(db)
	svc := service.NewSessionServiceWithPnL(mockRepo, pnlSvc)

	client := tokocrypto.NewClient("", "")
	wsHub := engine.NewWSHub("test")
	notifier := service.NewNotifier("", "")
	mgr := engine.NewManager(client, nil, notifier, wsHub, nil)
	h := NewSessionHandler(svc, mgr, nil, nil, nil)

	e := echo.New()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	c := e.NewContext(req, rec)
	c.Set("user_id", "1")
	return h, mockRepo, c, rec
}

func TestSessionHandler_Create_Valid(t *testing.T) {
	h, mockRepo, c, rec := setupSessionTest(t)

	body := `{"name":"test","strategy":"grid","mode":"signal","symbol":"BTC_USDT","config":"{\"upper_price\":70000,\"lower_price\":60000,\"grid_count\":10,\"quantity\":\"0.001\"}"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(context.Background(), "user_id", "1"))
	c.SetRequest(req)
	c.SetParamNames("id")
	c.SetParamValues("1")

	mockRepo.EXPECT().Create(gomock.Any(), gomock.Any()).Return(&model.Session{ID: 1, Name: "test"}, nil)
	_ = h.Create(c)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionHandler_Create_InvalidConfig(t *testing.T) {
	h, _, c, rec := setupSessionTest(t)

	body := `{"strategy":"grid","mode":"signal","symbol":"INVALID","config":"{\"upper_price\":0,\"lower_price\":0,\"grid_count\":0,\"quantity\":\"0\"}"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(context.WithValue(context.Background(), "user_id", "1"))
	c.SetRequest(req)

	_ = h.Create(c)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid config, got %d", rec.Code)
	}
}

func TestSessionHandler_List(t *testing.T) {
	h, mockRepo, c, rec := setupSessionTest(t)

	sessions := []model.Session{{ID: 1, Name: "s1"}, {ID: 2, Name: "s2"}}
	mockRepo.EXPECT().ListByUser(gomock.Any(), int64(1)).Return(sessions, nil)

	_ = h.List(c)

	var result []model.Session
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 2 {
		t.Errorf("expected 2 sessions, got %d", len(result))
	}
}

func TestSessionHandler_Get_NotFound(t *testing.T) {
	h, mockRepo, c, _ := setupSessionTest(t)
	c.SetParamNames("id")
	c.SetParamValues("999")

	mockRepo.EXPECT().FindByID(gomock.Any(), int64(999)).Return(nil, echo.NewHTTPError(404))

	err := h.Get(c)
	if err != nil {
		he, ok := err.(*echo.HTTPError)
		if !ok || he.Code != http.StatusNotFound {
			t.Errorf("expected 404, got %v", err)
		}
	}
}

func TestSessionHandler_Update(t *testing.T) {
	h, mockRepo, c, rec := setupSessionTest(t)
	c.SetParamNames("id")
	c.SetParamValues("1")

	body := `{"name":"updated","symbol":"ETH_USDT"}`
	req := httptest.NewRequest(http.MethodPut, "/v1/sessions/1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	c.SetRequest(req)

	session := &model.Session{ID: 1, UserID: 1, Name: "original", Symbol: "BTC_USDT"}
	mockRepo.EXPECT().FindByID(gomock.Any(), int64(1)).Return(session, nil)
	mockRepo.EXPECT().Update(gomock.Any(), gomock.Any()).Return(nil)

	if err := h.Update(c); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

func TestSessionHandler_Update_Forbidden(t *testing.T) {
	h, mockRepo, c, _ := setupSessionTest(t)
	c.SetParamNames("id")
	c.SetParamValues("2")

	body := `{"name":"hacked"}`
	req := httptest.NewRequest(http.MethodPut, "/v1/sessions/2", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	c.SetRequest(req)

	// Session belongs to user 2, current user is 1
	mockRepo.EXPECT().FindByID(gomock.Any(), int64(2)).Return(&model.Session{ID: 2, UserID: 2, Name: "other"}, nil)

	err := h.Update(c)
	if err == nil {
		t.Fatal("expected error for access denied")
	}
	he, ok := err.(*echo.HTTPError)
	if !ok || he.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %v", err)
	}
}

func TestSessionHandler_Start(t *testing.T) {
	h, mockRepo, c, rec := setupSessionTest(t)
	c.SetParamNames("id")
	c.SetParamValues("1")

	session := &model.Session{ID: 1, UserID: 1, Strategy: "grid", Mode: "signal", Symbol: "BTC_USDT", Config: "{}"}
	mockRepo.EXPECT().FindByID(gomock.Any(), int64(1)).Return(session, nil)
	mockRepo.EXPECT().UpdateStarted(gomock.Any(), int64(1)).Return(nil)

	if err := h.Start(c); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSessionHandler_Stop(t *testing.T) {
	h, mockRepo, c, rec := setupSessionTest(t)
	c.SetParamNames("id")
	c.SetParamValues("1")

	mockRepo.EXPECT().FindByID(gomock.Any(), int64(1)).Return(&model.Session{ID: 1, UserID: 1}, nil)
	mockRepo.EXPECT().UpdateStopped(gomock.Any(), int64(1)).Return(nil)

	if err := h.Stop(c); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

func TestSessionHandler_GetPnL(t *testing.T) {
	h, mockRepo, c, rec := setupSessionTestWithPnL(t)
	c.SetParamNames("id")
	c.SetParamValues("1")

	mockRepo.EXPECT().FindByID(gomock.Any(), int64(1)).Return(&model.Session{ID: 1, UserID: 1}, nil)

	if err := h.GetPnL(c); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var pnl service.PnLSummary
	if err := json.Unmarshal(rec.Body.Bytes(), &pnl); err != nil {
		t.Fatal(err)
	}
	if pnl.Balance != 1100 {
		t.Errorf("expected balance 1100, got %.2f", pnl.Balance)
	}
}

func TestSessionHandler_GetOrders_Empty(t *testing.T) {
	h, mockRepo, c, rec := setupSessionTestWithPnL(t)
	c.SetParamNames("id")
	c.SetParamValues("1")

	mockRepo.EXPECT().FindByID(gomock.Any(), int64(1)).Return(&model.Session{ID: 1, UserID: 1}, nil)

	if err := h.GetOrders(c); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var orders []model.Order
	if err := json.Unmarshal(rec.Body.Bytes(), &orders); err != nil {
		t.Fatal(err)
	}
	if len(orders) != 0 {
		t.Errorf("expected 0 orders, got %d", len(orders))
	}
}
