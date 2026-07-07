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

	// Use daily kline as ticker source (ticker REST endpoint was removed by TokoCrypto)
	// Convert BTC_USDT → BTCUSDT for tokocrypto.site API
	altSymbol := strings.ReplaceAll(symbol, "_", "")
	candles, err := c.getKlinesAlt(altSymbol, "1d", 1)
	if err != nil {
		return nil, fmt.Errorf("get ticker from klines: %w", err)
	}
	if len(candles) == 0 {
		return nil, fmt.Errorf("no kline data for %s", symbol)
	}

	// kline: [openTime, open, high, low, close, volume, closeTime, quoteVol, trades, takerBuyBase, takerBuyQuote, ignore]
	k := candles[0]
	open := fmt.Sprint(k[1])
	close_ := fmt.Sprint(k[4])
	volume := fmt.Sprint(k[5])
	priceChange := parseFloat(close_) - parseFloat(open)

	ticker := &Ticker{
		Symbol:      symbol,
		LastPrice:   close_,
		Volume:      volume,
		PriceChange: strconv.FormatFloat(priceChange, 'f', 8, 64),
	}

	c.mu.Lock()
	c.tickCache[symbol] = cacheEntry{data: ticker, expiresAt: time.Now().Add(30 * time.Second)}
	c.mu.Unlock()

	return ticker, nil
}

// getKlinesAlt fetches klines from the alternative tokocrypto.site API (type 1).
// Symbol must use no underscore (e.g. BTCUSDT not BTC_USDT).
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
