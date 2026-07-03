package engine

import (
	"database/sql"
	"fmt"
	"log"
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
	price := ticker.LastPrice
	qty := signal.Quantity

	switch signal.Side {
	case "buy":
		return p.executeBuy(session, price, qty)
	case "sell":
		return p.executeSell(session, price, qty)
	}
	return nil
}

func (p *PaperEngine) executeBuy(session model.Session, price, qty string) error {
	cost, _ := strconv.ParseFloat(price, 64)
	qtyF, _ := strconv.ParseFloat(qty, 64)
	notional := cost * qtyF

	// Skip if already have an open buy at this price
	var existing int
	p.db.Get(&existing, "SELECT COUNT(*) FROM orders WHERE session_id=? AND symbol=? AND side='buy' AND status='filled' AND price=?",
		session.ID, session.Symbol, price)
	if existing > 0 {
		log.Printf("paper: buy at %s already open for %s, skipping", price, session.Symbol)
		return nil
	}

	balance, err := p.getBalance(session.ID)
	if err != nil {
		return err
	}
	if balance < notional {
		log.Printf("paper: insufficient balance %.8f < %.8f for buy", balance, notional)
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
		session.Symbol, "buy", price, qty, qty, price,
	)
	if err != nil {
		return fmt.Errorf("save buy order: %w", err)
	}

	log.Printf("paper: BUY %s %s @ %s (balance: %.8f -> %.8f)", session.Symbol, qty, price, balance, newBalance)
	return nil
}

func (p *PaperEngine) executeSell(session model.Session, price, qty string) error {
	qtyF, _ := strconv.ParseFloat(qty, 64)

	var buyOrder model.Order
	err := p.db.Get(&buyOrder,
		`SELECT * FROM orders WHERE session_id = ? AND symbol = ? AND side = 'buy' AND status = 'filled'
		 ORDER BY id ASC LIMIT 1`,
		session.ID, session.Symbol,
	)
	if err != nil {
		log.Printf("paper: no open buy to match for sell: %v", err)
		return nil
	}

	buyPrice, _ := strconv.ParseFloat(buyOrder.Price, 64)
	sellPrice, _ := strconv.ParseFloat(price, 64)

	pnl := (sellPrice - buyPrice) * qtyF
	pnlStr := strconv.FormatFloat(math.Round(pnl*1e8)/1e8, 'f', 8, 64)

	proceeds := sellPrice * qtyF
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
		session.Symbol, "sell", price, qty, qty, price,
	)
	if err != nil {
		return fmt.Errorf("save sell order: %w", err)
	}

	_, err = p.db.Exec(
		`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, pnl, traded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		session.ID, buyOrder.OrderID, session.Symbol, "sell", price, qty, pnlStr,
	)
	if err != nil {
		return fmt.Errorf("save trade: %w", err)
	}

	log.Printf("paper: SELL %s %s @ %s PnL=%s (balance: %.8f -> %.8f)",
		session.Symbol, qty, price, pnlStr, balance-proceeds, balance+proceeds)
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
