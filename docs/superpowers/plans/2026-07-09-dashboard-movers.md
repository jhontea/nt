# Dashboard Hot Pairs & Gainers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tampilkan 2 kolom compact di dashboard (`/sessions`) — Top Gainers & Hot Pairs — diambil dari cache real-time Tokocrypto di backend.

**Architecture:** Backend `tokocrypto.Client` sudah memelihara `tickCache` dari WS mini-ticker stream untuk semua pair. Tambah field `%change` ke `Ticker`, method `GetMovers()` yang baca cache + filter `_USDT`/`_IDR` + sort, route `GET /v1/market/movers`, lalu komponen React `MarketMovers` di frontend dengan React Query polling 5 detik.

**Tech Stack:** Go (echo), `@tanstack/react-query`, Next.js App Router, TypeScript.

## Global Constraints

- Pair difilter hanya yang berakhiran `_USDT` atau `_IDR` (sesuai keputusan user).
- Gainers = sort by `PriceChangePercent` desc, Hot = sort by `Volume` desc, masing-masing top 5.
- Data berasal dari WS cache yang sudah ada — TIDAK ada WS/API call baru ke Tokocrypto.
- Cache kosong (cold start) → return array kosong, bukan error.
- Tidak ada dependency baru di frontend (sudah pakai react-query).
- Commit tiap task, pesan `feat:`/`test:`/`fix:`.

---

### Task 1: Add `PriceChangePercent` ke Ticker type (backend)

**Files:**
- Modify: `backend/internal/tokocrypto/types.go:9-16`
- Modify: `backend/internal/tokocrypto/client.go:152-170` (WS stream builder)
- Modify: `backend/internal/tokocrypto/client.go:195-216` (kline fallback builder)

**Interfaces:**
- Consumes: nothing baru.
- Produces: `Ticker.PriceChangePercent string` (json `priceChangePercent`) — dipakai Task 2 & 3.

- [ ] **Step 1: Tambah field ke struct Ticker**

Ganti struct di `types.go`:

```go
type Ticker struct {
	Symbol              string `json:"symbol"`
	LastPrice           string `json:"lastPrice"`
	Volume              string `json:"volume"`
	PriceChange         string `json:"priceChange"`
	PriceChangePercent  string `json:"priceChangePercent"`
	High24h             string `json:"high24h"`
	Low24h              string `json:"low24h"`
}
```

- [ ] **Step 2: Isi persen di WS stream builder** (`client.go` ~line 157, dalam loop `for _, raw := range wrap.Data`)

Ganti blok pembentukan `ticker`:

```go
			priceChange := parseFloat(raw.Close) - parseFloat(raw.Open)
			var pct string
			if open := parseFloat(raw.Open); open != 0 {
				pct = strconv.FormatFloat((priceChange/open)*100, 'f', 2, 64)
			} else {
				pct = "0"
			}
			ticker := &Ticker{
				Symbol:              symbol,
				LastPrice:           raw.Close,
				Volume:              raw.Vol,
				PriceChange:         strconv.FormatFloat(priceChange, 'f', 8, 64),
				PriceChangePercent:  pct,
				High24h:             raw.High,
				Low24h:              raw.Low,
			}
```

- [ ] **Step 3: Isi persen di kline fallback** (`client.go` ~line 201, setelah `priceChange := parseFloat(close_) - parseFloat(open)`)

Ganti blok pembentukan `ticker`:

```go
	priceChange := parseFloat(close_) - parseFloat(open)
	var pct string
	if open := parseFloat(open); open != 0 {
		pct = strconv.FormatFloat((priceChange/open)*100, 'f', 2, 64)
	} else {
		pct = "0"
	}
	ticker := &Ticker{
		Symbol:              symbol,
		LastPrice:           close_,
		Volume:              volume,
		PriceChange:         strconv.FormatFloat(priceChange, 'f', 8, 64),
		PriceChangePercent:  pct,
		High24h:             high,
		Low24h:              low,
	}
```

- [ ] **Step 4: Build untuk verifikasi compile**

Run: `cd backend && go build ./...`
Expected: build sukses tanpa error.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/tokocrypto/types.go backend/internal/tokocrypto/client.go
git commit -m "feat(tokocrypto): add PriceChangePercent to Ticker from WS + kline"
```

---

### Task 2: Implementasi `GetMovers()` di backend

**Files:**
- Modify: `backend/internal/tokocrypto/client.go` (tambah method + struct, setelah `GetTicker`)
- Test: `backend/internal/tokocrypto/client_test.go` (tambah `TestGetMovers_*`)

**Interfaces:**
- Consumes: `c.tickCache` (map[string]cacheEntry), `Ticker.PriceChangePercent`, `Ticker.Volume`.
- Produces:
  ```go
  type Mover struct {
      Symbol             string `json:"symbol"`
      LastPrice          string `json:"lastPrice"`
      PriceChangePercent string `json:"priceChangePercent"`
      Volume             string `json:"volume"`
  }
  type Movers struct {
      Gainers []Mover `json:"gainers"`
      Hot     []Mover `json:"hot"`
  }
  func (c *Client) GetMovers() Movers
  ```

- [ ] **Step 1: Tulis failing test**

Tambah ke `client_test.go`:

```go
func TestGetMovers_FiltersAndRanks(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode([][]any{})
	})

	c.mu.Lock()
	c.tickCache = map[string]cacheEntry{
		"BTC_USDT":  {data: &Ticker{Symbol: "BTC_USDT", LastPrice: "50000", Volume: "100", PriceChangePercent: "5"}, expiresAt: time.Now().Add(time.Minute)},
		"ETH_USDT":  {data: &Ticker{Symbol: "ETH_USDT", LastPrice: "3000", Volume: "500", PriceChangePercent: "-2"}, expiresAt: time.Now().Add(time.Minute)},
		"SOL_USDT":  {data: &Ticker{Symbol: "SOL_USDT", LastPrice: "150", Volume: "50", PriceChangePercent: "12"}, expiresAt: time.Now().Add(time.Minute)},
		"TKO_IDR":   {data: &Ticker{Symbol: "TKO_IDR", LastPrice: "100", Volume: "999", PriceChangePercent: "1"}, expiresAt: time.Now().Add(time.Minute)},
		"BNB_USDT":  {data: &Ticker{Symbol: "BNB_USDT", LastPrice: "600", Volume: "300", PriceChangePercent: "8"}, expiresAt: time.Now().Add(time.Minute)},
		"BTC_BUSD":  {data: &Ticker{Symbol: "BTC_BUSD", LastPrice: "1", Volume: "9999", PriceChangePercent: "50"}, expiresAt: time.Now().Add(time.Minute)},
	}
	c.mu.Unlock()

	m := c.GetMovers()
	if len(m.Gainers) != 5 {
		t.Fatalf("expected 5 gainers, got %d", len(m.Gainers))
	}
	if m.Gainers[0].Symbol != "SOL_USDT" {
		t.Errorf("expected top gainer SOL_USDT, got %s", m.Gainers[0].Symbol)
	}
	if m.Gainers[0].PriceChangePercent != "12" {
		t.Errorf("expected SOL pct 12, got %s", m.Gainers[0].PriceChangePercent)
	}
	if m.Hot[0].Symbol != "TKO_IDR" {
		t.Errorf("expected top hot TKO_IDR (vol 999), got %s", m.Hot[0].Symbol)
	}
	for _, g := range m.Gainers {
		if !strings.HasSuffix(g.Symbol, "_USDT") && !strings.HasSuffix(g.Symbol, "_IDR") {
			t.Errorf("gainer %s not USDT/IDR", g.Symbol)
		}
	}
	// BTC_BUSD harus di-skip (bukan USDT/IDR)
	for _, h := range m.Hot {
		if h.Symbol == "BTC_BUSD" {
			t.Error("BTC_BUSD should be filtered out")
		}
	}
}

func TestGetMovers_EmptyCache(t *testing.T) {
	_, c := setupTickerServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode([][]any{})
	})
	m := c.GetMovers()
	if len(m.Gainers) != 0 || len(m.Hot) != 0 {
		t.Errorf("expected empty movers on cold cache, got g=%d h=%d", len(m.Gainers), len(m.Hot))
	}
}
```

- [ ] **Step 2: Run test untuk verifikasi fail**

Run: `cd backend && go test ./internal/tokocrypto/ -run TestGetMovers -v`
Expected: FAIL — `GetMovers` / `Movers` / `Mover` undefined.

- [ ] **Step 3: Implementasi method + struct**

Tambah di `client.go` (setelah `GetTicker` selesai, sebelum `getKlinesAlt`):

```go
type Mover struct {
	Symbol             string `json:"symbol"`
	LastPrice          string `json:"lastPrice"`
	PriceChangePercent string `json:"priceChangePercent"`
	Volume             string `json:"volume"`
}

type Movers struct {
	Gainers []Mover `json:"gainers"`
	Hot     []Mover `json:"hot"`
}

// GetMovers derives top gainers (by % change) and hot pairs (by volume) from the
// live WS cache. Only USDT/IDR pairs are considered. Returns empty slices if the
// cache is cold.
func (c *Client) GetMovers() Movers {
	c.mu.Lock()
	defer c.mu.Unlock()

	var all []Mover
	for sym, entry := range c.tickCache {
		if !strings.HasSuffix(sym, "_USDT") && !strings.HasSuffix(sym, "_IDR") {
			continue
		}
		t := entry.data
		if t == nil {
			continue
		}
		all = append(all, Mover{
			Symbol:             t.Symbol,
			LastPrice:          t.LastPrice,
			PriceChangePercent: t.PriceChangePercent,
			Volume:             t.Volume,
		})
	}

	gainers := append([]Mover{}, all...)
	sort.SliceStable(gainers, func(i, j int) bool {
		return parseFloat(gainers[i].PriceChangePercent) > parseFloat(gainers[j].PriceChangePercent)
	})
	if len(gainers) > 5 {
		gainers = gainers[:5]
	}

	hot := append([]Mover{}, all...)
	sort.SliceStable(hot, func(i, j int) bool {
		return parseFloat(hot[i].Volume) > parseFloat(hot[j].Volume)
	})
	if len(hot) > 5 {
		hot = hot[:5]
	}

	return Movers{Gainers: gainers, Hot: hot}
}
```

Tambah `"sort"` ke import `client.go` (blok import `strings`, `sync`, `time` dst).

- [ ] **Step 4: Run test untuk verifikasi pass**

Run: `cd backend && go test ./internal/tokocrypto/ -run TestGetMovers -v`
Expected: PASS (kedua test).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/tokocrypto/client.go backend/internal/tokocrypto/client_test.go
git commit -m "feat(tokocrypto): add GetMovers deriving gainers/hot from WS cache"
```

---

### Task 3: Route `GET /v1/market/movers` (backend)

**Files:**
- Modify: `backend/cmd/server/main.go:130` (dekat route `/tickers`)

**Interfaces:**
- Consumes: `tokoClient.GetMovers()` (Task 2).
- Produces: HTTP `200 { gainers: [...], hot: [...] }`.

- [ ] **Step 1: Tambah route setelah handler `/tickers`** (`main.go` setelah line 146)

```go
	v1.GET("/market/movers", func(c echo.Context) error {
		return c.JSON(200, tokoClient.GetMovers())
	})
```

- [ ] **Step 2: Build**

Run: `cd backend && go build ./...`
Expected: build sukses.

- [ ] **Step 3: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "feat(api): add GET /v1/market/movers route"
```

---

### Task 4: Tipe frontend + api call

**Files:**
- Modify: `frontend/src/types/index.ts` (tambah `Mover`, `MoversResponse`)
- Modify: `frontend/src/lib/api.ts:51-52` (tambah `getMovers` ke objek `api`)

**Interfaces:**
- Consumes: endpoint `GET /v1/market/movers` (Task 3).
- Produces: `Mover`, `MoversResponse` types + `api.getMovers()`.

- [ ] **Step 1: Tambah tipe ke `types/index.ts`**

Cari definisi `Ticker` (atau di akhir blok tipe terkait) dan tambah:

```ts
export interface Mover {
  symbol: string
  lastPrice: string
  priceChangePercent: string
  volume: string
}

export interface MoversResponse {
  gainers: Mover[]
  hot: Mover[]
}
```

- [ ] **Step 2: Tambah `getMovers` ke `api`** (`api.ts`, di dalam objek `api`, dekat `getTickersBulk`)

```ts
    getMovers: () => request<import('@/types').MoversResponse>('/v1/market/movers'),
```

- [ ] **Step 3: Typecheck frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: tidak ada error tipe.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat(frontend): add Mover types and getMovers api call"
```

---

### Task 5: Komponen `MarketMovers.tsx`

**Files:**
- Create: `frontend/src/components/sessions/MarketMovers.tsx`

**Interfaces:**
- Consumes: `api.getMovers()`, React Query `useQuery`, `types.Mover`.
- Produces: komponen `<MarketMovers />` — dipakai Task 6.

- [ ] **Step 1: Tulis komponen**

```tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Mover } from '@/types'

function formatVolume(v: string): string {
  const n = parseFloat(v)
  if (!isFinite(n)) return '-'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'
  return n.toFixed(2)
}

function Row({ m }: { m: Mover }) {
  const pct = parseFloat(m.priceChangePercent)
  const up = pct >= 0
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{m.symbol.replace('_', '/')}</span>
      <span className="flex items-center gap-2">
        <span className="text-[#686868] dark:text-[#898989]">${parseFloat(m.lastPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className={`font-semibold ${up ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {up ? '+' : ''}{pct.toFixed(2)}%
        </span>
        <span className="text-[9px] text-[#686868] dark:text-[#898989] w-12 text-right">{formatVolume(m.volume)}</span>
      </span>
    </div>
  )
}

function Column({ title, items }: { title: string; items: Mover[] }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest mb-1">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[#686868] dark:text-[#898989] py-1">Memuat data pasar…</p>
      ) : (
        items.map(m => <Row key={m.symbol} m={m} />)
      )}
    </div>
  )
}

export function MarketMovers() {
  const { data, isLoading } = useQuery({
    queryKey: ['marketMovers'],
    queryFn: api.getMovers,
    refetchInterval: 5000,
    retry: false,
  })

  const gainers = data?.gainers ?? []
  const hot = data?.hot ?? []

  return (
    <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-6 flex flex-wrap gap-6">
      {isLoading && gainers.length === 0 && hot.length === 0 ? (
        <p className="text-xs text-[#686868] dark:text-[#898989]">Memuat data pasar…</p>
      ) : (
        <>
          <Column title="Top Gainers" items={gainers} />
          <div className="w-px bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)]" />
          <Column title="Hot Pairs" items={hot} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/sessions/MarketMovers.tsx
git commit -m "feat(frontend): add MarketMovers component (gainers + hot pairs)"
```

---

### Task 6: Pasang `MarketMovers` di dashboard

**Files:**
- Modify: `frontend/src/app/sessions/page.tsx:9` (import), `:104` (render setelah `<MarketTicker />`)

**Interfaces:**
- Consumes: `<MarketMovers />` (Task 5).
- Produces: tampilan 2 kolom di atas dashboard.

- [ ] **Step 1: Tambah import** (dekat import `MarketTicker`)

```tsx
import { MarketMovers } from '@/components/sessions/MarketMovers'
```

- [ ] **Step 2: Render setelah MarketTicker** (setelah line 104 `<MarketTicker ... />`)

```tsx
        <MarketMovers />
```

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build` (atau `npx tsc --noEmit` jika build berat)
Expected: build/typecheck sukses.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat(dashboard): render MarketMovers above ticker strip"
```

---

## Self-Review

1. **Spec coverage:** field persen (Task 1) ✓, `GetMovers` filter USDT/IDR + sort (Task 2) ✓, route (Task 3) ✓, tipe + api (Task 4) ✓, komponen 2 kolom (Task 5) ✓, pasang di dashboard (Task 6) ✓, empty/cold cache (test Task 2) ✓, error silent (retry:false) ✓.
2. **Placeholder scan:** tidak ada TBD/TODO; setiap step punya code/command.
3. **Type consistency:** `Mover`/`MoversResponse` konsisten di types, api, komponen, dan `Movers`/`Mover` Go konsisten di client.go + test. Method `GetMovers()` signature match antara test, implementasi, dan route.
