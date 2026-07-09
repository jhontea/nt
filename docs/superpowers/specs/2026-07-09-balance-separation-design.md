# Design: Pemisahan Balance Grid/Trend (USDT) vs DCA (IDR)

**Date:** 2026-07-09  
**Status:** Draft  
**Scope:** Frontend only — tidak ada perubahan backend

---

## Latar Belakang

Saat ini semua strategi (grid, trend, DCA) menggunakan pair USDT secara default di form pembuatan session. Untuk live trading, ini berpotensi menyebabkan kompetisi balance: grid dan DCA sama-sama menarik dari saldo USDT yang sama di TokoCrypto.

Solusi: pisahkan quote asset per strategi di level UI:
- **Grid + Trend** → hanya pair `_USDT`
- **DCA** → hanya pair `_IDR`

Karena pair berbeda menggunakan balance exchange yang berbeda (`USDT` vs `IDR`), pemisahan ini otomatis terjadi tanpa perubahan backend.

---

## Tujuan

1. Grid live + trend live tidak berebut balance USDT dengan DCA live
2. Paper grid + paper trend menggunakan virtual balance USDT
3. Paper DCA menggunakan virtual balance IDR
4. DCA session yang sudah ada (pakai USDT) **tidak disentuh** — dibiarkan berjalan

---

## Pendekatan

**Opsi A — UI only** (dipilih)

Filter pair list di `CreateSessionForm.tsx` berdasarkan strategi. Backend tidak berubah — sudah agnostik terhadap quote asset. Session DCA lama yang pakai USDT pair tetap valid dan berjalan normal.

Tradeoff: tidak ada validasi backend, user bisa bypass via API langsung. Acceptable karena use case normal (via UI) sudah terjaga.

---

## Perubahan

### File: `frontend/src/components/sessions/CreateSessionForm.tsx`

#### 1. Split PAIRS constant

```ts
// Sebelum: satu list PAIRS gabungan
const PAIRS = ['BTC_USDT', ..., 'BTC_IDR', ...]

// Sesudah: dua list terpisah
const USDT_PAIRS = [
  'BTC_USDT', 'ETH_USDT', 'BNB_USDT', 'SOL_USDT', 'XRP_USDT',
  'ADA_USDT', 'DOGE_USDT', 'DOT_USDT', 'AVAX_USDT', 'MATIC_USDT',
  'LINK_USDT', 'UNI_USDT', 'ATOM_USDT', 'LTC_USDT', 'BCH_USDT',
]

const IDR_PAIRS = [
  'BTC_IDR', 'ETH_IDR', 'BNB_IDR', 'SOL_IDR', 'USDT_IDR',
]
```

#### 2. Default symbol per strategi

```ts
// Sebelum
const [symbol, setSymbol] = useState('BTC_USDT')

// Sesudah — default berdasarkan strategi
const [symbol, setSymbol] = useState(strategy === 'dca' ? 'BTC_IDR' : 'BTC_USDT')
```

#### 3. Pair dropdown — tampilkan list sesuai strategi

```tsx
// Sebelum: selalu tampilkan semua pair dengan optgroup USDT/IDR
// Sesudah: tampilkan hanya list yang relevan
const availablePairs = strategy === 'dca' ? IDR_PAIRS : USDT_PAIRS

<select value={symbol} onChange={e => setSymbol(e.target.value)}>
  {availablePairs.map(p => <option key={p} value={p}>{p}</option>)}
</select>
```

#### 4. Label "Modal Virtual" di paper mode

```tsx
// Sebelum: selalu "(USDT)"
<label>Modal Virtual (USDT)</label>

// Sesudah: unit ikut strategi
<label>Modal Virtual ({strategy === 'dca' ? 'IDR' : 'USDT'})</label>
```

#### 5. Help text DCA amount

```ts
// Sebelum
dca_amount: {
  short: 'Jumlah USDT yang dibelikan setiap interval.',
  long: 'Contoh: 10 berarti bot akan membeli $10 worth of asset setiap interval...',
}

// Sesudah
dca_amount: {
  short: 'Jumlah IDR yang dibelikan setiap interval.',
  long: 'Contoh: 50000 berarti bot akan membeli Rp50.000 worth of asset setiap interval...',
}
```

#### 6. Field label "Jumlah (USDT)" di DCA config

```tsx
// Sebelum
<span>Jumlah (USDT)</span>

// Sesudah
<span>Jumlah (IDR)</span>
```

---

## Yang Tidak Berubah

- Semua backend: engine, validator, handler, model, DB schema
- Session DCA lama yang menggunakan USDT pair — tetap valid, tetap berjalan
- Logic paper engine — `virtual_balance` sudah generic, tidak tergantung unit
- Live engine — balance check sudah natural menggunakan quote asset dari symbol

---

## Data Flow (tidak berubah, hanya klarifikasi)

```
Grid/Trend live  →  BTC_USDT  →  exchange pakai saldo USDT
DCA live         →  BTC_IDR   →  exchange pakai saldo IDR
```

Pemisahan balance terjadi secara alami di level exchange karena symbol berbeda → quote asset berbeda.

---

## Testing Manual

1. Buka form buat session Grid → pastikan hanya USDT pairs yang muncul, default BTC_USDT
2. Buka form buat session Trend → pastikan hanya USDT pairs yang muncul
3. Buka form buat session DCA → pastikan hanya IDR pairs yang muncul, default BTC_IDR
4. Paper DCA → label modal virtual menampilkan "(IDR)"
5. Paper Grid/Trend → label modal virtual tetap "(USDT)"
6. Session DCA lama yang pakai USDT → masih bisa start/stop normal
