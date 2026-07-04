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
	"sync"
	"time"
)

const baseURL = "https://www.tokocrypto.com"

type cacheEntry struct {
	data      *Ticker
	expiresAt time.Time
}

type Client struct {
	apiKey    string
	secretKey string
	http      *http.Client
	mu        sync.Mutex
	tickCache map[string]cacheEntry
}

func NewClient(apiKey, secretKey string) *Client {
	return &Client{
		apiKey:    apiKey,
		secretKey: secretKey,
		http:      &http.Client{Timeout: 10 * time.Second},
		tickCache: make(map[string]cacheEntry),
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

func (c *Client) GetTicker(symbol string) (*Ticker, error) {
	c.mu.Lock()
	if entry, ok := c.tickCache[symbol]; ok && time.Now().Before(entry.expiresAt) {
		c.mu.Unlock()
		return entry.data, nil
	}
	c.mu.Unlock()

	body, err := c.doPublic("/open/v1/market/ticker", url.Values{"symbol": {symbol}})
	if err != nil {
		return nil, err
	}
	var res TickerResponse
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	if res.Code != 0 {
		return nil, fmt.Errorf("tokocrypto error code %d: %s", res.Code, res.Message)
	}

	c.mu.Lock()
	c.tickCache[symbol] = cacheEntry{data: &res.Data, expiresAt: time.Now().Add(30 * time.Second)}
	c.mu.Unlock()

	return &res.Data, nil
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
