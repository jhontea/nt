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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const baseURL = "https://www.tokocrypto.com"
const siteURL = "https://www.tokocrypto.site"

type cacheEntry struct {
	data      *Ticker
	expiresAt time.Time
}

type Client struct {
	apiKey        string
	secretKey     string
	http          *http.Client
	mu            sync.Mutex
	tickCache     map[string]cacheEntry
	idrMu         sync.Mutex
	idrTickers    map[string]*Ticker
	streamStarted bool
}

func NewClient(apiKey, secretKey string) *Client {
	c := &Client{
		apiKey:    apiKey,
		secretKey: secretKey,
		http:      &http.Client{Timeout: 10 * time.Second},
		tickCache: make(map[string]cacheEntry),
	}
	go c.runAllMiniTickerStream()
	go c.runIDRRefresh()
	return c
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

// doPublicWithKey is like doPublic but sends the API key header. Some
// public market endpoints (e.g. ticker/24hr) are gated behind a valid
// API key even without a signed payload.
func (c *Client) doPublicWithKey(path string, params url.Values) ([]byte, error) {
	// ponytail: market-data endpoints like ticker/24hr live on the
	// .site host, not the .com baseURL.
	u := siteURL + path
	if params != nil && len(params) > 0 {
		u += "?" + params.Encode()
	}
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	if c.apiKey != "" {
		req.Header.Set("X-MBX-APIKEY", c.apiKey)
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

func wsSymbolToInternal(sym string) string {
	if strings.HasSuffix(sym, "USDT") {
		return sym[:len(sym)-4] + "_USDT"
	}
	if strings.HasSuffix(sym, "IDR") {
		return sym[:len(sym)-3] + "_IDR"
	}
	return ""
}

func (c *Client) runAllMiniTickerStream() {
	u := "wss://stream-cloud.tokocrypto.site/stream?streams=!miniTicker@arr"
	dialer := &websocket.Dialer{HandshakeTimeout: 5 * time.Second}

	for {
		ws, _, err := dialer.Dial(u, nil)
		if err != nil {
			slog.Warn("ticker ws dial failed, retry in 5s", "error", err)
			time.Sleep(5 * time.Second)
			continue
		}
		slog.Info("ticker ws connected")

		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				slog.Warn("ticker ws read error", "error", err)
				ws.Close()
				break
			}

			var wrap struct {
				Data []struct {
					Symbol string `json:"s"`
					Close  string `json:"c"`
					Open   string `json:"o"`
					High   string `json:"h"`
					Low    string `json:"l"`
					Vol    string `json:"v"`
				} `json:"data"`
			}
			if err := json.Unmarshal(msg, &wrap); err != nil {
				continue
			}

			for _, raw := range wrap.Data {
				symbol := wsSymbolToInternal(raw.Symbol)
				if symbol == "" {
					continue
				}
				priceChange := parseFloat(raw.Close) - parseFloat(raw.Open)
				var pct string
				if open := parseFloat(raw.Open); open != 0 {
					pct = strconv.FormatFloat((priceChange/open)*100, 'f', 2, 64)
				} else {
					pct = "0"
				}
				ticker := &Ticker{
					Symbol:             symbol,
					LastPrice:          raw.Close,
					Volume:             raw.Vol,
					PriceChange:        strconv.FormatFloat(priceChange, 'f', 8, 64),
					PriceChangePercent: pct,
					High24h:            raw.High,
					Low24h:             raw.Low,
				}

				c.mu.Lock()
				c.tickCache[symbol] = cacheEntry{data: ticker, expiresAt: time.Now().Add(3 * time.Second)}
				c.mu.Unlock()
			}
		}
		time.Sleep(3 * time.Second)
	}
}

func (c *Client) GetTicker(symbol string) (*Ticker, error) {
	// Check WS cache (updated by WS in real-time)
	c.mu.Lock()
	if entry, ok := c.tickCache[symbol]; ok && time.Now().Before(entry.expiresAt) {
		c.mu.Unlock()
		return entry.data, nil
	}
	c.mu.Unlock()

	// For IDR pairs: check idrTickers cache before hitting klines endpoint
	if strings.HasSuffix(symbol, "_IDR") {
		c.idrMu.Lock()
		if t, ok := c.idrTickers[symbol]; ok && t != nil {
			c.idrMu.Unlock()
			return t, nil
		}
		c.idrMu.Unlock()
	}

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
	var pct string
	if open := parseFloat(open); open != 0 {
		pct = strconv.FormatFloat((priceChange/open)*100, 'f', 2, 64)
	} else {
		pct = "0"
	}
	ticker := &Ticker{
		Symbol:             symbol,
		LastPrice:          close_,
		Volume:             volume,
		PriceChange:        strconv.FormatFloat(priceChange, 'f', 8, 64),
		PriceChangePercent: pct,
		High24h:            high,
		Low24h:             low,
	}

	c.mu.Lock()
	c.tickCache[symbol] = cacheEntry{data: ticker, expiresAt: time.Now().Add(10 * time.Second)}
	c.mu.Unlock()

	return ticker, nil
}

type Mover struct {
	Symbol             string `json:"symbol"`
	LastPrice          string `json:"lastPrice"`
	PriceChangePercent string `json:"priceChangePercent"`
	Volume             string `json:"volume"`
}

type Movers struct {
	GainersUSDT []Mover `json:"gainersUsdt"`
	GainersIDR  []Mover `json:"gainersIdr"`
	HotUSDT     []Mover `json:"hotUsdt"`
	HotIDR      []Mover `json:"hotIdr"`
}

// GetMovers derives top gainers (by % change) and hot pairs (by volume) from
// the live WS cache (USDT) and the IDR ticker refresh. Returns empty slices
// if there is no data.
func (c *Client) GetMovers() Movers {
	c.mu.Lock()
	var usdt []Mover
	for sym, entry := range c.tickCache {
		if !strings.HasSuffix(sym, "_USDT") {
			continue
		}
		t := entry.data
		if t == nil {
			continue
		}
		usdt = append(usdt, Mover{
			Symbol:             t.Symbol,
			LastPrice:          t.LastPrice,
			PriceChangePercent: t.PriceChangePercent,
			Volume:             t.Volume,
		})
	}
	c.mu.Unlock()

	c.idrMu.Lock()
	var idr []Mover
	for _, t := range c.idrTickers {
		if t == nil {
			continue
		}
		idr = append(idr, Mover{
			Symbol:             t.Symbol,
			LastPrice:          t.LastPrice,
			PriceChangePercent: t.PriceChangePercent,
			Volume:             t.Volume,
		})
	}
	c.idrMu.Unlock()

	top5 := func(src []Mover, byPct bool) []Mover {
		out := append([]Mover{}, src...)
		if byPct {
			sort.SliceStable(out, func(i, j int) bool {
				return parseFloat(out[i].PriceChangePercent) > parseFloat(out[j].PriceChangePercent)
			})
		} else {
			sort.SliceStable(out, func(i, j int) bool {
				return parseFloat(out[i].Volume) > parseFloat(out[j].Volume)
			})
		}
		if len(out) > 5 {
			out = out[:5]
		}
		return out
	}

	return Movers{
		GainersUSDT: top5(usdt, true),
		GainersIDR:  top5(idr, true),
		HotUSDT:     top5(usdt, false),
		HotIDR:      top5(idr, false),
	}
}

type idrTicker struct {
	Symbol             string `json:"symbol"`
	LastPrice          string `json:"lastPrice"`
	PriceChangePercent string `json:"priceChangePercent"`
	QuoteVolume        string `json:"quoteVolume"`
}

// fetchIDRTickers returns 24h tickers for all IDR pairs in ONE call to the
// public ticker/24hr endpoint (covers both USDT and IDR markets), instead
// of one klines call per pair.
func (c *Client) fetchIDRTickers() (map[string]*Ticker, error) {
	body, err := c.doPublicWithKey("/api/v3/ticker/24hr", nil)
	if err != nil {
		return nil, err
	}
	var raw []idrTicker
	if err := json.Unmarshal(body, &raw); err != nil {
		// Some responses wrap the array, e.g. {"data":[...]} or {"ticker":[...]},
		// or return an error object {"code":..,"msg":..} on rate-limit.
		var wrapped struct {
			Data   []idrTicker `json:"data"`
			Ticker []idrTicker `json:"ticker"`
		}
		if e2 := json.Unmarshal(body, &wrapped); e2 != nil {
			return nil, fmt.Errorf("decode ticker/24hr: %w", err)
		}
		raw = append(wrapped.Data, wrapped.Ticker...)
		if len(raw) == 0 {
			return nil, fmt.Errorf("ticker/24hr returned no rows (likely rate-limited): %s", string(body)[:min(len(body), 200)])
		}
	}
	out := make(map[string]*Ticker)
	for _, r := range raw {
		sym := wsSymbolToInternal(r.Symbol)
		if !strings.HasSuffix(sym, "_IDR") {
			continue
		}
		out[sym] = &Ticker{
			Symbol:              sym,
			LastPrice:           r.LastPrice,
			PriceChangePercent:  r.PriceChangePercent,
			Volume:              r.QuoteVolume,
		}
	}
	return out, nil
}

// runIDRRefresh keeps idrTickers populated since the mini-ticker WS only
// reliably covers USDT pairs. One 24hr call per cycle — cheap enough that
// a 120s interval leaves ample rate-limit headroom.
func (c *Client) runIDRRefresh() {
	c.refreshIDRTickers()
	ticker := time.NewTicker(120 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		c.refreshIDRTickers()
	}
}

func (c *Client) refreshIDRTickers() {
	tick, err := c.fetchIDRTickers()
	if err != nil {
		slog.Warn("idr tickers fetch failed", "error", err)
		return
	}
	c.idrMu.Lock()
	c.idrTickers = tick
	c.idrMu.Unlock()
}

func (c *Client) getKlinesAlt(symbol, interval string, limit int) ([][]any, error) {
	u := "https://www.tokocrypto.site/api/v3/klines?" + url.Values{
		"symbol":   {strings.ReplaceAll(symbol, "_", "")},
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
	// ponytail: fallback to alt endpoint if primary returns empty list
	if len(res.Data.List) == 0 {
		return c.getKlinesAlt(symbol, interval, limit)
	}
	return res.Data.List, nil
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

// GetOrder fetches a single order by ID from the exchange — used for reconciliation.
func (c *Client) GetOrder(symbol string, orderID int64) (*OrderResponseData, error) {
	return retryCall(func() (*OrderResponseData, error) {
		params := url.Values{
			"symbol":  {symbol},
			"orderId": {strconv.FormatInt(orderID, 10)},
		}
		body, err := c.doSigned("GET", "/open/v1/orders/detail", params)
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
		if req.Price != "" {
			params["price"] = []string{req.Price}
		}
	}
	// ponytail: no retry on PlaceOrder — retrying a timed-out order risks placing duplicates.
	// Caller must handle the error and decide whether to retry via reconciliation.
	body, err := c.doSigned("POST", "/open/v1/orders", params)
	if err != nil {
		return nil, err
	}
	// Parse envelope first — error responses have a different data shape
	var envelope struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		slog.Error("PlaceOrder unmarshal failed", "body", string(body), "error", err)
		return nil, err
	}
	if envelope.Code != 0 {
		slog.Error("PlaceOrder API error", "code", envelope.Code, "message", envelope.Message, "body", string(body))
		return nil, fmt.Errorf("tokocrypto error code %d: %s", envelope.Code, envelope.Message)
	}
	var data OrderResponseData
	if err := json.Unmarshal(envelope.Data, &data); err != nil {
		slog.Error("PlaceOrder data unmarshal failed", "data", string(envelope.Data), "error", err)
		return nil, err
	}
	return &data, nil
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
