package engine

import (
	"database/sql"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

type PaperEngine struct {
	db     *sqlx.DB
	client *tokocrypto.Client
	mu     sync.Mutex
}

func NewPaperEngine(db *sqlx.DB, client *tokocrypto.Client) *PaperEngine {
	return &PaperEngine{db: db, client: client}
}

func (p *PaperEngine) Execute(session model.Session, signal Signal) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	ticker, err := p.client.GetTicker(session.Symbol)
	if err != nil {
		return fmt.Errorf("fetch ticker: %w", err)
	}
	marketPrice := ticker.LastPrice
	qty := signal.Quantity

	switch signal.Side {
	case string(model.SideBuy):
		return p.executeBuy(session, marketPrice, qty)
	case string(model.SideSell):
		return p.executeSell(session, signal.Price, marketPrice, qty)
	}
	return nil
}

func (p *PaperEngine) executeBuy(session model.Session, price, qty string) error {
	cost, _ := strconv.ParseFloat(price, 64)
	qtyF, _ := strconv.ParseFloat(qty, 64)
	notional := cost * qtyF

	// Skip if already have an open buy at this price
	var existing int
	if err := p.db.Get(&existing, "SELECT COUNT(*) FROM orders WHERE session_id=? AND symbol=? AND side='buy' AND status='filled' AND price=?",
		session.ID, session.Symbol, price); err != nil {
		slog.Warn("check existing buys", "session", session.ID, "error", err)
	}
	if existing > 0 {
		slog.Debug("buy already open, skip", "session", session.ID, "price", price)
		return nil
	}

	balance, err := p.getBalance(session.ID)
	if err != nil {
		return err
	}
	if balance < notional {
		slog.Warn("insufficient paper balance", "session", session.ID, "balance", balance, "needed", notional)
		return nil
	}

	newBalance := balance - notional
	if err := p.setBalance(session.ID, newBalance); err != nil {
		return err
	}

	_, err = p.db.Exec(
		`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`,
		session.ID, fmt.Sprintf("paper_buy_%d", time.Now().UnixNano()),
		session.Symbol, string(model.SideBuy), price, qty, qty, price,
	)
	if err != nil {
		return fmt.Errorf("save buy order: %w", err)
	}

	slog.Info("paper buy", "session", session.ID, "symbol", session.Symbol, "qty", qty, "price", price, "balance", fmt.Sprintf("%.2f->%.2f", balance, newBalance))
	return nil
}

func (p *PaperEngine) executeSell(session model.Session, matchPrice, execPrice, qty string) error {

	var buyOrder model.Order
	err := p.db.Get(&buyOrder,
		`SELECT * FROM orders WHERE session_id = ? AND symbol = ? AND side = 'buy' AND status = 'filled' AND price = ?
		 ORDER BY id ASC LIMIT 1`,
		session.ID, session.Symbol, matchPrice,
	)
	if err != nil {
		slog.Warn("no open buy to match", "session", session.ID, "price", matchPrice, "error", err)
		return nil
	}

	buyPrice, _ := strconv.ParseFloat(buyOrder.Price, 64)
	sellPrice, _ := strconv.ParseFloat(execPrice, 64)
	qtyF, _ := strconv.ParseFloat(qty, 64)
	buyQtyF, _ := strconv.ParseFloat(buyOrder.Quantity, 64)
	useQty := qty
	useQtyF := qtyF
	if buyQtyF != qtyF {
		useQty = buyOrder.Quantity
		useQtyF = buyQtyF
	}

	pnl := (sellPrice - buyPrice) * useQtyF
	pnlStr := strconv.FormatFloat(math.Round(pnl*1e8)/1e8, 'f', 8, 64)

	proceeds := sellPrice * useQtyF
	balance, err := p.getBalance(session.ID)
	if err != nil {
		return fmt.Errorf("get balance: %w", err)
	}
	if err := p.setBalance(session.ID, balance+proceeds); err != nil {
		return fmt.Errorf("set balance: %w", err)
	}

	if _, err := p.db.Exec("UPDATE orders SET status = 'closed' WHERE id = ?", buyOrder.ID); err != nil {
		return fmt.Errorf("update buy order: %w", err)
	}

	_, err = p.db.Exec(
		`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`,
		session.ID, fmt.Sprintf("paper_sell_%d", time.Now().UnixNano()),
		session.Symbol, string(model.SideSell), execPrice, useQty, useQty, execPrice,
	)
	if err != nil {
		return fmt.Errorf("save sell order: %w", err)
	}

	_, err = p.db.Exec(
		`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, pnl, traded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		session.ID, buyOrder.OrderID, session.Symbol, string(model.SideSell), execPrice, useQty, pnlStr,
	)
	if err != nil {
		return fmt.Errorf("save trade: %w", err)
	}

	slog.Info("paper sell", "session", session.ID, "symbol", session.Symbol, "qty", useQty, "price", execPrice, "pnl", pnlStr, "balance", fmt.Sprintf("%.2f->%.2f", balance, balance+proceeds))
	return nil
}

func (p *PaperEngine) getBalance(sessionID int64) (float64, error) {
	var balance sql.NullFloat64
	err := p.db.Get(&balance, "SELECT virtual_balance FROM sessions WHERE id = ?", sessionID)
	if err != nil {
		return 0, err
	}
	if !balance.Valid {
		return 0, nil
	}
	return balance.Float64, nil
}

func (p *PaperEngine) setBalance(sessionID int64, balance float64) error {
	_, err := p.db.Exec("UPDATE sessions SET virtual_balance = ? WHERE id = ?",
		math.Round(balance*1e8)/1e8, sessionID)
	return err
}
