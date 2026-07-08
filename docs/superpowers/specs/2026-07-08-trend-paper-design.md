# Trend Paper Design

## Status
- Updated 2026-07-08 — added Part 7 (expanded acceptance criteria), Part 8 (implementation order), Part 9 (open questions/notes)

## Goals
- Bring `Trend Paper` mode to feature parity with `Grid Paper`: virtual balance, order execution, P&L tracking.
- Use **Full Position** model: golden cross = beli semua modal, death cross = jual semua holdings sekaligus.
- Reuse existing `orders`, `trades`, `sessions.virtual_balance` — no schema migration.
- Reuse `PaperEngine` struct; add `ExecuteTrend` method alongside existing `Execute`.
- Branch in `manager.go` based on `session.Strategy` so existing grid paper is untouched.

## Non-Goals
- FIFO / partial exit (deferred; add when multi-position trend is needed).
- Stop-loss / take-profit automation (deferred; upgrade path later).
- New database tables or schema changes.
- Changes to Trend Signal mode (already working).

---

## Part 1: Conceptual Background

### How Trend Paper Works

Trend Paper is the virtual execution layer on top of Trend Signal detection.
When mode = `paper` and strategy = `trend`:

1. **Golden Cross** -> `executeTrendBuy`
   - If already holding an open position for this session: skip (no double-entry).
   - Compute notional = `qty * currentPrice`.
   - If `virtual_balance < notional`: broadcast alert, skip.
   - Deduct notional from `virtual_balance`.
   - Insert one `orders` row: `side=buy, status=filled`.

2. **Death Cross** -> `executeTrendSell`
   - Fetch ALL open buy orders for this session (`side=buy, status=filled`).
   - If none: broadcast alert ("tidak ada posisi untuk dijual"), skip.
   - For each open buy: compute P&L = `(sellPrice - buyPrice) * qty`, insert into `trades`.
   - Sum proceeds from all sells, add back to `virtual_balance`.
   - Mark all buy orders `status=closed`.
   - Insert one `orders` row for the sell side.

### Why Full Position

Trend following is directional: when the trend reverses (death cross), you want out completely.
Holding partial positions across multiple golden crosses while a death cross fires is
counter to the strategy's logic. Full exit on death cross is the natural interpretation.

### Comparison with Grid Paper

| Aspect | Grid Paper | Trend Paper |
|---|---|---|
| Buy guard | Skip if `price=gridPrice` already filled | Skip if any open buy exists (one position at a time) |
| Sell matching | Find 1 open buy by `price=matchPrice` | Find ALL open buys for the session |
| Qty sold | Signal qty | Sum of all open buy qtys |
| Trades inserted | 1 per sell signal | N (one per open buy being closed) |
| P&L per trade | `(sellPrice - buyPrice) * qty` | Same formula, per original buy lot |

---

## Part 2: Architecture

### Approach
Add `ExecuteTrend(session, signal)` to `PaperEngine`. Branch in `manager.go evaluate()`:

```
case ModePaper:
    if session.Strategy == "trend":
        paper.ExecuteTrend(session, sig)
    else:
        paper.Execute(session, sig)  // existing grid/dca path
```

### Components

| Location | Change |
|---|---|
| `engine/paper.go` | Add `ExecuteTrend`, `executeTrendBuy`, `executeTrendSell` methods |
| `engine/paper_test.go` | Add tests: buy executes, buy skipped (open position exists), sell closes all, sell skipped (no position), insufficient balance |
| `engine/manager.go` | Branch on `session.Strategy` in `ModePaper` case |

No changes needed to:
- `model/models.go` — reuse existing `Order`, `Trade` structs
- `repository/` — direct DB access (mirrors existing PaperEngine pattern)
- `validator/session.go` — TrendConfig already validated
- Frontend — portfolio/trades UI already works for paper sessions

---

## Part 3: Implementation Details

### `executeTrendBuy`

```go
func (p *PaperEngine) executeTrendBuy(session model.Session, signal Signal) error {
    // 1. Check for existing open position
    var openCount int
    p.db.Get(&openCount, "SELECT COUNT(*) FROM orders WHERE session_id=? AND side='buy' AND status='filled'", session.ID)
    if openCount > 0 {
        slog.Debug("trend: open position exists, skip buy", "session", session.ID)
        return nil
    }

    // 2. Fetch current price
    ticker, _ := p.client.GetTicker(session.Symbol)
    execPrice := ticker.LastPrice
    execPriceF, _ := strconv.ParseFloat(execPrice, 64)
    qtyF, _ := strconv.ParseFloat(signal.Quantity, 64)
    notional := execPriceF * qtyF

    // 3. Balance check
    balance, _ := p.getBalance(session.ID)
    if balance < notional {
        // broadcast + notify insufficient balance
        return nil
    }

    // 4. Deduct balance, insert order
    p.setBalance(session.ID, balance - notional)
    p.db.Exec(`INSERT INTO orders (...) VALUES (...)`, ...)
}
```

### `executeTrendSell`

```go
func (p *PaperEngine) executeTrendSell(session model.Session, signal Signal) error {
    // 1. Fetch ALL open buys
    var buys []model.Order
    p.db.Select(&buys, "SELECT * FROM orders WHERE session_id=? AND side='buy' AND status='filled'", session.ID)
    if len(buys) == 0 {
        // broadcast + notify no position
        return nil
    }

    // 2. Fetch current price
    ticker, _ := p.client.GetTicker(session.Symbol)
    execPrice := ticker.LastPrice
    execPriceF, _ := strconv.ParseFloat(execPrice, 64)

    // 3. For each buy: compute P&L, insert trade, close order
    totalProceeds := 0.0
    for _, buy := range buys {
        buyPrice, _ := strconv.ParseFloat(buy.ExecutedPrice, 64)
        qtyF, _ := strconv.ParseFloat(buy.Quantity, 64)
        pnl := (execPriceF - buyPrice) * qtyF
        totalProceeds += execPriceF * qtyF
        // INSERT INTO trades (pnl=pnl)
        // UPDATE orders SET status='closed' WHERE id=buy.ID
    }

    // 4. Insert one sell order, add proceeds to balance
    balance, _ := p.getBalance(session.ID)
    p.setBalance(session.ID, balance + totalProceeds)
    // INSERT INTO orders (side=sell, ...)
}
```

### `ExecuteTrend` dispatcher

```go
func (p *PaperEngine) ExecuteTrend(session model.Session, signal Signal) error {
    p.mu.Lock()
    defer p.mu.Unlock()
    switch signal.Side {
    case "buy":
        return p.executeTrendBuy(session, signal)
    case "sell":
        return p.executeTrendSell(session, signal)
    }
    return nil
}
```

### Manager branch

```go
case string(model.ModePaper):
    for _, sig := range signals {
        var execErr error
        if session.Strategy == string(model.StratTrend) {
            execErr = m.paper.ExecuteTrend(session, sig)
        } else {
            execErr = m.paper.Execute(session, sig)
        }
        if execErr != nil {
            slog.Error("paper execute", "session", session.ID, "error", execErr)
        }
        m.Hub.Broadcast(session.ID, WSSignal{Type: "signal", SessionID: session.ID, Signal: sig})
    }
```

---

## Part 4: Data Model (Reuse)

### orders table (no changes)

| Column | Trend Paper meaning |
|---|---|
| `session_id` | session ID |
| `order_id` | `"paper_trend_buy_{nano}"` / `"paper_trend_sell_{nano}"` |
| `symbol` | e.g. BTC_USDT |
| `side` | buy / sell |
| `price` | signal price (cross price) |
| `executed_price` | market price at execution |
| `quantity` | qty |
| `status` | `filled` (buy open) / `closed` (buy matched by death cross) / `filled` (sell record, stays filled — sell orders are never closed) |

### trades table (no changes)

| Column | Trend Paper meaning |
|---|---|
| `session_id` | session ID |
| `order_id` | buy order's order_id |
| `symbol` | e.g. BTC_USDT |
| `side` | sell |
| `price` | sell execution price |
| `quantity` | qty from matched buy |
| `pnl` | (sellPrice - buyPrice) * qty |

### sessions.virtual_balance (no changes)
- Decremented on buy, incremented on sell proceeds.

---

## Part 5: Error Handling

- Ticker fetch fails on buy -> skip buy for this tick, log error.
- Ticker fetch fails on sell -> skip sell for this tick (do not close positions without price).
- Insufficient balance -> broadcast `paper_alert` (type: `insufficient_balance`), Telegram notify, skip.
- No open position on sell -> broadcast `paper_alert` (type: `no_asset_to_sell`), Telegram notify, skip.
- DB errors -> log, return error to caller (manager logs it).

---

## Part 6: Testing Strategy

### `executeTrendBuy`
- Buy executes: balance decremented, order inserted.
- Buy skipped: open position already exists, balance unchanged.
- Buy skipped: insufficient balance, alert broadcast.

### `executeTrendSell`
- Sell closes all: all open buys closed, trades inserted, balance incremented.
- Sell skipped: no open position, alert broadcast.
- P&L calculation: correct per buy lot.

### Manager branch
- `StratTrend + ModePaper` routes to `ExecuteTrend`.
- `StratGrid + ModePaper` still routes to `Execute` (regression check).

---

## Part 7: Acceptance Criteria

### Buy
- Golden cross creates one `orders` row: `side=buy, status=filled`.
- `virtual_balance` decremented by `qty * execPrice` (executed price, not signal price).
- Second golden cross while any open buy exists is ignored — logged as debug, no order created, balance unchanged.
- Insufficient balance on buy broadcasts `paper_alert` type `insufficient_balance`, sends Telegram notification, skips order.
- Ticker fetch failure on buy skips execution for that tick, logs error, no order created.

### Sell
- Death cross closes ALL open buy orders (`status=filled` -> `status=closed`).
- One `trades` row inserted per closed buy: `pnl = (sellPrice - buyPrice) * qty`, rounded to 8 decimals.
- One sell `orders` row inserted with total qty = sum of all closed buy qtys.
- `virtual_balance` incremented by total proceeds (`sum of execPrice * qty` per buy).
- Death cross with no open position broadcasts `paper_alert` type `no_asset_to_sell`, sends Telegram notification, does nothing.
- Ticker fetch failure on sell skips execution for that tick — open positions remain, balance unchanged.

### General
- `virtual_balance` reflects all buy/sell operations correctly end-to-end.
- Grid Paper sessions are completely unaffected (regression check).
- Existing portfolio UI (holdings table, trades table, P&L chart) works for Trend Paper without frontend changes.
- DB errors are logged and returned to manager (manager logs them); no silent failures.

---

## Part 8: Implementation Order

1. **`executeTrendBuy` in `engine/paper.go`**
   - Check open position count via DB query.
   - Fetch ticker price.
   - Balance check and deduct.
   - Insert `orders` row with `order_id = "paper_trend_buy_{nano}"`.

2. **`executeTrendSell` in `engine/paper.go`**
   - Fetch all open buy orders for session.
   - Fetch ticker price.
   - For each buy: compute P&L, insert `trades` row, mark `status=closed`.
   - Insert one sell `orders` row.
   - Add proceeds to `virtual_balance`.

3. **`ExecuteTrend` dispatcher in `engine/paper.go`**
   - Lock mutex.
   - Switch on `signal.Side` -> `executeTrendBuy` or `executeTrendSell`.

4. **Manager branch in `engine/manager.go`**
   - In `ModePaper` case, branch on `session.Strategy == "trend"`.
   - Call `ExecuteTrend` for trend, `Execute` for others.

5. **Tests in `engine/paper_test.go`**
   - `executeTrendBuy` executes: balance deducted, order inserted.
   - `executeTrendBuy` skipped: open position exists, balance unchanged.
   - `executeTrendBuy` skipped: insufficient balance, alert broadcast.
   - `executeTrendSell` closes all: all buys closed, trades inserted, balance incremented.
   - `executeTrendSell` skipped: no position, alert broadcast.
   - P&L calculation: correct per buy lot.
   - Manager branch: `StratTrend + ModePaper` routes to `ExecuteTrend`.
   - Manager regression: `StratGrid + ModePaper` still routes to `Execute`.

6. **Manual test pass**
   - Create BTC_USDT trend paper session (beginner mode).
   - Start session, wait for golden cross -> verify buy order, balance deducted.
   - Trigger second golden cross -> verify ignored, balance unchanged.
   - Wait for death cross -> verify all buys closed, trades with P&L, balance incremented.
   - Trigger death cross with no position -> verify alert shows in UI.
   - Check holdings, trades, P&L chart in dashboard render correctly.

---

## Part 9: Open Questions / Notes

- **Quantity rounding**: Use 8 decimals, consistent with grid paper and exchange precision expectations.
- **Multiple golden crosses (stacking)**: Current design = one position at a time. Upgrade path: allow stacking with FIFO exit. Deferred — add when user requests multi-position trend.
- **Partial exit**: Not implemented. Death cross = full exit. Add when "take-profit at X%, hold remainder" is requested.
- **Order IDs**: `paper_trend_buy_{nano}` / `paper_trend_sell_{nano}` — nanosecond timestamp ensures uniqueness per session.
- **Backward compat**: Trend Paper inserts into `orders` and `trades` tables same as Grid Paper. All existing queries and UI work unchanged.
- **`ponytail:`** `executeTrendBuy` and `executeTrendSell` use direct DB calls (same pattern as existing `Execute`). No repository abstraction — consistent with PaperEngine's existing approach.
