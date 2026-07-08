# DCA Stop Loss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah `StopLossPct` ke `DCAConfig` — sell semua posisi kalau harga turun X% dari rata-rata harga beli. Paralel dengan `TakeProfitPct` yang sudah ada.

**Architecture:** Perubahan minimal — satu field baru di config, satu blok kondisi baru di `dca.go:evaluate()`, satu validasi baru, lima test baru, satu field baru di frontend form.

**Tech Stack:** Go (Echo, sqlx), standard `testing` framework, frontend React/Next.js.

## Global Constraints
- Reference spec: `docs/superpowers/specs/2026-07-08-dca-stop-loss-design.md`.
- Run all backend tests with: `cd backend && go test -count=1 ./...` (Makefile target `make test`).
- Run `go vet` after each task: `cd backend && go vet ./...` (Makefile target `make vet`).
- Build before commit: `cd backend && go build ./...`.
- `StopLossPct: 0` = disabled (zero value), backward compatible — session lama tidak berubah behavior.
- Reason string untuk stop loss signal: `"dca_stop_loss"` (snake_case, konsisten dengan `"dca_take_profit"`).
- Per-task commits required. Use `feat:` prefix for new features, `test:` for test-only.
- No emojis in code or commits.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/internal/engine/types.go` | Modify | Tambah `StopLossPct` ke `DCAConfig` |
| `backend/internal/engine/dca.go` | Modify | Tambah blok stop loss di `evaluate()` |
| `backend/internal/validator/session.go` | Modify | Tambah validasi `stop_loss_pct` |
| `backend/internal/engine/dca_test.go` | Modify | Tambah 5 test case baru |
| `frontend/src/...` | Modify | Tambah field `stop_loss_pct` di DCA form + label di detail |

---

## Task 1 — Backend: Tambah `StopLossPct` ke config + engine

**Goal:** Extend `DCAConfig` dan tambah logika stop loss di `evaluate()`.

- [ ] **Step 1: Tambah field ke `DCAConfig`**

Edit `backend/internal/engine/types.go`, tambah setelah `TakeProfitPct`:

```go
type DCAConfig struct {
    IntervalSec   int     `json:"interval_sec"`
    Amount        string  `json:"amount"`
    TakeProfitPct float64 `json:"take_profit_pct"` // sell if price >= avg*(1+pct/100), 0=disabled
    StopLossPct   float64 `json:"stop_loss_pct"`   // sell if price <= avg*(1-pct/100), 0=disabled
}
```

- [ ] **Step 2: Tambah blok stop loss di `dca.go:evaluate()`**

Buka `backend/internal/engine/dca.go`, cari baris `return signals` (setelah blok take profit, sekitar line 103). Tambahkan blok ini sebelum `return signals`:

```go
if cfg.StopLossPct > 0 {
    if avgPrice, ok := d.avgBuyPrice[session.ID]; ok && avgPrice > 0 {
        slTarget := avgPrice * (1 - cfg.StopLossPct/100)
        if currentPrice <= slTarget {
            var totalQty float64
            d.db.Get(&totalQty,
                d.db.Rebind(`SELECT COALESCE(SUM(CAST(quantity AS REAL)), 0) FROM orders
                 WHERE session_id=? AND symbol=? AND side='buy' AND status='filled'`),
                session.ID, session.Symbol)
            if totalQty > 0 {
                qtyStr := strconv.FormatFloat(math.Round(totalQty*1e8)/1e8, 'f', 8, 64)
                signals = append(signals, Signal{
                    Side: string(model.SideSell), Price: priceStr, Quantity: qtyStr, Reason: "dca_stop_loss",
                })
                delete(d.avgBuyPrice, session.ID)
                slog.Info("dca stop-loss", "session", session.ID, "qty", qtyStr, "price", priceStr, "sl_pct", cfg.StopLossPct)
            }
        }
    }
}
```

- [ ] **Step 3: Verifikasi build**

```bash
cd backend && go build ./...
cd backend && go vet ./...
```

- [ ] **Step 4: Commit**

```
feat(dca): add stop_loss_pct to DCAConfig and evaluate logic
```

---

## Task 2 — Backend: Validator

**Goal:** Tolak nilai `stop_loss_pct` yang tidak valid.

- [ ] **Step 1: Cari validator DCA**

```bash
grep -n "dca\|DCA\|TakeProfitPct\|take_profit" backend/internal/validator/session.go
```

Temukan di mana `TakeProfitPct` divalidasi, tambahkan validasi `StopLossPct` di sampingnya:

```go
if cfg.StopLossPct < 0 || cfg.StopLossPct >= 100 {
    e.Add(ErrField("stop_loss_pct", "must be between 0 and 99.99 (0 = disabled)"))
}
```

- [ ] **Step 2: Verifikasi build + vet**

```bash
cd backend && go build ./... && go vet ./...
```

- [ ] **Step 3: Commit**

```
feat(validator): validate stop_loss_pct for DCA config
```

---

## Task 3 — Backend: Tests

**Goal:** 5 test case baru di `dca_test.go`.

- [ ] **Step 1: Tambah test cases**

Buka `backend/internal/engine/dca_test.go`, tambah setelah test yang sudah ada:

**Test 1 — Stop loss trigger:**
```go
func TestDCAEngine_StopLossTriggered(t *testing.T) {
    d, db := setupDCA(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}

    // Simulate 1 filled buy at 50000
    db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
    d.avgBuyPrice[session.ID] = 50000

    // Price drops 15% (threshold at 10%)
    cfg := DCAConfig{IntervalSec: 9999, Amount: "100", StopLossPct: 10}
    signals := d.evaluate(session, cfg, 44000, "44000.00") // 50000 * 0.9 = 45000, 44000 < 45000

    if len(signals) != 1 {
        t.Fatalf("expected 1 sell signal, got %d", len(signals))
    }
    if signals[0].Side != "sell" {
        t.Errorf("expected sell, got %s", signals[0].Side)
    }
    if signals[0].Reason != "dca_stop_loss" {
        t.Errorf("expected reason dca_stop_loss, got %s", signals[0].Reason)
    }
}
```

**Test 2 — Stop loss tidak trigger (belum mencapai threshold):**
```go
func TestDCAEngine_StopLossNotTriggeredAboveThreshold(t *testing.T) {
    d, db := setupDCA(t) //nolint
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}

    db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
    d.avgBuyPrice[session.ID] = 50000

    // Price drops 5% only (threshold at 10%)
    cfg := DCAConfig{IntervalSec: 9999, Amount: "100", StopLossPct: 10}
    signals := d.evaluate(session, cfg, 47500, "47500.00") // 50000 * 0.9 = 45000, 47500 > 45000

    for _, s := range signals {
        if s.Side == "sell" && s.Reason == "dca_stop_loss" {
            t.Error("stop loss should not trigger above threshold")
        }
    }
}
```

**Test 3 — Stop loss disabled (StopLossPct = 0):**
```go
func TestDCAEngine_StopLossDisabledWhenZero(t *testing.T) {
    d, db := setupDCA(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}

    db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
    d.avgBuyPrice[session.ID] = 50000

    cfg := DCAConfig{IntervalSec: 9999, Amount: "100", StopLossPct: 0}
    signals := d.evaluate(session, cfg, 1, "1.00") // extreme price drop, still no SL

    for _, s := range signals {
        if s.Reason == "dca_stop_loss" {
            t.Error("stop loss should be disabled when StopLossPct=0")
        }
    }
}
```

**Test 4 — No double-sell (TP dan SL tidak keduanya trigger):**
```go
func TestDCAEngine_NoDoubleSell_TPAndSL(t *testing.T) {
    d, db := setupDCA(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}

    db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
    d.avgBuyPrice[session.ID] = 50000

    // Both TP and SL configured, price at take-profit level
    cfg := DCAConfig{IntervalSec: 9999, TakeProfitPct: 10, StopLossPct: 10}
    signals := d.evaluate(session, cfg, 56000, "56000.00") // > TP threshold

    sellCount := 0
    for _, s := range signals {
        if s.Side == "sell" {
            sellCount++
        }
    }
    if sellCount > 1 {
        t.Errorf("expected at most 1 sell signal, got %d", sellCount)
    }
}
```

**Test 5 — Stop loss bekerja benar setelah multiple buys:**
```go
func TestDCAEngine_StopLossAfterMultipleBuys(t *testing.T) {
    d, db := setupDCA(t)
    session := model.Session{ID: 1, Symbol: "BTC_USDT"}

    // Two buys: 0.002 @ 50000 and 0.002 @ 40000 -> avg = 45000
    db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        1, "BTC_USDT", "buy", "market", "50000", "0.002", "filled")
    db.Exec("INSERT INTO orders (session_id, symbol, side, type, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        1, "BTC_USDT", "buy", "market", "40000", "0.002", "filled")
    d.avgBuyPrice[session.ID] = 45000 // (50000+40000)/2

    // SL at 10% -> threshold = 45000 * 0.9 = 40500
    cfg := DCAConfig{IntervalSec: 9999, StopLossPct: 10}
    signals := d.evaluate(session, cfg, 40000, "40000.00") // 40000 < 40500

    if len(signals) != 1 || signals[0].Reason != "dca_stop_loss" {
        t.Errorf("expected dca_stop_loss signal, got %v", signals)
    }
    // Check total qty = 0.004
    expectedQty := strconv.FormatFloat(math.Round(0.004*1e8)/1e8, 'f', 8, 64)
    if signals[0].Quantity != expectedQty {
        t.Errorf("expected qty %s, got %s", expectedQty, signals[0].Quantity)
    }
}
```

- [ ] **Step 2: Jalankan tests**

```bash
cd backend && go test -count=1 -run TestDCAEngine ./internal/engine/...
```

Pastikan semua 5 test baru pass dan test lama tidak ada yang pecah.

- [ ] **Step 3: Jalankan semua tests**

```bash
cd backend && go test -count=1 ./...
```

- [ ] **Step 4: Commit**

```
test(dca): add stop loss test cases
```

---

## Task 4 — Frontend: DCA Form + Detail Page

**Goal:** Tambah field `stop_loss_pct` di form create session DCA, dan label di detail page.

- [ ] **Step 1: Cari form DCA di frontend**

```bash
grep -rn "take_profit\|takeProfitPct\|TakeProfitPct\|dca" frontend/src --include="*.tsx" -l
```

Buka file yang ditemukan, cari field `take_profit_pct` atau `TakeProfitPct`.

- [ ] **Step 2: Tambah field `stop_loss_pct` di samping take profit**

Mirror field `take_profit_pct` yang sudah ada, tambah field baru:
- Label: "Stop Loss (%)"
- Hint: "Jual semua jika harga turun X% dari rata-rata harga beli. Kosongkan atau 0 untuk nonaktif."
- Input: `type="number"`, `min="0"`, `max="99.99"`, `step="0.1"`, optional

Pastikan field ini dimasukkan ke dalam payload config JSON saat submit (sama seperti `take_profit_pct`).

- [ ] **Step 3: Tambah label di detail page / order history**

```bash
grep -rn "dca_take_profit\|take_profit\|reason" frontend/src --include="*.tsx" -l
```

Cari di mana `reason` dari order/signal dirender. Tambahkan case untuk `"dca_stop_loss"`:

```tsx
// Contoh — sesuaikan dengan pola yang sudah ada
const reasonLabel: Record<string, string> = {
  dca_interval: "DCA Interval",
  dca_take_profit: "Take Profit",
  dca_stop_loss: "Stop Loss",   // tambah ini
  // ...existing reasons
}
```

- [ ] **Step 4: Commit**

```
feat(frontend): add stop_loss_pct field to DCA form and reason label
```

---

## Verification Checklist

Sebelum declare selesai, pastikan:

- [ ] `go test -count=1 ./...` semua pass
- [ ] `go vet ./...` bersih
- [ ] `go build ./...` sukses
- [ ] Session lama (tanpa `stop_loss_pct`) masih berjalan normal
- [ ] Field `stop_loss_pct: 0` tidak mengubah behavior
- [ ] Signal dengan `reason: "dca_stop_loss"` muncul benar di UI
