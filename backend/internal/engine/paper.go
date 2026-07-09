package engine

import (
	"database/sql"
	"encoding/json"
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
	// Fetch ticker BEFORE acquiring lock — network call must not block other sessions
	ticker, err := p.client.GetTicker(session.Symbol)
	if err != nil {
		return fmt.Errorf("fetch ticker: %w", err)
	}
	marketPrice := ticker.LastPrice
	qty := signal.Quantity

	p.mu.Lock()
	var notifSide, notifPrice, notifQty string
	switch signal.Side {
	case string(model.SideBuy):
		var executed bool
		err, executed = p.executeBuy(session, signal.Price, marketPrice, qty)
		if err == nil && executed {
			notifSide = string(model.SideBuy)
			notifPrice = marketPrice
			notifQty = qty
		}
	case string(model.SideSell):
		err = p.executeSell(session, signal.Price, marketPrice, qty)
	}
	p.mu.Unlock()

	// Send notif outside lock to avoid holding mutex during network call
	if err == nil && notifSide != "" && p.notifier != nil {
		p.notifier.SendTrade(session.Name, session.Strategy, session.Mode, session.Symbol, notifSide, notifPrice, notifQty, "")
	}
	return err
}

func (p *PaperEngine) executeBuy(session model.Session, gridPrice, execPrice, qty string) (error, bool) {
	cost, err := strconv.ParseFloat(execPrice, 64)
	if err != nil {
		return fmt.Errorf("executeBuy: invalid exec price %q: %w", execPrice, err), false
	}
	qtyF, err := strconv.ParseFloat(qty, 64)
	if err != nil {
		return fmt.Errorf("executeBuy: invalid qty %q: %w", qty, err), false
	}
	notional := cost * qtyF

	var existing int
	if err := p.db.Get(&existing, p.db.Rebind("SELECT COUNT(*) FROM orders WHERE session_id=? AND symbol=? AND side='buy' AND status='filled' AND price=?"),
		session.ID, session.Symbol, gridPrice); err != nil {
		slog.Warn("check existing buys", "session", session.ID, "error", err)
	}
	if existing > 0 {
		slog.Debug("buy already open, skip", "session", session.ID, "price", gridPrice)
		return nil, false
	}

	balance, err := p.getBalance(session.ID)
	if err != nil {
		return err, false
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
		return nil, false
	}

	newBalance := balance - notional
	if err := p.setBalance(session.ID, newBalance); err != nil {
		return err, false
	}

	_, err = p.db.Exec(
		p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`),
		session.ID, fmt.Sprintf("paper_buy_%d", time.Now().UnixNano()),
		session.Symbol, string(model.SideBuy), gridPrice, qty, qty, execPrice,
	)
	if err != nil {
		return fmt.Errorf("save buy order: %w", err), false
	}

	slog.Info("paper buy", "session", session.ID, "symbol", session.Symbol, "qty", qty, "grid_price", gridPrice, "exec_price", execPrice, "balance", fmt.Sprintf("%.2f->%.2f", balance, newBalance))
	return nil, true
}

func (p *PaperEngine) executeSell(session model.Session, matchPrice, execPrice, qty string) error {
	// Fetch all open buy positions for this session
	var buyOrders []model.Order
	err := p.db.Select(&buyOrders,
		p.db.Rebind(`SELECT * FROM orders WHERE session_id = ? AND symbol = ? AND side = 'buy' AND status = 'filled' ORDER BY id ASC`),
		session.ID, session.Symbol,
	)
	if err != nil || len(buyOrders) == 0 {
		slog.Debug("no open buy positions to sell", "session", session.ID)
		if p.notifier != nil {
			p.notifier.SendPaperAlert(session.Name, session.Symbol, "Tidak ada aset untuk dijual", 0, 0)
		}
		return nil
	}

	sellPrice, err := strconv.ParseFloat(execPrice, 64)
	if err != nil {
		return fmt.Errorf("executeSell: invalid exec price %q: %w", execPrice, err)
	}

	// Calculate total qty, total cost (for avg buy price), total proceeds
	// Use executed_price (actual market price) not price (grid level) for accurate PnL
	totalQty := 0.0
	totalCost := 0.0
	for _, o := range buyOrders {
		q, err := strconv.ParseFloat(o.Quantity, 64)
		if err != nil {
			return fmt.Errorf("executeSell: invalid order quantity %q: %w", o.Quantity, err)
		}
		execBuyPrice, err := strconv.ParseFloat(o.ExecutedPrice, 64)
		if err != nil || execBuyPrice == 0 {
			// fallback to price if executed_price not set
			execBuyPrice, _ = strconv.ParseFloat(o.Price, 64)
		}
		totalQty += q
		totalCost += execBuyPrice * q
	}

	avgBuyPrice := totalCost / totalQty
	proceeds := sellPrice * totalQty
	pnl := (sellPrice - avgBuyPrice) * totalQty
	pnlStr := strconv.FormatFloat(math.Round(pnl*1e8)/1e8, 'f', 8, 64)
	totalQtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
	sellID := time.Now().UnixNano()

	balance, err := p.getBalance(session.ID)
	if err != nil {
		return fmt.Errorf("get balance: %w", err)
	}

	// Wrap all DB writes in a transaction
	tx, err := p.db.Beginx()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Update balance
	if _, err := tx.Exec(tx.Rebind("UPDATE sessions SET virtual_balance = ? WHERE id = ?"),
		math.Round((balance+proceeds)*1e8)/1e8, session.ID); err != nil {
		return fmt.Errorf("set balance: %w", err)
	}

	// Close all open buy orders
	ids := make([]interface{}, len(buyOrders))
	for i, o := range buyOrders {
		ids[i] = o.ID
	}
	closeQuery, args, _ := sqlx.In("UPDATE orders SET status = 'closed' WHERE id IN (?)", ids)
	if _, err := tx.Exec(tx.Rebind(closeQuery), args...); err != nil {
		return fmt.Errorf("close buy orders: %w", err)
	}

	// Insert sell order
	if _, err := tx.Exec(
		tx.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price)
		 VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`),
		session.ID, fmt.Sprintf("paper_sell_%d", sellID),
		session.Symbol, string(model.SideSell), execPrice, totalQtyStr, totalQtyStr, execPrice,
	); err != nil {
		return fmt.Errorf("save sell order: %w", err)
	}

	// Insert trade record
	if _, err := tx.Exec(
		tx.Rebind(`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, pnl, traded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`),
		session.ID, fmt.Sprintf("paper_sell_%d", sellID),
		session.Symbol, string(model.SideSell), execPrice, totalQtyStr, pnlStr,
	); err != nil {
		return fmt.Errorf("save trade: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	slog.Info("paper sell all", "session", session.ID, "symbol", session.Symbol,
		"positions", len(buyOrders), "total_qty", totalQtyStr,
		"avg_buy", fmt.Sprintf("%.8f", avgBuyPrice), "sell_price", execPrice,
		"pnl", pnlStr, "balance", fmt.Sprintf("%.2f->%.2f", balance, balance+proceeds))

	if p.notifier != nil {
		p.notifier.SendTrade(session.Name, session.Strategy, session.Mode, session.Symbol, string(model.SideSell), execPrice, totalQtyStr, pnlStr)
	}
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

	// ponytail: trend signals carry the crossover price (fresh from latest candle), no ticker fetch needed.
	// Unlike grid paper where grid level prices can be stale. Add ticker fetch if live slippage tracking matters.
	execPriceF, err := strconv.ParseFloat(signal.Price, 64)
	if err != nil {
		return fmt.Errorf("executeTrendBuy: invalid price %q: %w", signal.Price, err)
	}
	qtyF, err := strconv.ParseFloat(signal.Quantity, 64)
	if err != nil {
		return fmt.Errorf("executeTrendBuy: invalid qty %q: %w", signal.Quantity, err)
	}
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

	execPriceF, err := strconv.ParseFloat(signal.Price, 64)
	if err != nil {
		return fmt.Errorf("executeTrendSell: invalid price %q: %w", signal.Price, err)
	}

	totalProceeds := 0.0
	totalQty := 0.0

	tx, err := p.db.Beginx()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	sellID := time.Now().UnixNano()
	for i, buy := range buys {
		buyPrice, err := strconv.ParseFloat(buy.ExecutedPrice, 64)
		if err != nil {
			return fmt.Errorf("executeTrendSell: invalid buy price %q: %w", buy.ExecutedPrice, err)
		}
		qtyF, err := strconv.ParseFloat(buy.Quantity, 64)
		if err != nil {
			return fmt.Errorf("executeTrendSell: invalid qty %q: %w", buy.Quantity, err)
		}
		pnl := (execPriceF - buyPrice) * qtyF
		pnlStr := strconv.FormatFloat(math.Round(pnl*1e8)/1e8, 'f', 8, 64)
		totalProceeds += execPriceF * qtyF
		totalQty += qtyF

		if _, err := tx.Exec(tx.Rebind("UPDATE orders SET status='closed' WHERE id=?"), buy.ID); err != nil {
			return fmt.Errorf("close buy order: %w", err)
		}
		if _, err := tx.Exec(
			tx.Rebind(`INSERT INTO trades (session_id, order_id, symbol, side, price, quantity, pnl, traded_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`),
			session.ID, buy.OrderID, session.Symbol, string(model.SideSell), signal.Price, buy.Quantity, pnlStr,
		); err != nil {
			return fmt.Errorf("save trade: %w", err)
		}
		_ = i
	}

	totalQtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
	if _, err := tx.Exec(
		tx.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, ?, 'market', ?, ?, 'filled', ?, ?)`),
		session.ID, fmt.Sprintf("paper_trend_sell_%d", sellID),
		session.Symbol, string(model.SideSell), signal.Price, totalQtyStr, totalQtyStr, signal.Price,
	); err != nil {
		return fmt.Errorf("save sell order: %w", err)
	}

	balance, err := p.getBalance(session.ID)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(tx.Rebind("UPDATE sessions SET virtual_balance = ? WHERE id = ?"),
		math.Round((balance+totalProceeds)*1e8)/1e8, session.ID); err != nil {
		return fmt.Errorf("set balance: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	slog.Info("trend paper sell", "session", session.ID, "symbol", session.Symbol, "qty", totalQtyStr, "price", signal.Price, "proceeds", fmt.Sprintf("%.2f", totalProceeds))
	return nil
}

func (p *PaperEngine) ExecuteTrend(session model.Session, signal Signal) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	switch signal.Side {
	case string(model.SideBuy):
		return p.executeTrendBuy(session, signal)
	case string(model.SideSell):
		return p.executeTrendSell(session, signal)
	}
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

type StopReason string

const (
	StopReasonSL StopReason = "stop_loss"
	StopReasonTP StopReason = "take_profit"
)

type StopConditionResult struct {
	Triggered    bool
	Reason       StopReason
	TotalValue   float64
	InitBalance  float64
}

// CheckStopConditions checks SL/TP thresholds for a paper session.
// Config fields checked: stop_loss_pct, stop_loss_amount, take_profit_pct, take_profit_amount.
// Returns triggered=true with reason if threshold is breached.
func (p *PaperEngine) CheckStopConditions(session model.Session, currentPrice string) StopConditionResult {
	// Parse SL/TP config from session config JSON
	var cfg struct {
		StopLossPct      *float64 `json:"stop_loss_pct"`
		StopLossAmount   *float64 `json:"stop_loss_amount"`
		TakeProfitPct    *float64 `json:"take_profit_pct"`
		TakeProfitAmount *float64 `json:"take_profit_amount"`
	}
	if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
		return StopConditionResult{}
	}
	// Nothing configured
	if cfg.StopLossPct == nil && cfg.StopLossAmount == nil && cfg.TakeProfitPct == nil && cfg.TakeProfitAmount == nil {
		return StopConditionResult{}
	}

	if session.InitialBalance == nil || *session.InitialBalance <= 0 {
		return StopConditionResult{}
	}
	initBal := *session.InitialBalance

	// Compute total value = virtual_balance + sum(open positions × current_price)
	balance, err := p.getBalance(session.ID)
	if err != nil {
		return StopConditionResult{}
	}

	price, err := strconv.ParseFloat(currentPrice, 64)
	if err != nil || price <= 0 {
		return StopConditionResult{}
	}

	type openPos struct {
		Quantity string `db:"quantity"`
	}
	var positions []openPos
	if err := p.db.Select(&positions, p.db.Rebind(
		`SELECT quantity FROM orders WHERE session_id=? AND side='buy' AND status='filled'`),
		session.ID); err != nil {
		slog.Warn("CheckStopConditions: fetch positions", "session", session.ID, "error", err)
		return StopConditionResult{}
	}

	holdingsValue := 0.0
	for _, pos := range positions {
		qty, _ := strconv.ParseFloat(pos.Quantity, 64)
		holdingsValue += qty * price
	}
	totalValue := balance + holdingsValue

	result := StopConditionResult{TotalValue: totalValue, InitBalance: initBal}

	// Check Stop Loss
	if cfg.StopLossPct != nil && *cfg.StopLossPct > 0 {
		threshold := initBal * (1 - *cfg.StopLossPct/100)
		if totalValue <= threshold {
			result.Triggered = true
			result.Reason = StopReasonSL
			return result
		}
	}
	if cfg.StopLossAmount != nil && *cfg.StopLossAmount > 0 {
		threshold := initBal - *cfg.StopLossAmount
		if totalValue <= threshold {
			result.Triggered = true
			result.Reason = StopReasonSL
			return result
		}
	}

	// Check Take Profit
	if cfg.TakeProfitPct != nil && *cfg.TakeProfitPct > 0 {
		threshold := initBal * (1 + *cfg.TakeProfitPct/100)
		if totalValue >= threshold {
			result.Triggered = true
			result.Reason = StopReasonTP
			return result
		}
	}
	if cfg.TakeProfitAmount != nil && *cfg.TakeProfitAmount > 0 {
		threshold := initBal + *cfg.TakeProfitAmount
		if totalValue >= threshold {
			result.Triggered = true
			result.Reason = StopReasonTP
			return result
		}
	}

	return result
}