package tokocrypto

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"
)

type rewriteTransport struct {
	target string
}

func (t rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	target, _ := url.Parse(t.target)
	req.URL.Scheme = target.Scheme
	req.URL.Host = target.Host
	return http.DefaultTransport.RoundTrip(req)
}

func setupTickerServer(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) (*httptest.Server, *Client) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(handler))
	c := &Client{
		apiKey:    "test-key",
		secretKey: "test-secret",
		http:      &http.Client{Transport: rewriteTransport{target: srv.URL}},
		tickCache: make(map[string]cacheEntry),
		wsStarted: make(map[string]bool),
	}
	t.Cleanup(srv.Close)
	return srv, c
}

func TestGetTicker_Success(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/klines" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("symbol") != "BTCUSDT" {
			t.Errorf("unexpected symbol: %s", r.URL.Query().Get("symbol"))
		}
		// kline: [openTime, open, high, low, close, volume, ...]
		json.NewEncoder(w).Encode([][]any{
			{int64(1700000000000), "49000.00", "51000.00", "49000.00", "50000.00", "100.5", int64(1700000000000), "5000000", 100, "50", "2500000", "0"},
		})
	})

	ticker, err := c.GetTicker("BTC_USDT")
	if err != nil {
		t.Fatalf("GetTicker failed: %v", err)
	}
	if ticker.LastPrice != "50000.00" {
		t.Errorf("expected LastPrice 50000.00, got %s", ticker.LastPrice)
	}
	if ticker.Volume != "100.5" {
		t.Errorf("expected Volume 100.5, got %s", ticker.Volume)
	}
}

func TestGetTicker_CacheHit(t *testing.T) {
	callCount := 0
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		callCount++
		json.NewEncoder(w).Encode([][]any{
			{int64(1700000000000), "49000.00", "51000.00", "49000.00", "50000.00", "100.5", int64(1700000000000), "5000000", 100, "50", "2500000", "0"},
		})
	})

	c.GetTicker("BTC_USDT")
	if callCount != 1 {
		t.Fatalf("expected 1 API call, got %d", callCount)
	}

	c.GetTicker("BTC_USDT")
	if callCount != 1 {
		t.Errorf("expected cache hit (still 1 API call), got %d", callCount)
	}
}

func TestGetTicker_CacheExpiry(t *testing.T) {
	callCount := 0
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		callCount++
		closePrice := fmt.Sprintf("%d.00", callCount*50000)
		json.NewEncoder(w).Encode([][]any{
			{int64(1700000000000), "49000.00", "51000.00", "49000.00", closePrice, "100.5", int64(1700000000000), "5000000", 100, "50", "2500000", "0"},
		})
	})

	c.GetTicker("BTC_USDT")
	c.GetTicker("BTC_USDT") // cached
	if callCount != 1 {
		t.Fatalf("expected 1 call before expiry, got %d", callCount)
	}

	c.mu.Lock()
	c.tickCache["BTC_USDT"] = cacheEntry{data: &Ticker{LastPrice: "old", Volume: "0"}, expiresAt: time.Now().Add(-time.Second)}
	c.mu.Unlock()

	c.GetTicker("BTC_USDT")
	if callCount != 2 {
		t.Errorf("expected 2 calls after expiry, got %d", callCount)
	}
}

func TestGetTicker_APIError(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	})

	_, err := c.GetTicker("BTC_USDT")
	if err == nil {
		t.Fatal("expected error for 500 response")
	}
}

func TestGetTicker_ErrorCode(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"code": "-1001", "msg": "invalid symbol"})
	})

	_, err := c.GetTicker("INVALID")
	if err == nil {
		t.Fatal("expected error for invalid symbol")
	}
}

func TestRetryCall_SucceedsFirst(t *testing.T) {
	callCount := 0
	fn := func() (int, error) {
		callCount++
		return 42, nil
	}

	result, err := retryCall(fn)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != 42 {
		t.Errorf("expected 42, got %d", result)
	}
	if callCount != 1 {
		t.Errorf("expected 1 call, got %d", callCount)
	}
}

func TestRetryCall_RetriesThenSucceeds(t *testing.T) {
	callCount := 0
	fn := func() (string, error) {
		callCount++
		if callCount < 3 {
			return "", fmt.Errorf("attempt %d failed", callCount)
		}
		return "ok", nil
	}

	result, err := retryCall(fn)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "ok" {
		t.Errorf("expected ok, got %s", result)
	}
	if callCount != 3 {
		t.Errorf("expected 3 calls (2 retries), got %d", callCount)
	}
}

func TestRetryCall_AllRetriesFail(t *testing.T) {
	callCount := 0
	fn := func() (int, error) {
		callCount++
		return 0, fmt.Errorf("always fails")
	}

	_, err := retryCall(fn)
	if err == nil {
		t.Fatal("expected error after 3 retries")
	}
	if callCount != 3 {
		t.Errorf("expected 3 attempts, got %d", callCount)
	}
}

func TestGetCandles_Success(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/open/v1/market/klines" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		json.NewEncoder(w).Encode(CandleResponse{
			Code: 0, Data: [][]any{{"t", "o", "h", "l", "c", "v"}},
		})
	})

	candles, err := c.GetCandles("BTC_USDT", "1h", 10)
	if err != nil {
		t.Fatalf("GetCandles failed: %v", err)
	}
	if len(candles) != 1 {
		t.Errorf("expected 1 candle, got %d", len(candles))
	}
}

func TestGetCandles_Error(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(CandleResponse{Code: -1001, Message: "error"})
	})

	_, err := c.GetCandles("INVALID", "1h", 10)
	if err == nil {
		t.Fatal("expected error for non-zero code")
	}
}

func TestHMACSignature(t *testing.T) {
	// Verify the client generates correct HMAC SHA256 signature
	// by checking that the request includes a valid signature parameter
	var capturedQuery string
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		capturedQuery = r.URL.RawQuery
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(AccountResponse{Code: 0, Data: Account{}})
	})

	c.GetAccount()
	if capturedQuery == "" {
		t.Fatal("expected signed request to include query params")
	}

	parsed, _ := url.ParseQuery(capturedQuery)
	if parsed.Get("signature") == "" {
		t.Error("expected signature parameter in signed request")
	}
	if parsed.Get("timestamp") == "" {
		t.Error("expected timestamp parameter in signed request")
	}
	if parsed.Get("recvWindow") != "5000" {
		t.Errorf("expected recvWindow=5000, got %s", parsed.Get("recvWindow"))
	}
	if parsed.Get("X-MBX-APIKEY") != "" {
		t.Error("X-MBX-APIKEY should not be in query string, it's a header")
	}
}

func TestConcurrentCache(t *testing.T) {
	// Verify cache is safe for concurrent access
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(TickerResponse{
			Code: 0, Data: Ticker{LastPrice: "50000", Volume: "100"},
		})
	})

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.GetTicker("BTC_USDT")
		}()
	}
	wg.Wait()
}

func TestDoPublic_Non200(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"code":-1001,"msg":"bad request"}`))
	})

	_, err := c.doPublic("/test", nil)
	if err == nil {
		t.Fatal("expected error for non-200")
	}
}
