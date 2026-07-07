package tokocrypto

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const baseURL = "https://www.tokocrypto.com"

type cacheEntry struct {
	data      *Ticker
	expiresAt time.Time
}

type Client struct {
	apiKey      string
	secretKey   string
	http        *http.Client
	mu          sync.Mutex
	tickCache   map[string]cacheEntry
	wsStarted   map[string]bool
}

func NewClient(apiKey, secretKey string) *Client {
	return &Client{
		apiKey:    apiKey,
		secretKey: secretKey,
		http:      &http.Client{Timeout: 10 * time.Second},
		tickCache: make(map[string]cacheEntry),
		wsStarted: make(map[string]bool),
	}
}

func (c *Client) doPublic(path string, params url.Values) ([]byte, error) {
	u := baseURL + path
	if params != nil && len(params) > 0 {
		u += "?" + params.Encode()
	}
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("tokocrypto API error: %s %s", resp.Status, string(body))
	}
	return body, nil
}

func (c *Client) doSigned(method, path string, params url.Values) ([]byte, error) {
	if params == nil {
		params = url.Values{}
	}
	params.Set("timestamp", strconv.FormatInt(time.Now().UnixMilli(), 10))
	params.Set("recvWindow", "5000")

	qs := params.Encode()
	mac := hmac.New(sha256.New, []byte(c.secretKey))
	mac.Write([]byte(qs))
	signature := hex.EncodeToString(mac.Sum(nil))
	params.Set("signature", signature)

	u := baseURL + path + "?" + params.Encode()
	req, err := http.NewRequest(method, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-MBX-APIKEY", c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("tokocrypto signed API error: %s %s", resp.Status, string(body))
	}
	return body, nil
}

// SubscribeTicker starts a WebSocket stream for the given symbol (e.g. "BTC_USDT").
// Updates the cache in real-time (~1s updates). Idempotent — safe to call multiple times.
func (c *Client) SubscribeTicker(symbol string) {
	c.mu.Lock()
	if c.wsStarted[symbol] {
		c.mu.Unlock()
		return
	}
	c.wsStarted[symbol] = true
	c.mu.Unlock()

	go c.runTickerStream(symbol)
}

func (c *Client) runTickerStream(symbol string) {
	wsSymbol := strings.ToLower(strings.ReplaceAll(symbol, "_", ""))
	u := fmt.Sprintf("wss://stream-cloud.tokocrypto.site/stream/ws/%s@miniTicker", wsSymbol)
	dialer := &websocket.Dialer{HandshakeTimeout: 5 * time.Second}

	for {
		ws, _, err := dialer.Dial(u, nil)
		if err != nil {
			slog.Warn("ticker ws dial failed, retry in 5s", "symbol", symbol, "error", err)
			time.Sleep(5 * time.Second)
			continue
		}
		slog.Info("ticker ws connected", "symbol", symbol)

		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				slog.Warn("ticker ws read error", "symbol", symbol, "error", err)
				ws.Close()
				break
			}

			var raw struct {
				Close string `json:"c"`
				Open  string `json:"o"`
				High  string `json:"h"`
				Low   string `json:"l"`
				Vol   string `json:"v"`
				QVol  string `json:"q"`
			}
			if err := json.Unmarshal(msg, &raw); err != nil {
				continue
			}

			priceChange := parseFloat(raw.Close) - parseFloat(raw.Open)

			ticker := &Ticker{
				Symbol:      symbol,
				LastPrice:   raw.Close,
				Volume:      raw.Vol,
				PriceChange: strconv.FormatFloat(priceChange, 'f', 8, 64),
				High24h:     raw.High,
				Low24h:      raw.Low,
			}

			c.mu.Lock()
			c.tickCache[symbol] = cacheEntry{data: ticker, expiresAt: time.Now().Add(3 * time.Second)}
			c.mu.Unlock()
		}
		time.Sleep(3 * time.Second)
	}
}

func (c *Client) GetTicker(symbol string) (*Ticker, error) {
	// Start WS stream if not already running (idempotent)
	c.SubscribeTicker(symbol)

	// Check cache (updated by WS in real-time)
	c.mu.Lock()
	if entry, ok := c.tickCache[symbol]; ok && time.Now().Before(entry.expiresAt) {
		c.mu.Unlock()
		return entry.data, nil
	}
	c.mu.Unlock()

	// Fallback: fetch daily kline
	altSymbol := strings.ReplaceAll(symbol, "_", "")
	candles, err := c.getKlinesAlt(altSymbol, "1d", 1)
	if err != nil {
		return nil, fmt.Errorf("get ticker from klines: %w", err)
	}
	if len(candles) == 0 {
		return nil, fmt.Errorf("no kline data for %s", symbol)
	}

	k := candles[0]
	open := fmt.Sprint(k[1])
	close_ := fmt.Sprint(k[4])
	high := fmt.Sprint(k[2])
	low := fmt.Sprint(k[3])
	volume := fmt.Sprint(k[5])
	priceChange := parseFloat(close_) - parseFloat(open)

	ticker := &Ticker{
		Symbol:      symbol,
		LastPrice:   close_,
		Volume:      volume,
		PriceChange: strconv.FormatFloat(priceChange, 'f', 8, 64),
		High24h:     high,
		Low24h:      low,
	}

	c.mu.Lock()
	c.tickCache[symbol] = cacheEntry{data: ticker, expiresAt: time.Now().Add(10 * time.Second)}
	c.mu.Unlock()

	return ticker, nil
}

func (c *Client) getKlinesAlt(symbol, interval string, limit int) ([][]any, error) {
	u := "https://www.tokocrypto.site/api/v3/klines?" + url.Values{
		"symbol":   {symbol},
		"interval": {interval},
		"limit":    {strconv.Itoa(limit)},
	}.Encode()
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("tokocrypto.site API error: %s %s", resp.Status, string(body))
	}
	var data [][]any
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, err
	}
	return data, nil
}

func parseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

func (c *Client) GetCandles(symbol, interval string, limit int) ([][]any, error) {
	params := url.Values{
		"symbol":   {symbol},
		"interval": {interval},
		"limit":    {strconv.Itoa(limit)},
	}
	body, err := c.doPublic("/open/v1/market/klines", params)
	if err != nil {
		return nil, err
	}
	var res CandleResponse
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	if res.Code != 0 {
		return nil, fmt.Errorf("tokocrypto error code %d: %s", res.Code, res.Message)
	}
	return res.Data, nil
}

func (c *Client) GetAccount() (*Account, error) {
	return retryCall(func() (*Account, error) {
		body, err := c.doSigned("GET", "/open/v1/account/spot", nil)
		if err != nil {
			return nil, err
		}
		var res AccountResponse
		if err := json.Unmarshal(body, &res); err != nil {
			return nil, err
		}
		if res.Code != 0 {
			return nil, fmt.Errorf("tokocrypto error code %d: %s", res.Code, res.Message)
		}
		return &res.Data, nil
	})
}

func (c *Client) PlaceOrder(req OrderRequest) (*OrderResponseData, error) {
	params := url.Values{
		"symbol": {req.Symbol},
		"side":   {strconv.Itoa(req.Side)},
		"type":   {strconv.Itoa(req.Type)},
	}
	if req.Type == 2 && req.Side == 0 && req.QuoteOrderQty != "" {
		params["quoteOrderQty"] = []string{req.QuoteOrderQty}
	} else {
		params["quantity"] = []string{req.Quantity}
		params["price"] = []string{req.Price}
	}
	return retryCall(func() (*OrderResponseData, error) {
		body, err := c.doSigned("POST", "/open/v1/orders", params)
		if err != nil {
			return nil, err
		}
		var res OrderResponse
		if err := json.Unmarshal(body, &res); err != nil {
			return nil, err
		}
		if res.Code != 0 {
			return nil, fmt.Errorf("tokocrypto error code %d: %s", res.Code, res.Message)
		}
		return &res.Data, nil
	})
}

func retryCall[T any](fn func() (T, error)) (T, error) {
	var lastErr error
	for i := 0; i < 3; i++ {
		result, err := fn()
		if err == nil {
			return result, nil
		}
		lastErr = err
		slog.Warn("api retry", "attempt", i+1, "error", err)
		time.Sleep(time.Duration(i+1) * 500 * time.Millisecond)
	}
	var zero T
	return zero, fmt.Errorf("api failed after 3 retries: %w", lastErr)
}
