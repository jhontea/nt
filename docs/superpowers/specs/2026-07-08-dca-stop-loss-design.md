# DCA Stop Loss Design

## Status
- Draft approved in conversation
- Ready for implementation planning

## Goals
- Tambah `StopLossPct` ke `DCAConfig` — sell semua posisi kalau harga turun X% dari avg buy price.
- Paralel dengan `TakeProfitPct` yang sudah ada: logika identik, kondisi terbalik.
- Berlaku untuk semua mode: signal, paper, live.

## Non-Goals
- `MaxBuyCount` (diputuskan tidak perlu dulu — stop loss sudah jadi safety net yang lebih natural).
- Fix paper↔DCA state sync (deferred — `checkPaperStopConditions` sudah handle skenario balance habis).
- Stop loss berbasis portfolio/session level (sudah ada di `paper.go:CheckStopConditions`, beda scope).

---

## Part 1: Perubahan Config

### `DCAConfig` di `engine/types.go`

Tambah satu field:

```go
type DCAConfig struct {
    IntervalSec   int     `json:"interval_sec"`
    Amount        string  `json:"amount"`
    TakeProfitPct float64 `json:"take_profit_pct"` // sell if price >= avg*(1+pct/100), 0=disabled
    StopLossPct   float64 `json:"stop_loss_pct"`   // sell if price <= avg*(1-pct/100), 0=disabled
}
```

Tidak ada perubahan DB — config disimpan sebagai JSON string di kolom `config` pada tabel `sessions`. Field baru bersifat optional (zero value = disabled), backward compatible.

---

## Part 2: Logic Engine

### `dca.go:evaluate()` — tambah blok stop loss setelah blok take profit

Blok take profit saat ini (lines 83–102):
```go
if cfg.TakeProfitPct > 0 {
    if avgPrice, ok := d.avgBuyPrice[session.ID]; ok && avgPrice > 0 {
        targetPrice := avgPrice * (1 + cfg.TakeProfitPct/100)
        if currentPrice >= targetPrice {
            // query total qty, emit sell signal, delete avgBuyPrice
        }
    }
}
```

Blok stop loss baru — ditambahkan setelah blok take profit, sebelum `return signals`:
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

Logic identik dengan take profit — query total filled qty, emit sell signal, clear avg price state.

### Urutan evaluasi per tick

1. Cek interval beli → mungkin emit buy signal, update `lastBuy` + `avgBuyPrice`
2. Cek take profit → mungkin emit sell signal, clear `avgBuyPrice`
3. Cek stop loss → mungkin emit sell signal, clear `avgBuyPrice`

Catatan: kalau take profit sudah emit sell di langkah 2, `avgBuyPrice` sudah terhapus, jadi langkah 3 tidak akan trigger (`ok` akan false). Tidak ada double-sell.

---

## Part 3: Validator

### `validator/session.go` — extend `DCAConfig` validator

Tambah validasi `StopLossPct`:
```go
if cfg.StopLossPct < 0 || cfg.StopLossPct >= 100 {
    e.Add(ErrField("stop_loss_pct", "must be between 0 and 99.99 (0 = disabled)"))
}
```

Batas atas 99.99 (bukan 100) karena stop loss 100% tidak bermakna — itu berarti jual di harga 0.

---

## Part 4: Testing

### Test cases baru di `dca_test.go`

1. `TestDCAEngine_StopLossTriggered` — harga turun melewati threshold, expect sell signal dengan reason `dca_stop_loss`
2. `TestDCAEngine_StopLossNotTriggeredAboveThreshold` — harga turun tapi belum mencapai threshold, expect no sell
3. `TestDCAEngine_StopLossDisabledWhenZero` — `StopLossPct: 0`, expect no sell even if price tanks
4. `TestDCAEngine_NoDoubleSell_TPAndSL` — kalau take profit sudah trigger, stop loss tidak trigger di tick yang sama
5. `TestDCAEngine_StopLossAfterMultipleBuys` — avg buy price dihitung benar setelah beberapa kali beli, stop loss trigger di harga yang tepat

---

## Part 5: Frontend

### Create session form — DCA config

Tambah field `stop_loss_pct` di form DCA (di samping `take_profit_pct` yang sudah ada):
- Label: "Stop Loss (%)" 
- Hint: "Jual semua jika harga turun X% dari rata-rata harga beli. Kosongkan atau isi 0 untuk nonaktif."
- Input: number, min=0, max=99.99, step=0.1, optional

### Session detail page

Label untuk reason `dca_stop_loss` di history orders/signals — render sebagai "Stop Loss" bukan raw string.

---

## Part 6: Error Handling

- `StopLossPct < 0` → rejected by validator
- `StopLossPct >= 100` → rejected by validator  
- `StopLossPct > 0` tapi `avgBuyPrice` belum ada (belum ada buy sama sekali) → skip, tidak trigger
- DB query gagal saat cek total qty → `totalQty` = 0, tidak emit signal (sama dengan take profit behavior)

---

## Part 7: Acceptance Criteria

- `StopLossPct: 10` → sell semua kalau harga turun 10% dari avg buy price
- `StopLossPct: 0` → tidak ada perubahan behavior (backward compatible)
- Session yang sudah ada tanpa field `stop_loss_pct` → berjalan normal (zero value = disabled)
- Stop loss dan take profit tidak bisa trigger bersamaan dalam satu tick
- Signal yang dihasilkan memiliki `Reason: "dca_stop_loss"` untuk memudahkan filtering di UI
- Validator menolak nilai negatif dan >= 100

---

## Part 8: Implementation Order

1. `engine/types.go` — tambah `StopLossPct` ke `DCAConfig`
2. `engine/dca.go` — tambah blok stop loss di `evaluate()`
3. `validator/session.go` — tambah validasi `StopLossPct`
4. `engine/dca_test.go` — tambah 5 test case baru
5. Frontend — tambah field di DCA form + label di detail page
