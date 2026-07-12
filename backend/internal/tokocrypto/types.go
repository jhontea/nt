package tokocrypto

import (
	"encoding/json"
	"math/big"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// OrderResponseData captures fields callers use.
// ponytail: status/symbolType/side/type can be int on success or string "ERROR"
// on failure — use json.Number which accepts both.
type OrderResponseData struct {
	OrderID          int64       `json:"orderId"`
	ClientID         string      `json:"clientId"`
	ExecutedQty      string      `json:"executedQty"`
	ExecutedPrice    string      `json:"executedPrice"`
	ExecutedQuoteQty string      `json:"executedQuoteQty"`
	TaxFee           string      `json:"taxFee"`
	TaxFeeAsset      string      `json:"taxFeeAsset"`
	Status           json.Number `json:"status"`
}

func (o *OrderResponseData) StatusInt() int {
	v, _ := strconv.ParseInt(o.Status.String(), 10, 64)
	return int(v)
}

func (o *OrderResponseData) Fee() (string, string) {
	fee := o.TaxFee
	if fee == "" {
		fee = "0"
	}
	return fee, o.TaxFeeAsset
}

func (o *OrderResponseData) HasExecutedQuantity() bool {
	if o == nil || o.ExecutedQty == "" {
		return false
	}
	qty, ok := new(big.Rat).SetString(o.ExecutedQty)
	return ok && qty.Sign() > 0
}

func NewClientID(_ string) string {
	return strings.ReplaceAll(uuid.NewString(), "-", "")
}

func ExchangeOrderStatus(status int) string {
	switch status {
	case -2:
		return "processing"
	case 0:
		return "new"
	case 1:
		return "partial"
	case 2:
		return "filled"
	case 3:
		return "canceled"
	case 4:
		return "pending_cancel"
	case 5:
		return "rejected"
	case 6:
		return "expired"
	default:
		return "unknown"
	}
}

type OrderResponse struct {
	Code    int               `json:"code"`
	Message string            `json:"message"`
	Data    OrderResponseData `json:"data"`
}

type TickerResponse struct {
	Code    int    `json:"code"`
	Message string `json:"msg"`
	Data    Ticker `json:"data"`
}

type Ticker struct {
	Symbol             string `json:"symbol"`
	LastPrice          string `json:"lastPrice"`
	Volume             string `json:"volume"`
	PriceChange        string `json:"priceChange"`
	PriceChangePercent string `json:"priceChangePercent"`
	High24h            string `json:"high24h"`
	Low24h             string `json:"low24h"`
}

type CandleResponse struct {
	Code    int        `json:"code"`
	Message string     `json:"msg"`
	Data    CandleData `json:"data"`
}

type CandleData struct {
	List [][]any `json:"list"`
}

type OrderRequest struct {
	Symbol        string
	Side          int // 0=buy, 1=sell
	Type          int // 1=limit, 2=market
	Quantity      string
	QuoteOrderQty string
	Price         string
	ClientID      string
}

type AccountResponse struct {
	Code    int     `json:"code"`
	Message string  `json:"msg"`
	Data    Account `json:"data"`
}

type Account struct {
	MakerCommission string         `json:"makerCommission"`
	TakerCommission string         `json:"takerCommission"`
	CanTrade        int            `json:"canTrade"`
	AccountAssets   []AccountAsset `json:"accountAssets"`
}

type AccountAsset struct {
	Asset  string `json:"asset"`
	Free   string `json:"free"`
	Locked string `json:"locked"`
}

type SymbolsResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"msg"`
	Data    SymbolsData `json:"data"`
}

type SymbolsData struct {
	List []SymbolInfo `json:"list"`
}

type SymbolInfo struct {
	Symbol         string         `json:"symbol"`
	BaseAsset      string         `json:"baseAsset"`
	BasePrecision  int            `json:"basePrecision"`
	QuoteAsset     string         `json:"quoteAsset"`
	QuotePrecision int            `json:"quotePrecision"`
	Filters        []SymbolFilter `json:"filters"`
}

type SymbolFilter struct {
	FilterType    string `json:"filterType"`
	MinQty        string `json:"minQty"`
	MaxQty        string `json:"maxQty"`
	StepSize      string `json:"stepSize"`
	MinNotional   string `json:"minNotional"`
	MaxNotional   string `json:"maxNotional"`
	ApplyToMarket bool   `json:"applyToMarket"`
}
