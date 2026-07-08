# Revamp Dashboard: Overview + Halaman per Strategi

**Tanggal:** 2026-07-08
**Status:** Disetujui (brainstorming)

## Tujuan

Pisah "dashboard" saat ini (`/sessions`, satu halaman raksasa ~1000 baris dengan filter) menjadi:

1. **Overview** (`/sessions`) — hanya ringkasan: market ticker, 3 kartu strategi (Grid/Trend/DCA), dan daftar semua session lintas strategi. Tanpa form create.
2. **Halaman per strategi** (`/sessions/grid`, `/sessions/trend`, `/sessions/dca`) — tiap halaman punya form create yang disesuaikan (tailored) dengan field strategi tersebut, daftar session ter-filter, dan insight spesifik strategi.

Tujuan: tampilan lebih spesifik per fitur, modular di frontend & backend, dan tiap fitur bisa berjalan mandiri nanti.

## Keputusan dari klarifikasi

- **Route:** nested di bawah `/sessions` (bukan `/dashboard` atau root-level).
- **Isi overview:** kartu ringkasan + market ticker + daftar semua session.
- **Form create:** ditaruh di tiap halaman strategi (bukan di overview, bukan modal shared).
- **Backend:** tambah route per-strategi (`/v1/grid/sessions`, dst) agar tiap fitur terisolasi, tanpa rombak arsitektur engine yang sudah modular.

## Arsitektur Frontend

```
app/sessions/page.tsx              → Overview: ticker + 3 StrategyCard + daftar semua session
app/sessions/grid/page.tsx         → Grid: header + CreateSessionForm(strategy="grid") + daftar grid + insight grid
app/sessions/trend/page.tsx        → Trend: header + CreateSessionForm(strategy="trend") + daftar trend + SMA info
app/sessions/dca/page.tsx          → DCA: header + CreateSessionForm(strategy="dca") + daftar dca
app/sessions/[id]/page.tsx         → Detail session (TETAP, tidak berubah)
components/sessions/
  SessionList.tsx                  → daftar session, filter by strategy prop, card start/stop/delete
  StrategyCard.tsx                 → kartu ringkasan di overview (count, running, best P&L)
  CreateSessionForm.tsx            → form; field ber-switch per prop strategy
  MarketTicker.tsx                 → dipakai ulang (sudah ada pola di sessions/page.tsx)
```

- Folder statis `grid|trend|dca` di bawah `app/sessions/` menang precedence atas route dinamis `[id]` di Next.js, sehingga tidak bentrok.
- Navbar `active` diperluas: `'sessions' | 'sessions/grid' | 'sessions/trend' | 'sessions/dca'`.
- Overview tidak punya form create. "+ New Session" di overview → navigate ke `/sessions/grid` (default), atau tiap StrategyCard punya tombol "Buat {Grid}".

## Arsitektur Backend

Echo `v1` group sudah ada. Tambah wrapper `withStrategy(strat, h)` yang inject `strategy` ke context (`c.Set("strategy", strat)`), lalu daftarkan handler session di bawah group per-strategi:

```go
v1Grid := v1.Group("/grid")
v1Grid.GET("/sessions", withStrategy("grid", sessionH.List))
v1Grid.POST("/sessions", withStrategy("grid", sessionH.Create))
// sama untuk /trend, /dca
```

- `List`: baca strategy dari context (fallback query param) → `WHERE strategy = ?`.
- `Create`: override field `strategy` dari context (user tidak bisa salah strategi).
- Endpoint `recommend`/`insights` grid & trend dipindah ke dalam group masing-masing (`/v1/grid/recommend`, `/v1/trend/recommend`). Semantik tidak berubah.
- Route detail `/v1/sessions/:id`, `PATCH/DELETE/start/stop`, dan `ws/sessions/:id` **tetap shared** (session sudah punya tepat 1 strategi).
- `handler/session.go` diubah minimal: `List` & `Create` baca strategy dari context. Handler lain tidak berubah.

## Data Flow

- **Overview:** 1 query `GET /v1/sessions` → hitung KPI (total, running, best P&L per strategi) → render StrategyCard + daftar semua.
- **Halaman strategi:** query `GET /v1/{strategy}/sessions` (filter di backend) → render SessionList + CreateSessionForm. Create → `POST /v1/{strategy}/sessions` (strategy otomatis dari route).
- `useMarketTicker`, `PriceBadge`, `useWS` dipakai ulang.
- Dark mode, `HelpIcon`, validasi, `fetchRecommendation` (grid/trend) dipakai ulang dari implementasi saat ini.

## Error Handling & Testing

- Backend: error handling handler existing tetap. `withStrategy` hanya inject, tidak ubah response. Tambah 1 test: `withStrategy` menghasilkan filter strategi benar pada `List`.
- Frontend: `CreateSessionForm` reuse validasi & logika existing. Verifikasi via `next build` / typecheck. Tanpa framework test baru (YAGNI).
- Tidak ada perubahan skema DB.

## Out of Scope

- Perubahan engine (`engine/grid.go`, `trend.go`, `dca.go`) — sudah modular, tidak disentuh.
- Session detail page (`[id]`) — tetap. (Bisa dikembangkan tampilan spesifik per strategi di masa depan, lewat prop strategy.)
- Skema auth, market page, glossary — tidak berubah.
