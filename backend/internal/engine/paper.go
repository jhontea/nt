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
	"github.com/user/nt/internal/service"
	"github.com/user/nt/internal/tokocrypto"
)

type PaperEngine struct {
	db       *sqlx.DB
	client   *tokocrypto.Client
	mu       sync.Mutex
	hub      *WSHub
	notifier *service.Notifier
}

func NewPaperEngine(db *sqlx.DB, client *tokocrypto.Client, hub *WSHub, notifier *service.Notifier) *PaperEngine {
	return &PaperEngine{db: db, client: client, hub: hub, notifier: notifier}
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
		return p.executeBuy(session, signal.Price, marketPrice, qty)
	case string(model.SideSell):
		return p.executeSell(session, signal.Price, marketPrice, qty)
	}
	return nil
}

func (p *PaperEngine) executeBuy(session model.Session, gridPrice, execPrice, qty string) error {
	cost, _ := strconv.ParseFloat(execPrice, 64)
	qtyF, _ := strconv.ParseFloat(qty, 64)
	notional := cost * qtyF

	var existing int
	if err := p.db.Get(&existing, p.db.Rebind("SELECT COUNT(*) FROM orders WHERE session_id=? AND symbol=? AND side='buy' AND status='filled' AND price=?"),
		session.ID, session.Symbol, gridPrice); err != nil {
		slog.Warn("check existing buys", "session", session.ID, "error", err)
	}
	if existing > 0 {
		slog.Debug("buy already open, skip", "session", session.ID, "price", gridPrice)
		return nil
	}

	balance, err := p.getBalance(session.ID)
	if err != nil {
		return err
	}
	if balance < notional {
		slog.Warn("insufficient paper balance", "session", session.ID, "balance", balance, "needed", notional)
		if p.hub != nil {
			p.hub.Broadcast(session.ID, WSPaperAlert{
				Type: "paper_alert", SessionID: session.ID,
				Reason: "insufficient_balance", Needed: notional, Available: balance,
			})
		}
		if p.notifier != nil {
			p.notifier.SendPaperAlert(session.Name, session.Symbol, "Saldo tidak cukup untuk beli", notional, balance)
		}
		return nil
	}

	newBalance := balance - notional
	if err := p.setBalance(session.ID, newBalance); err != nil {
		return err
	}

	_, err = p.db.Exec(
		p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`),
		session.ID, fmt.Sprintf("paper_buy_%d", time.Now().UnixNano()),
		session.Symbol, string(model.SideBuy), gridPrice, qty, qty, execPrice,
	)
	if err != nil {
		return fmt.Errorf("save buy order: %w", err)
	}

	slog.Info("paper buy", "session", session.ID, "symbol", session.Symbol, "qty", qty, "grid_price", gridPrice, "exec_price", execPrice, "balance", fmt.Sprintf("%.2f->%.2f", balance, newBalance))
	return nil
}

func (p *PaperEngine) executeSell(session model.Session, matchPrice, execPrice, qty string) error {

	var buyOrder model.Order
	err := p.db.Get(&buyOrder,
		p.db.Rebind(`SELECT * FROM orders WHERE session_id = ? AND symbol = ? AND side = 'buy' AND status = 'filled' AND price = ?
		 ORDER BY id ASC LIMIT 1`),
		session.ID, session.Symbol, matchPrice,
	)
	if err != nil {
		slog.Warn("no open buy to match", "session", session.ID, "price", matchPrice, "error", err)
		if p.hub != nil {
			p.hub.Broadcast(session.ID, WSPaperAlert{
				Type: "paper_alert", SessionID: session.ID,
				Reason: "no_asset_to_sell", Needed: 0, Available: 0,
			})
		}
		if p.notifier != nil {
			p.notifier.SendPaperAlert(session.Name, session.Symbol, "Tidak ada aset untuk dijual", 0, 0)
		}
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

	if _, err := p.db.Exec(p.db.Rebind("UPDATE orders SET status = 'closed' WHERE id = ?"), buyOrder.ID); err != nil {
		return fmt.Errorf("update buy order: %w", err)
	}

	_, err = p.db.Exec(
		p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`),
		session.ID, fmt.Sprintf("paper_sell_%d", time.Now().UnixNano()),
		session.Symbol, string(model.SideSell), execPrice, useQty, useQty, execPrice,
	)
	if err != nil {
		return fmt.Errorf("save sell order: %w", err)
	}

	_, err = p.db.Exec(
		p.db.Rebind(`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, pnl, traded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`),
		session.ID, buyOrder.OrderID, session.Symbol, string(model.SideSell), execPrice, useQty, pnlStr,
	)
	if err != nil {
		return fmt.Errorf("save trade: %w", err)
	}

	slog.Info("paper sell", "session", session.ID, "symbol", session.Symbol, "qty", useQty, "price", execPrice, "pnl", pnlStr, "balance", fmt.Sprintf("%.2f->%.2f", balance, balance+proceeds))
	return nil
}

func (p *PaperEngine) executeTrendBuy(session model.Session, signal Signal) error {
	var openCount int
	if err := p.db.Get(&openCount, p.db.Rebind("SELECT COUNT(*) FROM orders WHERE session_id=? AND side='buy' AND status='filled'"), session.ID); err != nil {
		return fmt.Errorf("trend: check open position: %w", err)
	}
	if openCount > 0 {
		slog.Debug("trend: open position exists, skip buy", "session", session.ID)
		return nil
	}

	execPriceF, _ := strconv.ParseFloat(signal.Price, 64)
	qtyF, _ := strconv.ParseFloat(signal.Quantity, 64)
	notional := execPriceF * qtyF

	balance, err := p.getBalance(session.ID)
	if err != nil {
		return err
	}
	if balance < notional {
		slog.Warn("trend: insufficient paper balance", "session", session.ID, "balance", balance, "needed", notional)
		if p.hub != nil {
			p.hub.Broadcast(session.ID, WSPaperAlert{
				Type: "paper_alert", SessionID: session.ID,
				Reason: "insufficient_balance", Needed: notional, Available: balance,
			})
		}
		if p.notifier != nil {
			p.notifier.SendPaperAlert(session.Name, session.Symbol, "Saldo tidak cukup untuk beli", notional, balance)
		}
		return nil
	}

	newBalance := balance - notional
	if err := p.setBalance(session.ID, newBalance); err != nil {
		return err
	}

	_, err = p.db.Exec(
		p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`),
		session.ID, fmt.Sprintf("paper_trend_buy_%d", time.Now().UnixNano()),
		session.Symbol, string(model.SideBuy), signal.Price, signal.Quantity, signal.Quantity, signal.Price,
	)
	if err != nil {
		return fmt.Errorf("save trend buy order: %w", err)
	}

	slog.Info("trend paper buy", "session", session.ID, "symbol", session.Symbol, "qty", signal.Quantity, "price", signal.Price, "balance", fmt.Sprintf("%.2f->%.2f", balance, newBalance))
	return nil
}

func (p *PaperEngine) executeTrendSell(session model.Session, signal Signal) error {
	var buys []model.Order
	if err := p.db.Select(&buys, p.db.Rebind("SELECT * FROM orders WHERE session_id=? AND side='buy' AND status='filled'"), session.ID); err != nil {
		return fmt.Errorf("fetch open buys: %w", err)
	}
	if len(buys) == 0 {
		slog.Warn("trend: no open position to sell", "session", session.ID)
		if p.hub != nil {
			p.hub.Broadcast(session.ID, WSPaperAlert{
				Type: "paper_alert", SessionID: session.ID,
				Reason: "no_asset_to_sell", Needed: 0, Available: 0,
			})
		}
		if p.notifier != nil {
			p.notifier.SendPaperAlert(session.Name, session.Symbol, "Tidak ada posisi untuk dijual", 0, 0)
		}
		return nil
	}

	execPriceF, _ := strconv.ParseFloat(signal.Price, 64)
	totalProceeds := 0.0
	totalQty := 0.0

	for _, buy := range buys {
		buyPrice, _ := strconv.ParseFloat(buy.ExecutedPrice, 64)
		qtyF, _ := strconv.ParseFloat(buy.Quantity, 64)
		pnl := (execPriceF - buyPrice) * qtyF
		pnlStr := strconv.FormatFloat(math.Round(pnl*1e8)/1e8, 'f', 8, 64)
		proceeds := execPriceF * qtyF
		totalProceeds += proceeds
		totalQty += qtyF

		if _, err := p.db.Exec(p.db.Rebind("UPDATE orders SET status='closed' WHERE id=?"), buy.ID); err != nil {
			return fmt.Errorf("close buy order: %w", err)
		}
		if _, err := p.db.Exec(
			p.db.Rebind(`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, pnl, traded_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`),
			session.ID, buy.OrderID, session.Symbol, string(model.SideSell), signal.Price, buy.Quantity, pnlStr,
		); err != nil {
			return fmt.Errorf("save trade: %w", err)
		}
	}

	totalQtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
	if _, err := p.db.Exec(
		p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`),
		session.ID, fmt.Sprintf("paper_trend_sell_%d", time.Now().UnixNano()),
		session.Symbol, string(model.SideSell), signal.Price, totalQtyStr, totalQtyStr, signal.Price,
	); err != nil {
		return fmt.Errorf("save sell order: %w", err)
	}

	balance, err := p.getBalance(session.ID)
	if err != nil {
		return err
	}
	if err := p.setBalance(session.ID, balance+totalProceeds); err != nil {
		return err
	}

	slog.Info("trend paper sell", "session", session.ID, "symbol", session.Symbol, "qty", totalQtyStr, "price", signal.Price, "proceeds", fmt.Sprintf("%.2f", totalProceeds))
	return nil
}

func (p *PaperEngine) getBalance(sessionID int64) (float64, error) {
	var balance sql.NullFloat64
	err := p.db.Get(&balance, p.db.Rebind("SELECT virtual_balance FROM sessions WHERE id = ?"), sessionID)
	if err != nil {
		return 0, err
	}
	if !balance.Valid {
		return 0, nil
	}
	return balance.Float64, nil
}

func (p *PaperEngine) setBalance(sessionID int64, balance float64) error {
	_, err := p.db.Exec(p.db.Rebind("UPDATE sessions SET virtual_balance = ? WHERE id = ?"),
		math.Round(balance*1e8)/1e8, sessionID)
	return err
}