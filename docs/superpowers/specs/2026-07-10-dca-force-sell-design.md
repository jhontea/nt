# DCA Force Sell — Design Spec

**Date:** 2026-07-10  
**Status:** Approved  
**Scope:** Live mode DCA sessions only

---

## Overview

Force sell allows a user to immediately liquidate their entire DCA holding at market price and stop the session. The operation is atomic — order placement, DB recording, PnL calculation, and session stop all succeed or fail together via a single database transaction.

---

## API

### Endpoint

```
POST /v1/sessions/:id/force-sell
Authorization: Bearer <JWT>
```

### Preconditions (validated before transaction)

| Condition | Error |
|---|---|
| Session belongs to authenticated user | 403 |
| Session mode = `live` | 400 "force sell hanya tersedia untuk live session" |
| Session status = `running` | 400 "session tidak sedang berjalan" |
| Net holding qty > 0 | 400 "tidak ada posisi untuk dijual" |

### Response (200 OK)

```json
{
  "qty_sold": "0.04170000",
  "sell_price": "1405122.00",
  "realized_pnl": "-119.25"
}
```

### Error responses

| Code | Condition |
|---|---|
| 400 | Precondition failed (message explains which) |
| 403 | Session not owned by user |
| 502 | Exchange API error (message from exchange forwarded) |

---

## Backend Architecture

### Handler: `ForceSell` in `internal/handler/session.go`

1. Parse `:id`, resolve user from JWT
2. Load session from DB — verify ownership and preconditions
3. Call `SessionService.ForceSell(ctx, sessionID, userID)`
4. Return result or mapped error

### Service: `ForceSell` in `internal/service/session_service.go`

Orchestrates the operation in a single DB transaction:

```
BEGIN TRANSACTION
  1. Re-read session (lock row) — re-verify status = running inside tx
  2. Compute net holding via GetHoldingPosition (uses tx)
  3. Abort if holding <= 0
  4. Place market sell order via exchange client (outside tx — I/O)
     → On exchange error: rollback, return 502
  5. INSERT into orders (type=market, side=sell, status=filled, executed_qty, executed_price)
  6. Compute realized PnL: (sell_price - avg_buy_price) * qty_sold
  7. INSERT into trades (pnl = realized_pnl)
  8. UPDATE sessions SET status = 'stopped', stopped_at = NOW()
COMMIT
```

Note: The exchange API call (step 4) happens outside the transaction because it is a network I/O that cannot be rolled back. If the exchange call succeeds but the DB commit fails, the handler logs the orphaned exchange order with full details (order_id, qty, price) at ERROR level so it can be reconciled manually. The existing reconciler in `reconcile.go` will also pick it up on next run.

### Net holding calculation

Reuses `pnl_service.GetHoldingPosition` but executed against the transaction connection:

```
net_qty = SUM(buy executed_qty) - SUM(sell executed_qty)  [filled orders only]
avg_buy_price = weighted average of buy executed_price
```

### PnL calculation

```
realized_pnl = (sell_price - avg_buy_price) * net_qty
```

Fees are currently stored as `'0'` (existing limitation across the whole system). A `ponytail:` comment notes this.

### Session stop

Calls the existing `Manager.Stop(sessionID)` after the transaction commits — same path as `POST /sessions/:id/stop`. This evicts engine state and cancels the session goroutine.

---

## Frontend

### Where the button appears

- DCA session card (`SessionCard.tsx`) — new "Force Sell" button
- DCA session detail page (`[id]/page.tsx`) — same button in the action bar
- Visibility condition: `session.strategy === 'dca' && session.mode === 'live' && session.status === 'running'`

### Confirmation pattern

Reuses the existing `confirmId` inline confirmation pattern (same as delete):

1. First click: button label changes to "Yakin jual semua?" + "Ya" / "Batal"
2. Click "Ya": fires `POST /v1/sessions/:id/force-sell`
3. Success: `toast('Posisi berhasil dijual', 'success')`, invalidate session queries
4. Error: `toast(error.message || 'Gagal force sell', 'error')`

### Button styling

Danger variant — matches existing stop/delete pattern:
```
bg-[#d03238] text-white rounded-full px-3 py-1.5 text-xs font-medium
```

---

## Route registration

```go
// in cmd/server/main.go, inside authenticated routes
sessions.POST("/:id/force-sell", sessionHandler.ForceSell)
```

---

## Error handling summary

| Scenario | Behavior |
|---|---|
| Exchange order placed, DB commit fails | Log orphaned order at ERROR, return 502, reconciler picks up |
| Exchange rejects order (insufficient balance, etc.) | Rollback tx, return 502 with exchange message |
| Session stops naturally between request and tx lock | Re-check inside tx, return 400 |
| Network timeout to exchange | Rollback tx, return 502 |

---

## Out of scope

- Paper mode support (not requested)
- Partial sell (not requested)
- Force sell for grid or trend strategies
