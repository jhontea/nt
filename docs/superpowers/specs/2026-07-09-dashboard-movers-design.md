# Design: Dashboard Hot Pairs & Gainers (Fitur A)

Date: 2026-07-09

## Goal

Tampilkan 2 kolom compact di atas dashboard (`/sessions`): **Top Gainers** (kenaikan %
tertinggi) dan **Hot Pairs** (volume 24h tertinggi), diambil dari data real-time
Tokocrypto yang sudah tersedia di in-memory cache backend (WS mini-ticker stream).

Scope terbatas pada Fitur A saja. Fitur B (manage pair list) ditangani di siklus
terpisah.

## Constraint / Fakta Kode Yang Ada

- Backend `tokocrypto.Client` sudah menjalankan `runAllMiniTickerStream()` yang
  populate `tickCache` (TTL 3 detik) untuk **semua** pair aktif via WS
  `wss://stream-cloud.tokocrypto.site/stream?streams=!miniTicker@arr`.
- `Ticker` struct (`backend/internal/tokocrypto/types.go`) punya field:
  `Symbol`, `LastPrice`, `Volume`, `PriceChange` (absolut), `High24h`, `Low24h`.
- Belum ada field persen perubahan harga (`priceChangePercent`).
- WS stream mengirim `o` (open) dan `c` (close) per pair → % bisa dihitung
  `(close-open)/open`.
- Semua endpoint market di `main.go` sudah JWT-auth via grup `v1`.
- Frontend pakai React Query (`@tanstack/react-query`) — lihat `providers.tsx`.

## Design

### 1. Backend

**1a. Tambah field persen ke Ticker** (`types.go`)

```go
type Ticker struct {
    Symbol              string `json:"symbol"`
    LastPrice           string `json:"lastPrice"`
    Volume              string `json:"volume"`
    PriceChange         string `json:"priceChange"`
    PriceChangePercent  string `json:"priceChangePercent"` // NEW
    High24h             string `json:"high24h"`
    Low24h              string `json:"low24h"`
}
```

Isi `PriceChangePercent` di dua tempat yang membangun `Ticker`:
- `runAllMiniTickerStream()` (client.go ~line 158): hitung
  `pct = (close-open)/open * 100`, simpan sebagai string 8-digit.
- `GetTicker()` fallback kline (client.go ~line 203): hitung serupa dari kline
  open/close.

**1b. Method `GetMovers()` di `tokocrypto.Client`** (client.go)

Baca `c.tickCache` (di bawah `c.mu.Lock()`), filter pair yang berakhiran
`_USDT` atau `_IDR`, lalu:
- `gainers`: sort by `PriceChangePercent` desc, ambil top 5.
- `hot`: sort by `Volume` (parse float) desc, ambil top 5.

Return struct:

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
```

`GetTicker` tetap tidak berubah perilaku cache-nya.

**1c. Route baru** (`main.go`, dekat route `/tickers`):

```go
v1.GET("/market/movers", func(c echo.Context) error {
    return c.JSON(200, tokoClient.GetMovers())
})
```

Tidak perlu API key / signed — data publik dari WS stream. JWT guard grup `v1`
sudah menangani auth user.

**1d. Penanganan cache kosong (cold start)**

Jika `tickCache` masih kosong (WS belum push), `GetMovers()` return
`Movers{Gainers: [], Hot: []}` — bukan error. Frontend menangani empty state.

### 2. Frontend

**2a. Tipe** (`frontend/src/types/index.ts`)

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

**2b. API call** (`frontend/src/lib/api.ts`) — tambah ke objek `api`:

```ts
getMovers: () => request<import('@/types').MoversResponse>('/v1/market/movers'),
```

**2c. Komponen `MarketMovers.tsx`** (`frontend/src/components/sessions/`)

- Grid 2 kolom (`grid grid-cols-1 md:grid-cols-2 gap-4`).
- Kiri: judul "Top Gainers", kanan: "Hot Pairs".
- Tiap item: symbol (bold), % change (hijau `+` / merah `-`), last price, dan
  volume kecil di kanan (format singkat, mis. `1.2B`).
- Gunakan React Query `useQuery` dengan `refetchInterval: 5000`.
- Loading: 2 baris skeleton per kolom. Empty: teks "Memuat data pasar…".
- Error: kolom render kosong, dashboard sisanya tetap jalan (query error
  di-silent via `retry: false`).

**2d. Tempatkan di dashboard** (`frontend/src/app/sessions/page.tsx`)

Render `<MarketMovers />` tepat setelah `<MarketTicker />` strip, sebelum
TokoCrypto Account Panel / PerformanceSummary.

### 3. Error Handling & Edge Cases

- WS cold start / disconnect → `GetMovers` return kosong, UI tidak crash.
- API error (mis. 502) → React Query error → komponen render empty, tidak
  memecah render dashboard lainnya.
- Pair tanpa `_USDT`/`_IDR` suffix di-skip (sudah di-filter backend).
- Volume string di-parse aman (default 0) sebelum sort.

### 4. Testing

- Backend unit test `GetMovers()`: seed `tickCache` manual dengan beberapa
  `Ticker` (USDT/IDR + non-qualified), assert `gainers`/`hot` terurut dan
  ter-filter benar, top 5.
- `go build ./...` dan `go test ./internal/tokocrypto/...` sebagai verifikasi.
- Frontend: verifikasi visual manual di `/sessions` (2 kolom muncul, refresh
  5 dtk). Tidak ada framework test baru.

## Out of Scope (Fitur B — nanti)

- Manage pair list (tambah/hapus) di dropdown `CreateSessionForm` & `market/page.tsx`.
- Penyimpanan pair list di DB / settings user.
