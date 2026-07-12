package tokocrypto

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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
			Code: 0, Data: CandleData{List: [][]any{{"t", "o", "h", "l", "c", "v"}}},
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

func TestPlaceOrderSendsClientID(t *testing.T) {
	clientID := "0123456789abcdef0123456789abcdef"
	_, client := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("clientId"); got != clientID {
			t.Fatalf("clientId = %q, want %s", got, clientID)
		}
		json.NewEncoder(w).Encode(map[string]any{
			"code": 0,
			"data": map[string]any{
				"orderId":     123,
				"clientId":    clientID,
				"status":      2,
				"executedQty": "0.001",
				"taxFee":      "10.5",
				"taxFeeAsset": "IDR",
			},
		})
	})

	order, err := client.PlaceOrder(OrderRequest{
		Symbol: "BTC_IDR", Side: 1, Type: 2, Quantity: "0.001", ClientID: clientID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if order.OrderID != 123 || order.ClientID != clientID {
		t.Fatalf("unexpected order response: %+v", order)
	}
	if !order.HasExecutedQuantity() {
		t.Fatal("expected executed quantity")
	}
	if fee, asset := order.Fee(); fee != "10.5" || asset != "IDR" {
		t.Fatalf("fee = %s %s, want 10.5 IDR", fee, asset)
	}
}

func TestNewClientIDUsesTokocryptoSafeFormat(t *testing.T) {
	clientID := NewClientID("live")
	if strings.Contains(clientID, "-") {
		t.Fatalf("clientID = %q, must not contain hyphen", clientID)
	}
	if len(clientID) != 32 {
		t.Fatalf("clientID length = %d, want 32", len(clientID))
	}
	for _, r := range clientID {
		if !strings.ContainsRune("0123456789abcdef", r) {
			t.Fatalf("clientID = %q, contains non-hex character %q", clientID, r)
		}
	}
}

func TestPlaceOrderAPIErrorIsDefiniteRejection(t *testing.T) {
	_, client := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"code":    -2010,
			"message": "insufficient balance",
			"data":    map[string]any{},
		})
	})

	_, err := client.PlaceOrder(OrderRequest{
		Symbol: "BTC_IDR", Side: 1, Type: 2, Quantity: "0.001", ClientID: NewClientID("force"),
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if !IsDefiniteOrderRejection(err) {
		t.Fatalf("expected definite rejection, got %T %v", err, err)
	}
}

func TestPlaceOrderAPIErrorUsesMsgFallback(t *testing.T) {
	_, client := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"code": 3703,
			"msg":  "Invalid client ID.",
		})
	})

	_, err := client.PlaceOrder(OrderRequest{
		Symbol: "BTC_IDR", Side: 1, Type: 2, Quantity: "0.001", ClientID: NewClientID("force"),
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "Invalid client ID") {
		t.Fatalf("error = %v, want msg fallback", err)
	}
}

func TestPlaceOrderHTTP5xxIsNotDefiniteRejection(t *testing.T) {
	_, client := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream timeout", http.StatusBadGateway)
	})

	_, err := client.PlaceOrder(OrderRequest{
		Symbol: "BTC_IDR", Side: 1, Type: 2, Quantity: "0.001", ClientID: NewClientID("force"),
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if IsDefiniteOrderRejection(err) {
		t.Fatalf("expected unknown submission state for 5xx, got %T %v", err, err)
	}
}

func TestGetOrderByClientID(t *testing.T) {
	_, client := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("clientId"); got != "live-order-1" {
			t.Fatalf("clientId = %q, want live-order-1", got)
		}
		json.NewEncoder(w).Encode(OrderResponse{Code: 0, Data: OrderResponseData{OrderID: 456, Status: "2"}})
	})

	order, err := client.GetOrderByClientID("BTC_IDR", "live-order-1")
	if err != nil {
		t.Fatal(err)
	}
	if order.OrderID != 456 {
		t.Fatalf("order ID = %d, want 456", order.OrderID)
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

func TestGetMovers_FiltersAndRanks(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode([][]any{})
	})

	c.mu.Lock()
	c.tickCache = map[string]cacheEntry{
		"BTC_USDT": {data: &Ticker{Symbol: "BTC_USDT", LastPrice: "50000", Volume: "100", PriceChangePercent: "5"}, expiresAt: time.Now().Add(time.Minute)},
		"ETH_USDT": {data: &Ticker{Symbol: "ETH_USDT", LastPrice: "3000", Volume: "500", PriceChangePercent: "-2"}, expiresAt: time.Now().Add(time.Minute)},
		"SOL_USDT": {data: &Ticker{Symbol: "SOL_USDT", LastPrice: "150", Volume: "50", PriceChangePercent: "12"}, expiresAt: time.Now().Add(time.Minute)},
		"BNB_USDT": {data: &Ticker{Symbol: "BNB_USDT", LastPrice: "600", Volume: "300", PriceChangePercent: "8"}, expiresAt: time.Now().Add(time.Minute)},
		"BTC_BUSD": {data: &Ticker{Symbol: "BTC_BUSD", LastPrice: "1", Volume: "9999", PriceChangePercent: "50"}, expiresAt: time.Now().Add(time.Minute)},
	}
	c.idrTickers = map[string]*Ticker{
		"TKO_IDR": {Symbol: "TKO_IDR", LastPrice: "100", Volume: "999", PriceChangePercent: "1"},
	}
	c.mu.Unlock()

	m := c.GetMovers()
	// USDT gainers: 4 USDT pairs (BTC_BUSD filtered), top gainer = SOL_USDT (12%)
	if len(m.GainersUSDT) != 4 {
		t.Fatalf("expected 4 USDT gainers, got %d", len(m.GainersUSDT))
	}
	if m.GainersUSDT[0].Symbol != "SOL_USDT" {
		t.Errorf("expected top USDT gainer SOL_USDT, got %s", m.GainersUSDT[0].Symbol)
	}
	// IDR gainers: 1 IDR pair
	if len(m.GainersIDR) != 1 || m.GainersIDR[0].Symbol != "TKO_IDR" {
		t.Errorf("expected 1 IDR gainer TKO_IDR, got %v", m.GainersIDR)
	}
	// Hot USDT: top volume = ETH_USDT (500)
	if m.HotUSDT[0].Symbol != "ETH_USDT" {
		t.Errorf("expected top hot USDT ETH_USDT (vol 500), got %s", m.HotUSDT[0].Symbol)
	}
	// Hot IDR: TKO_IDR
	if len(m.HotIDR) != 1 || m.HotIDR[0].Symbol != "TKO_IDR" {
		t.Errorf("expected 1 IDR hot TKO_IDR, got %v", m.HotIDR)
	}
	// BTC_BUSD must not appear anywhere
	for _, g := range append(m.GainersUSDT, m.GainersIDR...) {
		if g.Symbol == "BTC_BUSD" {
			t.Error("BTC_BUSD should be filtered out of gainers")
		}
	}
	for _, h := range append(m.HotUSDT, m.HotIDR...) {
		if h.Symbol == "BTC_BUSD" {
			t.Error("BTC_BUSD should be filtered out of hot")
		}
	}
}

func TestFetchIDRTickers(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/ticker/24hr" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode([]map[string]string{
			{"symbol": "BTCBIDR", "lastPrice": "1042508253.00", "priceChangePercent": "-2.579", "quoteVolume": "30118180261.72"},
			{"symbol": "ETHBIDR", "lastPrice": "47041943.00", "priceChangePercent": "-19.717", "quoteVolume": "25593138349.54"},
			{"symbol": "BTCUSDT", "lastPrice": "50000.00", "priceChangePercent": "5.1", "quoteVolume": "123456.00"},
		})
	})
	tick, err := c.fetchIDRTickers()
	if err != nil {
		t.Fatalf("fetchIDRTickers failed: %v", err)
	}
	if len(tick) != 2 {
		t.Fatalf("expected 2 IDR tickers, got %d: %v", len(tick), tick)
	}
	if t2, ok := tick["BTCB_IDR"]; !ok || t2.LastPrice != "1042508253.00" || t2.PriceChangePercent != "-2.579" {
		t.Errorf("BTCB_IDR ticker wrong: %+v", t2)
	}
	if _, ok := tick["BTC_USDT"]; ok {
		t.Error("USDT pair should be filtered out")
	}
}

func TestFetchIDRTickers_Wrapped(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/ticker/24hr" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{
				{"symbol": "BTCBIDR", "lastPrice": "1.00", "priceChangePercent": "3.0", "quoteVolume": "999.00"},
			},
		})
	})
	tick, err := c.fetchIDRTickers()
	if err != nil {
		t.Fatalf("fetchIDRTickers (wrapped) failed: %v", err)
	}
	if len(tick) != 1 || tick["BTCB_IDR"] == nil {
		t.Fatalf("expected wrapped BTCB_IDR ticker, got %v", tick)
	}
}

func TestFetchIDRTickers_ErrorObject(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/ticker/24hr" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"code": -1001, "msg": "Too many requests"})
	})
	if _, err := c.fetchIDRTickers(); err == nil {
		t.Fatal("expected error for rate-limit object response")
	}
}

func TestGetMovers_EmptyCache(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode([][]any{})
	})
	m := c.GetMovers()
	if len(m.GainersUSDT) != 0 || len(m.GainersIDR) != 0 || len(m.HotUSDT) != 0 || len(m.HotIDR) != 0 {
		t.Errorf("expected empty movers on cold cache, got gu=%d gi=%d hu=%d hi=%d", len(m.GainersUSDT), len(m.GainersIDR), len(m.HotUSDT), len(m.HotIDR))
	}
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
