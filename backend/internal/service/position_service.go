package service

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/jmoiron/sqlx"
)

type SessionPosition struct {
	BoughtQty string
	SoldQty   string
	NetQty    string
}

type PositionService struct {
	db *sqlx.DB
}

func NewPositionService(db *sqlx.DB) *PositionService {
	return &PositionService{db: db}
}

// GetSessionPosition derives ownership from executed exchange quantities. Both
// filled and partial orders contribute; legacy closed buys remain in the ledger
// and are offset by their corresponding sell orders.
func (s *PositionService) GetSessionPosition(ctx context.Context, sessionID int64, symbol string) (SessionPosition, error) {
	if s == nil || s.db == nil {
		return SessionPosition{}, fmt.Errorf("position database is not available")
	}
	type row struct {
		Side        string `db:"side"`
		ExecutedQty string `db:"executed_qty"`
	}
	var rows []row
	err := s.db.SelectContext(ctx, &rows, s.db.Rebind(`
		SELECT side, executed_qty
		FROM orders
		WHERE session_id = ? AND symbol = ?
		  AND side IN ('buy', 'sell')
		  AND status IN ('filled', 'partial', 'closed', 'canceled', 'rejected', 'expired')`), sessionID, symbol)
	if err != nil {
		return SessionPosition{}, fmt.Errorf("get session position: %w", err)
	}

	bought := new(big.Rat)
	sold := new(big.Rat)
	precision := 0
	for _, order := range rows {
		qty, ok := new(big.Rat).SetString(order.ExecutedQty)
		if !ok || qty.Sign() < 0 {
			return SessionPosition{}, fmt.Errorf("invalid executed_qty %q in %s order", order.ExecutedQty, order.Side)
		}
		if places := decimalPlaces(order.ExecutedQty); places > precision {
			precision = places
		}
		if order.Side == "buy" {
			bought.Add(bought, qty)
		} else {
			sold.Add(sold, qty)
		}
	}

	net := new(big.Rat).Sub(new(big.Rat).Set(bought), sold)
	if net.Sign() < 0 {
		net.SetInt64(0)
	}
	return SessionPosition{
		BoughtQty: formatDecimalRat(bought, precision),
		SoldQty:   formatDecimalRat(sold, precision),
		NetQty:    formatDecimalRat(net, precision),
	}, nil
}

// MinDecimalString returns the smaller non-negative decimal without converting
// exchange quantities through float64.
func MinDecimalString(left, right string) (string, error) {
	a, ok := new(big.Rat).SetString(left)
	if !ok || a.Sign() < 0 {
		return "", fmt.Errorf("invalid decimal %q", left)
	}
	b, ok := new(big.Rat).SetString(right)
	if !ok || b.Sign() < 0 {
		return "", fmt.Errorf("invalid decimal %q", right)
	}
	if a.Cmp(b) > 0 {
		a = b
	}
	precision := decimalPlaces(left)
	if places := decimalPlaces(right); places > precision {
		precision = places
	}
	return formatDecimalRat(a, precision), nil
}

func decimalPlaces(value string) int {
	dot := strings.IndexByte(value, '.')
	if dot < 0 {
		return 0
	}
	return len(strings.TrimRight(value[dot+1:], "0"))
}

func formatDecimalRat(value *big.Rat, precision int) string {
	formatted := value.FloatString(precision)
	if strings.Contains(formatted, ".") {
		formatted = strings.TrimRight(strings.TrimRight(formatted, "0"), ".")
	}
	if formatted == "" || formatted == "-0" {
		return "0"
	}
	return formatted
}
