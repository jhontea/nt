# Trend Paper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement Trend Paper mode - virtual order execution for trend strategy using golden/death cross signals.

**Architecture:** Add ExecuteTrend to PaperEngine with executeTrendBuy/executeTrendSell helpers. Branch in manager.go evaluate() on session.Strategy for ModePaper case. Reuse existing DB tables with no schema changes.

**Tech Stack:** Go 1.26, sqlx, SQLite, TokoCrypto client

## Global Constraints
- No schema migrations - reuse orders, trades, sessions.virtual_balance
- Grid Paper must be completely unaffected (regression)
- P&L rounded to 8 decimals (math.Round(x*1e8)/1e8)
- order_id format: paper_trend_buy_{nano} / paper_trend_sell_{nano}
- All DB queries use p.db.Rebind() for portability

---

### Task 1: executeTrendBuy

**Files:**
- Modify: `backend/internal/engine/paper.go`
- Test: `backend/internal/engine/paper_test.go`

**Interfaces:**
- Consumes: `PaperEngine.db`, `PaperEngine.client`, `PaperEngine.hub`, `PaperEngine.notifier`
- Produces: `func (p *PaperEngine) executeTrendBuy(session model.Session, signal Signal) error`

- [ ] **Step 1: Write failing tests**

```go
func TestTrendBuy_Executes(t *testing.T) {
    p := setupPaperDB(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}
    sig := Signal{Side: "buy", Price: "50000", Quantity: "0.01"}
    err := p.executeTrendBuy(session, sig)
    if err != nil { t.Fatal(err) }
    bal, _ := p.getBalance(1)
    expected := 1000.0 - 50000*0.01
    if math.Abs(bal-expected) > 0.01 { t.Errorf("want %.2f got %.2f", expected, bal) }
    var count int
    p.db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy' AND status='filled'")
    if count != 1 { t.Errorf("want 1 order, got %d", count) }
}

func TestTrendBuy_SkipsIfOpenPosition(t *testing.T) {
    p := setupPaperDB(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}
    sig := Signal{Side: "buy", Price: "50000", Quantity: "0.01"}
    p.executeTrendBuy(session, sig)
    p.executeTrendBuy(session, sig) // second call should be skipped
    bal, _ := p.getBalance(1)
    expected := 1000.0 - 50000*0.01
    if math.Abs(bal-expected) > 0.01 { t.Errorf("balance should only deduct once, got %.2f", bal) }
    var count int
    p.db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy'")
    if count != 1 { t.Errorf("want 1 order, got %d", count) }
}

func TestTrendBuy_InsufficientBalance(t *testing.T) {
    p := setupPaperDB(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}
    sig := Signal{Side: "buy", Price: "50000", Quantity: "1.0"} // 50000 > 1000 balance
    err := p.executeTrendBuy(session, sig)
    if err != nil { t.Fatal(err) }
    bal, _ := p.getBalance(1)
    if math.Abs(bal-1000) > 0.01 { t.Errorf("balance should be unchanged, got %.2f", bal) }
    var count int
    p.db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1")
    if count != 0 { t.Errorf("want 0 orders, got %d", count) }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && go test ./internal/engine/ -run "TestTrendBuy" -v
```
Expected: FAIL - executeTrendBuy undefined

- [ ] **Step 3: Implement executeTrendBuy in paper.go**

```go
func (p *PaperEngine) executeTrendBuy(session model.Session, signal Signal) error {
    // Check for existing open position (one position at a time)
    var openCount int
    if err := p.db.Get(&openCount, p.db.Rebind("SELECT COUNT(*) FROM orders WHERE session_id=? AND side='buy' AND status='filled'"), session.ID); err != nil {
        slog.Warn("trend: check open position", "session", session.ID, "error", err)
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
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && go test ./internal/engine/ -run "TestTrendBuy" -v
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```
git add backend/internal/engine/paper.go backend/internal/engine/paper_test.go
git commit -m "feat(trend-paper): add executeTrendBuy with open-position guard"
```

---

### Task 2: executeTrendSell

**Files:**
- Modify: `backend/internal/engine/paper.go`
- Test: `backend/internal/engine/paper_test.go`

**Interfaces:**
- Consumes: `PaperEngine.db`, `PaperEngine.client`, `PaperEngine.hub`, `PaperEngine.notifier`
- Produces: `func (p *PaperEngine) executeTrendSell(session model.Session, signal Signal) error`

- [ ] **Step 1: Write failing tests**

```go
func TestTrendSell_ClosesAllBuys(t *testing.T) {
    p := setupPaperDB(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}
    // Insert one open buy manually
    p.db.Exec(p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, 'buy', 'market', ?, ?, 'filled', ?, ?)`),
        1, "paper_trend_buy_1", "BTC_USDT", "50000", "0.01", "0.01", "50000")
    p.setBalance(1, 500) // balance after buy

    sig := Signal{Side: "sell", Price: "55000", Quantity: "0.01"}
    err := p.executeTrendSell(session, sig)
    if err != nil { t.Fatal(err) }

    // Balance should be 500 + 55000*0.01 = 1050
    bal, _ := p.getBalance(1)
    expected := 500.0 + 55000*0.01
    if math.Abs(bal-expected) > 0.01 { t.Errorf("want %.2f got %.2f", expected, bal) }

    // Buy order should be closed
    var status string
    p.db.Get(&status, "SELECT status FROM orders WHERE order_id='paper_trend_buy_1'")
    if status != "closed" { t.Errorf("want closed, got %s", status) }

    // Trade should be inserted with correct PnL
    var pnl string
    p.db.Get(&pnl, "SELECT pnl FROM trades WHERE session_id=1")
    pnlF, _ := strconv.ParseFloat(pnl, 64)
    expectedPnl := (55000.0 - 50000.0) * 0.01
    if math.Abs(pnlF-expectedPnl) > 0.0001 { t.Errorf("want pnl %.4f got %s", expectedPnl, pnl) }

    // Sell order should be inserted
    var sellCount int
    p.db.Get(&sellCount, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='sell'")
    if sellCount != 1 { t.Errorf("want 1 sell order, got %d", sellCount) }
}

func TestTrendSell_SkipsIfNoPosition(t *testing.T) {
    p := setupPaperDB(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}
    sig := Signal{Side: "sell", Price: "55000", Quantity: "0.01"}
    err := p.executeTrendSell(session, sig)
    if err != nil { t.Fatal(err) }
    bal, _ := p.getBalance(1)
    if math.Abs(bal-1000) > 0.01 { t.Errorf("balance should be unchanged, got %.2f", bal) }
}

func TestTrendSell_MultipleBuys_ClosesAll(t *testing.T) {
    p := setupPaperDB(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}
    // Insert two open buys
    p.db.Exec(p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, 'buy', 'market', ?, ?, 'filled', ?, ?)`),
        1, "paper_trend_buy_1", "BTC_USDT", "50000", "0.01", "0.01", "50000")
    p.db.Exec(p.db.Rebind(`INSERT INTO orders (session_id, order_id, symbol, side, type, price, quantity, status, executed_qty, executed_price) VALUES (?, ?, ?, 'buy', 'market', ?, ?, 'filled', ?, ?)`),
        1, "paper_trend_buy_2", "BTC_USDT", "48000", "0.01", "0.01", "48000")
    p.setBalance(1, 20)

    sig := Signal{Side: "sell", Price: "55000", Quantity: "0.01"}
    err := p.executeTrendSell(session, sig)
    if err != nil { t.Fatal(err) }

    // Both buys should be closed
    var openCount int
    p.db.Get(&openCount, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy' AND status='filled'")
    if openCount != 0 { t.Errorf("want 0 open buys, got %d", openCount) }

    // Two trades should be inserted
    var tradeCount int
    p.db.Get(&tradeCount, "SELECT COUNT(*) FROM trades WHERE session_id=1")
    if tradeCount != 2 { t.Errorf("want 2 trades, got %d", tradeCount) }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && go test ./internal/engine/ -run "TestTrendSell" -v
```
Expected: FAIL - executeTrendSell undefined

- [ ] **Step 3: Implement executeTrendSell in paper.go**

```go
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
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && go test ./internal/engine/ -run "TestTrendSell" -v
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```
git add backend/internal/engine/paper.go backend/internal/engine/paper_test.go
git commit -m "feat(trend-paper): add executeTrendSell closes all open buys"
```

---

### Task 3: ExecuteTrend dispatcher + manager branch

**Files:**
- Modify: `backend/internal/engine/paper.go`
- Modify: `backend/internal/engine/manager.go`
- Test: `backend/internal/engine/paper_test.go`

**Interfaces:**
- Consumes: `executeTrendBuy`, `executeTrendSell` (from Tasks 1 & 2)
- Produces: `func (p *PaperEngine) ExecuteTrend(session model.Session, signal Signal) error`

- [ ] **Step 1: Write failing test for manager branch**

```go
func TestManagerBranch_TrendPaper_RoutesToExecuteTrend(t *testing.T) {
    p := setupPaperDB(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT", Strategy: "trend"}
    sig := Signal{Side: "buy", Price: "50000", Quantity: "0.01"}

    // ExecuteTrend should route to executeTrendBuy
    err := p.ExecuteTrend(session, sig)
    if err != nil { t.Fatal(err) }

    var count int
    p.db.Get(&count, "SELECT COUNT(*) FROM orders WHERE session_id=1 AND side='buy' AND status='filled'")
    if count != 1 { t.Errorf("want 1 trend buy order, got %d", count) }
}

func TestManagerBranch_GridPaper_Unaffected(t *testing.T) {
    p := setupPaperDB(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT", Strategy: "grid"}

    // Grid paper uses Execute, not ExecuteTrend — calling Execute should still work
    err := p.executeBuy(session, "50000", "50000", "0.01")
    if err != nil { t.Fatal(err) }

    bal, _ := p.getBalance(1)
    expected := 1000.0 - 50000*0.01
    if math.Abs(bal-expected) > 0.01 { t.Errorf("grid paper broken, want %.2f got %.2f", expected, bal) }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && go test ./internal/engine/ -run "TestManagerBranch" -v
```
Expected: FAIL - ExecuteTrend undefined

- [ ] **Step 3: Add ExecuteTrend dispatcher to paper.go**

```go
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
```

- [ ] **Step 4: Update manager.go ModePaper branch to route trend sessions**

In `manager.go`, find the `case string(model.ModePaper):` block (line 174) and replace:

```go
case string(model.ModePaper):
    for _, sig := range signals {
        if err := m.paper.Execute(session, sig); err != nil {
            slog.Error("paper execute", "session", session.ID, "error", err)
        }
        m.Hub.Broadcast(session.ID, WSSignal{Type: "signal", SessionID: session.ID, Signal: sig})
    }
```

with:

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

- [ ] **Step 5: Run all paper tests**

```
cd backend && go test ./internal/engine/ -run "TestPaper|TestTrend" -v
```
Expected: all PASS

- [ ] **Step 6: Run full engine test suite**

```
cd backend && go test ./internal/engine/ -v
```
Expected: all PASS, no regressions

- [ ] **Step 7: Commit**

```
git add backend/internal/engine/paper.go backend/internal/engine/manager.go backend/internal/engine/paper_test.go
git commit -m "feat(trend-paper): add ExecuteTrend dispatcher and manager branch"
```

---

### Task 4: Manual test pass

**Files:** none (verification only)

- [ ] **Step 1: Start backend**

```
cd backend && go run ./cmd/server/
```

- [ ] **Step 2: Create BTC_USDT trend paper session via UI (beginner mode)**

Navigate to dashboard -> New Session -> Strategy: Trend -> Mode: Paper -> Pair: BTC_USDT -> Horizon: medium -> Capital: 100

- [ ] **Step 3: Start session, observe golden cross buy**

In session detail, start session. Wait for a golden cross signal.
Expected: buy order appears in holdings tab, virtual_balance decremented.

- [ ] **Step 4: Verify second golden cross is ignored**

If another golden cross fires while position is open:
Expected: no new buy order, balance unchanged, debug log "trend: open position exists, skip buy".

- [ ] **Step 5: Wait for death cross, verify sell closes all**

Expected: all open buy orders status=closed, trades tab shows P&L entries, balance incremented.

- [ ] **Step 6: Verify death cross with no position shows alert**

Stop and restart session, trigger a death cross before any golden cross.
Expected: paper_alert type no_asset_to_sell shown in UI.

- [ ] **Step 7: Verify holdings, trades, P&L chart render correctly**

Check dashboard portfolio tab for trend paper session.
Expected: holdings table, trades table, P&L chart all render with correct data.

---
