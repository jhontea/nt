# Balance Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grid & trend sessions hanya pakai pair USDT, DCA sessions hanya pakai pair IDR, agar balance live tidak saling berebut.

**Architecture:** Perubahan frontend-only di satu file `CreateSessionForm.tsx`. Backend agnostik terhadap quote asset — pemisahan balance terjadi alami di exchange karena symbol berbeda. Session DCA lama pakai USDT tidak disentuh.

**Tech Stack:** Next.js 16, React 19, TypeScript.

## Global Constraints

- Tidak ada perubahan backend (engine, validator, handler, model, DB).
- Session DCA lama yang pakai USDT pair tetap valid dan berjalan.
- Verifikasi via `npm run build` (TS compile) — tidak ada test framework di frontend.

---

### Task 1: Pisahkan pair per strategi di CreateSessionForm

**Files:**
- Modify: `frontend/src/components/sessions/CreateSessionForm.tsx`

**Interfaces:**
- Consumes: prop `strategy: 'grid' | 'trend' | 'dca'` (sudah ada di komponen).
- Produces: tidak ada — perubahan internal komponen saja.

- [ ] **Step 1: Split konstanta PAIRS jadi USDT_PAIRS dan IDR_PAIRS**

Ganti blok `const PAIRS = [...]` (baris 7-12) dengan:

```ts
const USDT_PAIRS = [
  'BTC_USDT', 'ETH_USDT', 'BNB_USDT', 'SOL_USDT', 'XRP_USDT',
  'ADA_USDT', 'DOGE_USDT', 'DOT_USDT', 'AVAX_USDT', 'MATIC_USDT',
  'LINK_USDT', 'UNI_USDT', 'ATOM_USDT', 'LTC_USDT', 'BCH_USDT',
]

const IDR_PAIRS = [
  'BTC_IDR', 'ETH_IDR', 'BNB_IDR', 'SOL_IDR', 'USDT_IDR',
]
```

- [ ] **Step 2: Default symbol berdasarkan strategi**

Ganti baris 66:

```ts
const [symbol, setSymbol] = useState('BTC_USDT')
```

menjadi:

```ts
const [symbol, setSymbol] = useState(strategy === 'dca' ? 'BTC_IDR' : 'BTC_USDT')
```

- [ ] **Step 3: Ganti dropdown pair agar tampilkan list sesuai strategi**

Ganti blok `<select>` pair (baris 250-257) yang berisi dua `<optgroup>` dengan:

```tsx
<select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" value={symbol} onChange={e => setSymbol(e.target.value)}>
  {(strategy === 'dca' ? IDR_PAIRS : USDT_PAIRS).map(p => <option key={p} value={p}>{p}</option>)}
</select>
```

- [ ] **Step 4: Label "Modal Virtual" ikut strategi**

Ganti baris 271:

```tsx
<label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Modal Virtual (USDT)</label>
```

menjadi:

```tsx
<label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Modal Virtual ({strategy === 'dca' ? 'IDR' : 'USDT'})</label>
```

- [ ] **Step 5: Update help text dca_amount**

Ganti blok `dca_amount` di `fieldHelp` (baris 49-52):

```ts
dca_amount: {
  short: 'Jumlah USDT yang dibelikan setiap interval.',
  long: 'Contoh: 10 berarti bot akan membeli $10 worth of asset setiap interval. Sesuaikan dengan modal. Jangan terlalu besar agar tidak cepat habis.',
},
```

menjadi:

```ts
dca_amount: {
  short: 'Jumlah IDR yang dibelikan setiap interval.',
  long: 'Contoh: 50000 berarti bot akan membeli Rp50.000 worth of asset setiap interval. Sesuaikan dengan modal. Jangan terlalu besar agar tidak cepat habis.',
},
```

- [ ] **Step 6: Update label field "Jumlah (USDT)" di DCA config**

Ganti baris 509:

```tsx
<div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Jumlah (USDT)</span>{renderConfigHelp('dca_amount')}</div>
```

menjadi:

```tsx
<div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Jumlah (IDR)</span>{renderConfigHelp('dca_amount')}</div>
```

- [ ] **Step 7: Update placeholder DCA amount jadi contoh IDR**

Ganti baris 510 placeholder `"10"` menjadi `"50000"`:

```tsx
<input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="50000" value={dcaAmount} onChange={e => setDcaAmount(e.target.value)} />
```

Dan ganti default state `dcaAmount` (baris 75) dari `'10'` menjadi `'50000'`:

```ts
const [dcaAmount, setDcaAmount] = useState('50000')
```

- [ ] **Step 8: Build untuk verifikasi TS compile**

Run: `npm run build` (di dir `frontend`)
Expected: build sukses tanpa error TypeScript.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/sessions/CreateSessionForm.tsx
git commit -m "feat: separate pairs per strategy (grid/trend USDT, DCA IDR)"
```

---

## Manual Testing (setelah implementasi)

1. Form Grid → hanya USDT pairs, default BTC_USDT.
2. Form Trend → hanya USDT pairs.
3. Form DCA → hanya IDR pairs, default BTC_IDR.
4. Paper DCA → label modal virtual "(IDR)", field jumlah "(IDR)".
5. Paper Grid/Trend → label modal virtual "(USDT)".
6. Session DCA lama pakai USDT → masih bisa start/stop normal (tidak terpengaruh).
