package engine

import (
	"context"
	"log/slog"
	"strconv"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

// Reconciler syncs live orders in DB against the exchange.
// Runs periodically to fix orders that were placed on exchange but whose
// DB status was never updated (e.g. due to network failure after PlaceOrder).
type Reconciler struct {
	db     *sqlx.DB
	client *tokocrypto.Client
}

func NewReconciler(db *sqlx.DB, client *tokocrypto.Client) *Reconciler {
	return &Reconciler{db: db, client: client}
}

// Run starts the reconciliation loop. Call in a goroutine.
// Checks every interval for live orders stuck in non-terminal status.
func (r *Reconciler) Run(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.reconcile(ctx)
		}
	}
}

// reconcile finds live orders with non-terminal status and syncs them from exchange.
// ponytail: only reconciles 'new' status — filled/closed/cancelled are terminal.
func (r *Reconciler) reconcile(ctx context.Context) {
	type pendingOrder struct {
		ID        int64  `db:"id"`
		SessionID int64  `db:"session_id"`
		OrderID   string `db:"order_id"`
		ClientID  string `db:"client_id"`
		Symbol    string `db:"symbol"`
		Side      string `db:"side"`
	}

	var pending []pendingOrder
	if err := r.db.SelectContext(ctx, &pending, `
		SELECT o.id, o.session_id, o.order_id, o.client_id, o.symbol, o.side
		FROM orders o
		JOIN sessions s ON s.id = o.session_id
		WHERE s.mode = 'live'
		  AND o.status NOT IN ('filled', 'closed', 'canceled', 'rejected', 'expired', 'signal')
		  AND o.created_at < `+intervalAgo(r.db, 2)+`
		ORDER BY o.created_at ASC
		LIMIT 50
	`); err != nil {
		slog.Warn("reconciler: query pending orders", "error", err)
		return
	}

	if len(pending) == 0 {
		return
	}

	slog.Info("reconciler: found pending live orders", "count", len(pending))

	for _, o := range pending {
		var exchangeOrder *tokocrypto.OrderResponseData
		var err error
		if o.OrderID != "" {
			orderIDInt, parseErr := strconv.ParseInt(o.OrderID, 10, 64)
			if parseErr != nil {
				slog.Warn("reconciler: invalid order_id", "order", o.ID, "order_id", o.OrderID)
				continue
			}
			exchangeOrder, err = r.client.GetOrder(o.Symbol, orderIDInt)
		} else if o.ClientID != "" {
			exchangeOrder, err = r.client.GetOrderByClientID(o.Symbol, o.ClientID)
		} else {
			slog.Warn("reconciler: pending order has no exchange identifier", "order", o.ID)
			continue
		}
		if err != nil {
			slog.Warn("reconciler: fetch order from exchange", "order", o.ID, "order_id", o.OrderID, "client_id", o.ClientID, "error", err)
			continue
		}

		newStatus := liveOrderStatus(exchangeOrder.StatusInt())
		execQty := exchangeOrder.ExecutedQty
		execPrice := exchangeOrder.ExecutedPrice
		if execQty == "" {
			execQty = "0"
		}
		if execPrice == "" {
			execPrice = "0"
		}

		exchangeOrderID := strconv.FormatInt(exchangeOrder.OrderID, 10)
		tx, err := r.db.BeginTxx(ctx, nil)
		if err != nil {
			slog.Error("reconciler: begin transaction", "order", o.ID, "error", err)
			continue
		}
		if _, err := tx.ExecContext(ctx,
			tx.Rebind(`UPDATE orders SET order_id=?, status=?, executed_qty=?, executed_price=?, executed_quote_qty=? WHERE id=?`),
			exchangeOrderID, newStatus, execQty, execPrice, exchangeOrder.ExecutedQuoteQty, o.ID,
		); err != nil {
			tx.Rollback()
			slog.Error("reconciler: update order status", "order", o.ID, "status", newStatus, "error", err)
			continue
		}

		hasExecution := exchangeOrder.HasExecutedQuantity()
		if hasExecution {
			var tradeCount int
			if err := tx.GetContext(ctx, &tradeCount, tx.Rebind(`SELECT COUNT(*) FROM trades WHERE order_id = ?`), exchangeOrderID); err != nil {
				tx.Rollback()
				slog.Error("reconciler: check trade", "order", o.ID, "error", err)
				continue
			}
			if tradeCount == 0 {
				pnl := "0"
				if o.Side == string(model.SideSell) {
					pnl = computeLivePnLTx(tx, o.SessionID, exchangeOrderID, execPrice, execQty)
				}
				fee, feeAsset := exchangeOrder.Fee()
				if _, err := tx.ExecContext(ctx, tx.Rebind(`INSERT INTO trades
					(session_id, order_id, symbol, side, price, quantity, fee, fee_asset, pnl, traded_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
					o.SessionID, exchangeOrderID, o.Symbol, o.Side, execPrice, execQty, fee, feeAsset, pnl, time.Now()); err != nil {
					tx.Rollback()
					slog.Error("reconciler: create recovered trade", "order", o.ID, "error", err)
					continue
				}
			}
			if o.Side == string(model.SideSell) && newStatus == string(model.OrdFilled) {
				if _, err := tx.ExecContext(ctx, tx.Rebind(`UPDATE sessions SET status='stopped', stopped_at=? WHERE id=? AND status='liquidating'`),
					time.Now(), o.SessionID); err != nil {
					tx.Rollback()
					slog.Error("reconciler: finalize liquidation", "session", o.SessionID, "error", err)
					continue
				}
			}
		}
		if o.Side == string(model.SideSell) && (newStatus == string(model.OrdCanceled) || newStatus == string(model.OrdRejected) || newStatus == string(model.OrdExpired)) {
			if _, err := tx.ExecContext(ctx, tx.Rebind(`UPDATE sessions SET status=? WHERE id=? AND status=?`),
				string(model.StatLiquidationFailed), o.SessionID, string(model.StatLiquidating)); err != nil {
				tx.Rollback()
				slog.Error("reconciler: mark liquidation failed", "session", o.SessionID, "error", err)
				continue
			}
		}
		if err := tx.Commit(); err != nil {
			slog.Error("reconciler: commit", "order", o.ID, "error", err)
			continue
		}

		slog.Info("reconciler: order synced",
			"order", o.ID, "order_id", o.OrderID, "symbol", o.Symbol,
			"side", o.Side, "status", newStatus, "exec_qty", execQty)

		// If a buy order is now filled, ensure it's tracked correctly
		// (handles the case where DB write succeeded but status was wrong)
		if o.Side == string(model.SideBuy) && newStatus == string(model.OrdFilled) {
			slog.Info("reconciler: buy order confirmed filled", "session", o.SessionID, "order_id", o.OrderID)
		}
	}
}
