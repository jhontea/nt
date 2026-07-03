package tokocrypto

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const baseURL = "https://www.tokocrypto.com"

type Client struct {
	apiKey    string
	secretKey string
	http      *http.Client
}

func NewClient(apiKey, secretKey string) *Client {
	return &Client{
		apiKey:    apiKey,
		secretKey: secretKey,
		http:      &http.Client{Timeout: 10 * time.Second},
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
	params := url.Values{"symbol": {symbol}}
	body, err := c.doPublic("/open/v1/market/ticker", params)
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
}

func (c *Client) PlaceOrder(req OrderRequest) (*OrderResponseData, error) {
	params := url.Values{
		"symbol":   {req.Symbol},
		"side":     {strconv.Itoa(req.Side)},
		"type":     {strconv.Itoa(req.Type)},
		"quantity": {req.Quantity},
		"price":    {req.Price},
	}
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
}
