package tokocrypto

import "strconv"

type TickerResponse struct {
	Code    int    `json:"code"`
	Message string `json:"msg"`
	Data    Ticker `json:"data"`
}

type Ticker struct {
	Symbol              string `json:"symbol"`
	LastPrice           string `json:"lastPrice"`
	Volume              string `json:"volume"`
	PriceChange         string `json:"priceChange"`
	PriceChangePercent  string `json:"priceChangePercent"`
	High24h             string `json:"high24h"`
	Low24h              string `json:"low24h"`
}

type CandleResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"msg"`
	Data    CandleData  `json:"data"`
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
}

type OrderResponseData struct {
	OrderID          int64             `json:"orderId"`
	ClientID         string            `json:"clientId"`
	Symbol           string            `json:"symbol"`
	SymbolType       int               `json:"symbolType"`
	Side             int               `json:"side"`
	Type             string            `json:"type"`
	Price            string            `json:"price"`
	OrigQty          string            `json:"origQty"`
	OrigQuoteQty     string            `json:"origQuoteQty"`
	ExecutedQty      string            `json:"executedQty"`
	ExecutedPrice    string            `json:"executedPrice"`
	ExecutedQuoteQty string            `json:"executedQuoteQty"`
	Status           string            `json:"status"`
	CreateTime       int64             `json:"createTime"`
}

func (o *OrderResponseData) StatusInt() int {
	v, _ := strconv.ParseInt(o.Status, 10, 64)
	return int(v)
}

type OrderResponse struct {
	Code    int               `json:"code"`
	Message string            `json:"message"`
	Data    OrderResponseData `json:"data"`
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
