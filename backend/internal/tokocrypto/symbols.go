package tokocrypto

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

const symbolCacheTTL = 12 * time.Hour

var ErrQuantityBelowMinimum = errors.New("quantity below exchange minimum")

// GetSymbolInfo returns current exchange filters for a symbol. The full symbol
// list is cached because Tokocrypto exposes all symbol rules through one endpoint.
func (c *Client) GetSymbolInfo(symbol string) (*SymbolInfo, error) {
	c.symbolMu.Lock()
	if info, ok := c.symbols[symbol]; ok && time.Now().Before(c.symbolsExpiry) {
		c.symbolMu.Unlock()
		copy := info
		return &copy, nil
	}
	c.symbolMu.Unlock()

	body, err := c.doPublic("/open/v1/common/symbols", nil)
	if err != nil {
		return nil, fmt.Errorf("get symbol metadata: %w", err)
	}
	var response SymbolsResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("decode symbol metadata: %w", err)
	}
	if response.Code != 0 {
		return nil, fmt.Errorf("tokocrypto error code %d: %s", response.Code, response.Message)
	}

	symbols := make(map[string]SymbolInfo, len(response.Data.List))
	for _, info := range response.Data.List {
		symbols[info.Symbol] = info
	}

	c.symbolMu.Lock()
	c.symbols = symbols
	c.symbolsExpiry = time.Now().Add(symbolCacheTTL)
	info, ok := c.symbols[symbol]
	c.symbolMu.Unlock()
	if !ok {
		return nil, fmt.Errorf("symbol %s not found in Tokocrypto metadata", symbol)
	}
	return &info, nil
}

// NormalizeMarketQuantity floors qty to the exchange's market step size and
// validates its minimum and maximum quantity limits.
func (c *Client) NormalizeMarketQuantity(symbol, qty string) (string, error) {
	info, err := c.GetSymbolInfo(symbol)
	if err != nil {
		return "", err
	}
	return normalizeMarketQuantity(*info, qty)
}

func normalizeMarketQuantity(info SymbolInfo, qty string) (string, error) {
	filter, ok := findQuantityFilter(info.Filters, "MARKET_LOT_SIZE")
	if !ok || isZeroDecimal(filter.StepSize) {
		filter, ok = findQuantityFilter(info.Filters, "LOT_SIZE")
	}
	if !ok || isZeroDecimal(filter.StepSize) {
		return "", fmt.Errorf("symbol %s has no usable market quantity filter", info.Symbol)
	}

	quantity, err := parseDecimalRat(qty)
	if err != nil || quantity.Sign() <= 0 {
		return "", fmt.Errorf("invalid quantity %q", qty)
	}
	step, err := parseDecimalRat(filter.StepSize)
	if err != nil || step.Sign() <= 0 {
		return "", fmt.Errorf("invalid stepSize %q for %s", filter.StepSize, info.Symbol)
	}

	min := new(big.Rat)
	if !isZeroDecimal(filter.MinQty) {
		min, err = parseDecimalRat(filter.MinQty)
		if err != nil {
			return "", fmt.Errorf("invalid minQty %q for %s", filter.MinQty, info.Symbol)
		}
	}
	if quantity.Cmp(min) < 0 {
		return "", fmt.Errorf("%w: quantity %s is below minQty %s for %s", ErrQuantityBelowMinimum, qty, filter.MinQty, info.Symbol)
	}

	delta := new(big.Rat).Sub(quantity, min)
	stepCountRat := new(big.Rat).Quo(delta, step)
	stepCount := new(big.Int).Quo(stepCountRat.Num(), stepCountRat.Denom())
	normalized := new(big.Rat).Add(min, new(big.Rat).Mul(new(big.Rat).SetInt(stepCount), step))

	if !isZeroDecimal(filter.MaxQty) {
		max, parseErr := parseDecimalRat(filter.MaxQty)
		if parseErr != nil {
			return "", fmt.Errorf("invalid maxQty %q for %s", filter.MaxQty, info.Symbol)
		}
		if normalized.Cmp(max) > 0 {
			return "", fmt.Errorf("quantity %s is above maxQty %s for %s", qty, filter.MaxQty, info.Symbol)
		}
	}

	precision := decimalPlaces(filter.StepSize)
	if minPrecision := decimalPlaces(filter.MinQty); minPrecision > precision {
		precision = minPrecision
	}
	return normalized.FloatString(precision), nil
}

func findQuantityFilter(filters []SymbolFilter, filterType string) (SymbolFilter, bool) {
	for _, filter := range filters {
		if filter.FilterType == filterType {
			return filter, true
		}
	}
	return SymbolFilter{}, false
}

func parseDecimalRat(value string) (*big.Rat, error) {
	result, ok := new(big.Rat).SetString(value)
	if !ok {
		return nil, fmt.Errorf("invalid decimal %q", value)
	}
	return result, nil
}

func isZeroDecimal(value string) bool {
	if value == "" {
		return true
	}
	parsed, err := parseDecimalRat(value)
	return err != nil || parsed.Sign() == 0
}

func decimalPlaces(value string) int {
	value = strings.TrimSpace(value)
	dot := strings.IndexByte(value, '.')
	if dot < 0 {
		return 0
	}
	fraction := strings.TrimRight(value[dot+1:], "0")
	return len(fraction)
}
