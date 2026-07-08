# Dashboard Revamp — Overview + Halaman per Strategi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pisah halaman `/sessions` menjadi overview (ringkasan) + halaman per-strategi (`/sessions/grid`, `/sessions/trend`, `/sessions/dca`) dengan form create yang disesuaikan, dan tambah route backend per-strategi tanpa duplikasi handler.

**Architecture:** Frontend memecah `sessions/page.tsx` (~1000 baris) menjadi komponen bersama (`SessionList`, `SessionCard`, `StrategyCard`, `MarketTicker`, `CreateSessionForm`) + halaman tipis per strategi. Backend menambah wrapper `withStrategy` yang inject `strategy` ke echo context, lalu mendaftarkan `List`/`Create` di bawah group `/v1/{strategy}/sessions`; handler memfilter/override berdasar context.

**Tech Stack:** Next.js (App Router, React, TypeScript, Tailwind), TanStack React Query; Go (Echo, sqlx). Tidak ada dependency baru.

## Global Constraints

- Route frontend: nested di bawah `/sessions` (static `grid|trend|dca`, precedence menang atas `[id]`).
- Overview isi: market ticker + 3 kartu strategi + daftar semua session (lintas strategi). Tanpa form create.
- Form create ditaruh di tiap halaman strategi, disesuaikan field-nya.
- Backend: route per-strategi `/v1/{strategy}/sessions`; handler `List` filter & `Create` override `strategy` dari context. Route detail `/v1/sessions/:id` & `ws` tetap shared.
- Tanpa perubahan skema DB, tanpa perubahan engine (`engine/grid.go` dkk).
- Reuse: `useMarketTicker`, `PriceBadge`, `useWS`, `HelpIcon`, dark mode, validasi, `fetchRecommendation` (grid/trend).
- Verifikasi frontend: `next build`. Backend: `go build ./...` + 1 unit test.

---

### Task 1: Backend — helper filter & `withStrategy` wrapper

**Files:**
- Modify: `backend/internal/handler/session.go` (tambah helper + modifikasi `List`/`Create`)
- Create: `backend/internal/handler/session_strategy_test.go`

**Interfaces:**
- Consumes: `model.Session`, echo context `c.Set("strategy", ...)`.
- Produces: `filterSessionsByStrategy([]model.Session, string) []model.Session` (dipakai Task 1 & diuji).

- [ ] **Step 1: Tambah helper filter (pure, testable)**

Di `session.go`, setelah `reqContext`:
```go
func filterSessionsByStrategy(sessions []model.Session, strategy string) []model.Session {
	if strategy == "" {
		return sessions
	}
	out := make([]model.Session, 0, len(sessions))
	for _, s := range sessions {
		if string(s.Strategy) == strategy {
			out = append(out, s)
		}
	}
	return out
}
```

- [ ] **Step 2: Modifikasi `List` untuk filter dari context**

Ganti isi `List` (baris 85-102) menjadi:
```go
func (h *SessionHandler) List(c echo.Context) error {
	sessions, err := h.svc.List(h.reqContext(c), h.userID(c))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorJSON(err.Error()))
	}
	if strat, ok := c.Get("strategy").(string); ok && strat != "" {
		sessions = filterSessionsByStrategy(sessions, strat)
	}
	type sessionWithStatus struct {
		*model.Session
		IsAlive bool `json:"is_alive"`
	}
	result := make([]sessionWithStatus, len(sessions))
	for i, s := range sessions {
		result[i] = sessionWithStatus{
			Session: &s,
			IsAlive: h.engine.IsRunning(s.ID),
		}
	}
	return c.JSON(http.StatusOK, result)
}
```

- [ ] **Step 3: Modifikasi `Create` untuk override strategy dari context**

Di `Create`, setelah `c.Bind(&req)` dan sebelum validasi, tambahkan:
```go
	if strat, ok := c.Get("strategy").(string); ok && strat != "" {
		req.Strategy = strat
	}
```

- [ ] **Step 4: Tulis test untuk helper filter**

`backend/internal/handler/session_strategy_test.go`:
```go
package handler

import (
	"testing"

	"github.com/user/nt/internal/model"
)

func TestFilterSessionsByStrategy(t *testing.T) {
	sessions := []model.Session{
		{Strategy: model.StratGrid},
		{Strategy: model.StratTrend},
		{Strategy: model.StratGrid},
		{Strategy: model.StratDCA},
	}
	if got := filterSessionsByStrategy(sessions, ""); len(got) != 4 {
		t.Fatalf("empty strategy should return all, got %d", len(got))
	}
	if got := filterSessionsByStrategy(sessions, "grid"); len(got) != 2 {
		t.Fatalf("grid filter should return 2, got %d", len(got))
	}
	if got := filterSessionsByStrategy(sessions, "dca"); len(got) != 1 {
		t.Fatalf("dca filter should return 1, got %d", len(got))
	}
}
```

- [ ] **Step 5: Jalankan test & build**

Run: `cd backend && go test ./internal/handler/ -run TestFilterSessionsByStrategy -v`
Expected: PASS
Run: `cd backend && go build ./...`
Expected: build sukses tanpa error.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/handler/session.go backend/internal/handler/session_strategy_test.go
git commit -m "feat(backend): add strategy context filter helper for per-strategy routes"
```

---

### Task 2: Backend — daftarkan route per-strategi di main.go

**Files:**
- Modify: `backend/cmd/server/main.go` (tambah `withStrategy` + group route)

**Interfaces:**
- Consumes: `sessionH *handler.SessionHandler`, fungsi `sessionH.List`, `sessionH.Create` (signature `func(c echo.Context) error` = `echo.HandlerFunc`).
- Produces: route `/v1/{strategy}/sessions` (GET, POST) untuk `strategy ∈ {grid, trend, dca}`.

- [ ] **Step 1: Tambah fungsi `withStrategy` (sebelum `func main`)**

```go
func withStrategy(strat string, h echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		c.Set("strategy", strat)
		return h(c)
	}
}
```

- [ ] **Step 2: Daftarkan group per-strategi (setelah blok `v1.POST("/sessions", sessionH.Create)` dkk, sekitar baris 153)**

Tambahkan:
```go
	for _, strat := range []string{"grid", "trend", "dca"} {
		g := v1.Group("/" + strat)
		g.GET("/sessions", withStrategy(strat, sessionH.List))
		g.POST("/sessions", withStrategy(strat, sessionH.Create))
	}
```

- [ ] **Step 3: Build**

Run: `cd backend && go build ./...`
Expected: sukses.

- [ ] **Step 4: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "feat(backend): register per-strategy session routes /v1/{strategy}/sessions"
```

---

### Task 3: Frontend — `api.ts` tambah route per-strategi

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: `request<T>`, tipe `import('@/types').Session`.
- Produces: `api.grid.sessions.{list,create}`, `api.trend.sessions.*`, `api.dca.sessions.*`.

- [ ] **Step 1: Tambah blok `sessions` ke dalam `api.grid`, `api.trend`, `api.dca`**

Ganti objek `grid: { ... }`, `trend: { ... }` menjadi:
```ts
  grid: {
    sessions: {
      list: () => request<import('@/types').Session[]>('/v1/grid/sessions'),
      create: (data: { name: string; mode: string; symbol: string; config: string; initial_balance?: number }) =>
        request<import('@/types').Session>('/v1/grid/sessions', { method: 'POST', body: JSON.stringify(data) }),
    },
    recommend: (params: { symbol: string; horizon: string; capital: number; validation_mode?: string }) =>
      request<import("@/types").GridRecommendation>(`/v1/grid/recommend?symbol=${params.symbol}&horizon=${params.horizon}&capital=${params.capital}&validation_mode=${params.validation_mode || "grid_steps"}`),
    insights: (symbol: string) =>
      request<import("@/types").GridInsight[]>(`/v1/grid/insights?symbol=${symbol}`),
  },
  trend: {
    sessions: {
      list: () => request<import('@/types').Session[]>('/v1/trend/sessions'),
      create: (data: { name: string; mode: string; symbol: string; config: string; initial_balance?: number }) =>
        request<import('@/types').Session>('/v1/trend/sessions', { method: 'POST', body: JSON.stringify(data) }),
    },
    recommend: (params: { symbol: string; horizon: string; capital: number }) =>
      request<import("@/types").TrendRecommendation>(`/v1/trend/recommend?symbol=${params.symbol}&horizon=${params.horizon}&capital=${params.capital}`),
  },
  dca: {
    sessions: {
      list: () => request<import('@/types').Session[]>('/v1/dca/sessions'),
      create: (data: { name: string; mode: string; symbol: string; config: string; initial_balance?: number }) =>
        request<import('@/types').Session>('/v1/dca/sessions', { method: 'POST', body: JSON.stringify(data) }),
    },
  },
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: tidak ada error tipe.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add per-strategy session API endpoints"
```

---

### Task 4: Frontend — ekstrak komponen bersama

**Files:**
- Create: `frontend/src/components/sessions/MarketTicker.tsx`
- Create: `frontend/src/components/sessions/SessionCard.tsx`
- Create: `frontend/src/components/sessions/SessionList.tsx`
- Create: `frontend/src/components/sessions/StrategyCard.tsx`

**Interfaces:**
- Consumes: `import('@/types').Session`, `PriceBadge`, `HelpIcon`, icons lucide.
- Produces: komponen reusable untuk Task 5-8.

- [ ] **Step 1: `MarketTicker.tsx`** — pindahkan blok ticker (sessions/page.tsx:481-497) verbatim ke komponen:
```tsx
'use client'
import { PriceBadge } from '@/components/PriceBadge'

export function MarketTicker() {
  return (
    <div className="relative flex items-center gap-3 bg-white dark:bg-[#1e201c] rounded-[24px] px-5 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-8 overflow-x-auto shadow-[0_1px_4px_rgba(14,15,12,0.04)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
      <span className="text-[10px] font-bold text-[#9fe870] tracking-widest uppercase flex-shrink-0 flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-[#9fe870] animate-pulse" />
        Live
      </span>
      <div className="w-px h-4 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)] flex-shrink-0" />
      <div className="flex gap-5">
        <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">BTC</span><PriceBadge symbol="BTC_USDT" compact /></div>
        <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
        <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">ETH</span><PriceBadge symbol="ETH_USDT" compact /></div>
        <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
        <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">BNB</span><PriceBadge symbol="BNB_USDT" compact /></div>
        <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
        <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">SOL</span><PriceBadge symbol="SOL_USDT" compact /></div>
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-[#1e201c] to-transparent rounded-r-[24px] pointer-events-none" />
    </div>
  )
}
```

- [ ] **Step 2: `SessionCard.tsx`** — pindahkan fungsi `SessionCard` (sessions/page.tsx:912-1022) verbatim ke file ini, ubah signature props jadi `export function SessionCard({ session, onStart, onStop, onDelete, onDetail }: {...})` (sudah sama). Import `PriceBadge`, icons (`Grid2x2, TrendingUp, Coins, Zap, FileText, BarChart2, X`) dari lucide.

- [ ] **Step 3: `SessionList.tsx`**
```tsx
'use client'
import { Bot, Grid2x2, TrendingUp, Coins } from 'lucide-react'
import { SessionCard } from './SessionCard'
import type { Session } from '@/types'

export function SessionList({ sessions, strategy, onStart, onStop, onDelete, onDetail }: {
  sessions: Session[]
  strategy: 'all' | 'grid' | 'trend' | 'dca'
  onStart: (id: number) => void
  onStop: (id: number) => void
  onDelete: (id: number) => void
  onDetail: (id: number) => void
}) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 rounded-[24px] bg-[rgba(159,232,112,0.1)] dark:bg-[rgba(159,232,112,0.08)] flex items-center justify-center mx-auto mb-4 text-[#163300] dark:text-[#9fe870]">
          {strategy === 'all' ? <Bot size={28} /> : strategy === 'grid' ? <Grid2x2 size={28} /> : strategy === 'trend' ? <TrendingUp size={28} /> : <Coins size={28} />}
        </div>
        <p className="text-[#0e0f0c] dark:text-[#e8ebe6] text-lg font-bold">
          {strategy === 'all' ? 'Belum ada session' : `Belum ada session ${strategy === 'grid' ? 'Grid' : strategy === 'trend' ? 'Trend' : 'DCA'}`}
        </p>
        <p className="text-[#686868] dark:text-[#898989] text-sm mt-1">Klik "+ New Session" untuk membuat session pertama</p>
      </div>
    )
  }
  const paperRunning = sessions.filter(s => s.mode === 'paper' && s.status === 'running').length
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Sessions · {sessions.length}</h2>
        {paperRunning > 0 && (
          <span className="text-xs font-semibold bg-[rgba(159,232,112,0.12)] text-[#163300] dark:text-[#9fe870] px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse inline-block" />
            {paperRunning} paper running
          </span>
        )}
      </div>
      <div className="space-y-3">
        {sessions.map(s => (
          <SessionCard key={s.id} session={s} onStart={onStart} onStop={onStop} onDelete={onDelete} onDetail={onDetail} />
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 4: `StrategyCard.tsx`** — pindahkan `OverviewPanel` (sessions/page.tsx:76-161) menjadi komponen yang menerima `sessions` & `onOpen(strategy)`:
```tsx
'use client'
import { Grid2x2, TrendingUp, Coins } from 'lucide-react'
import type { Session } from '@/types'

const STRATS = [
  { key: 'grid' as const, label: 'Grid', icon: <Grid2x2 size={16} />, color: 'rgba(159,232,112,0.12)', textColor: 'text-[#163300] dark:text-[#9fe870]', borderColor: 'border-[rgba(159,232,112,0.25)]' },
  { key: 'trend' as const, label: 'Trend', icon: <TrendingUp size={16} />, color: 'rgba(56,200,255,0.1)', textColor: 'text-[#0994b3] dark:text-[#5dd8f5]', borderColor: 'border-[rgba(56,200,255,0.2)]' },
  { key: 'dca' as const, label: 'DCA', icon: <Coins size={16} />, color: 'rgba(255,209,26,0.1)', textColor: 'text-[#7a5f00] dark:text-[#f5c842]', borderColor: 'border-[rgba(255,209,26,0.2)]' },
] as const

export function StrategyCards({ sessions, onOpen }: { sessions: Session[]; onOpen: (s: 'grid' | 'trend' | 'dca') => void }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest mb-3">Overview per Strategi</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STRATS.map(strat => {
          const stratSessions = sessions.filter(s => s.strategy === strat.key)
          if (stratSessions.length === 0) return null
          const running = stratSessions.filter(s => s.status === 'running').length
          const paperSessions = stratSessions.filter(s => s.mode === 'paper')
          const signalSessions = stratSessions.filter(s => s.mode === 'signal')
          const bestBalance = paperSessions.reduce((best, s) => { const bal = s.virtual_balance ?? 0; return bal > best ? bal : best }, 0)
          const bestInitial = paperSessions.find(s => (s.virtual_balance ?? 0) === bestBalance)?.initial_balance ?? 1000
          const bestPct = bestInitial > 0 ? ((bestBalance - bestInitial) / bestInitial) * 100 : 0
          return (
            <button key={strat.key} onClick={() => onOpen(strat.key)}
              className={`bg-white dark:bg-[#1e201c] rounded-[20px] p-4 text-left border ${strat.borderColor} hover:shadow-[0_4px_16px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center`} style={{ background: strat.color }}>{strat.icon}</span>
                  <span className={`text-sm font-bold ${strat.textColor}`}>{strat.label}</span>
                </div>
                {running > 0 && (<span className="flex items-center gap-1 text-[10px] font-bold text-[#9fe870]"><span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />{running} running</span>)}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div><p className="text-[#686868] dark:text-[#898989]">Total</p><p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{stratSessions.length}</p></div>
                <div><p className="text-[#686868] dark:text-[#898989]">Paper</p><p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{paperSessions.length}</p></div>
                <div><p className="text-[#686868] dark:text-[#898989]">Signal</p><p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{signalSessions.length}</p></div>
              </div>
              {paperSessions.length > 0 && bestBalance > 0 && (
                <div className="border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] pt-2.5">
                  <p className="text-[10px] text-[#686868] dark:text-[#898989] mb-1">Best Paper Balance</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-[#0e0f0c] dark:text-[#e8ebe6]">${bestBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className={`text-[10px] font-bold ${bestPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>{bestPct >= 0 ? '+' : ''}{bestPct.toFixed(1)}%</span>
                  </div>
                </div>
              )}
              <p className={`text-[10px] font-semibold mt-2.5 ${strat.textColor}`}>Lihat {strat.label} →</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: tidak ada error (komponen belum dipakai, tapi tipe valid).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/sessions
git commit -m "feat(frontend): extract shared session components (ticker, cards, list)"
```

---

### Task 5: Frontend — `CreateSessionForm` komponen (strategy-aware)

**Files:**
- Create: `frontend/src/components/sessions/CreateSessionForm.tsx`

**Interfaces:**
- Consumes: `api.grid.sessions.create` / `api.trend.sessions.create` / `api.dca.sessions.create` (Task 3), `api.grid.recommend`, `api.grid.insights`, `api.trend.recommend`, `HelpIcon`, `PriceBadge`.
- Produces: komponen form dengan prop `strategy: 'grid'|'trend'|'dca'`, `onCreated: () => void`.

- [ ] **Step 1: Buat `CreateSessionForm.tsx`**

Pindahkan SELURUH state + logika form dari `sessions/page.tsx` (baris 282-434 untuk state/handler, dan JSX form 513-857) ke dalam:
```tsx
'use client'
import { useState, useEffect } from 'react'
import { HelpIcon } from '@/components/HelpIcon'
import { useRouter } from 'next/navigation'
import { GraduationCap, Settings, X } from 'lucide-react'
import { api } from '@/lib/api'

export function CreateSessionForm({ strategy, onCreated }: { strategy: 'grid' | 'trend' | 'dca'; onCreated: () => void }) {
  const router = useRouter()
  // --- salin verbatim state dari sessions/page.tsx:282-312 (name, mode, symbol, upperPrice, lowerPrice, gridCount, quantity, fastPeriod, slowPeriod, trendInterval, dcaInterval, dcaAmount, dcaTakeProfit, dcaStopLoss, initialBalance, stopLossPct, takeProfitPct, currentPrice, priceLoading, priceError, isBeginner, horizon, capital, validationMode, recommendation, insights, nameEdited, creating) ---
  // --- salin verbatim helpers: calcGridDefaults, fetchPriceAndApply, fetchRecommendation (gunakan api.{strategy}.sessions.create untuk create) ---
  // --- salin verbatim handleCreate, handleStart/Stop/Delete tidak perlu (list menangani) ---
  // Di handleCreate, ganti api.sessions.create dengan:
  //   const createFn = strategy === 'grid' ? api.grid.sessions.create : strategy === 'trend' ? api.trend.sessions.create : api.dca.sessions.create
  //   await createFn({ name, mode, symbol, config: JSON.stringify({...}), ...(mode==='paper'?{initial_balance}:{}) })
  //   onCreated()
  // --- salin verbatim JSX form (513-857) TANPA selector strategi (hapus <select strategy>) dan tanpa tombol pembungkus showCreate ---
  // Navigation: symbol field, PAIRS array, fieldHelp, modeHelp, strategyHelp, DEFAULT_BOUNDARY_PCT ikut disalin.
}
```

Catatan ekstraksi:
- `strategy` sudah ditentukan oleh prop → hapus state `strategy` dan `<select>` strategi; ganti semua `strategy` variabel dengan prop `strategy`.
- `fetchRecommendation` memanggil `api.grid.recommend` / `api.trend.recommend` berdasar `strategy` prop.
- Form dikembalikan langsung (tanpa slide-down wrapper `showCreate`); halaman strategi yang mengatur visibility jika perlu.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/sessions/CreateSessionForm.tsx
git commit -m "feat(frontend): extract strategy-aware CreateSessionForm component"
```

---

### Task 6: Frontend — rewrite overview `/sessions/page.tsx`

**Files:**
- Modify: `frontend/src/app/sessions/page.tsx` (tulis ulang jadi overview)

**Interfaces:**
- Consumes: `StrategyCards`, `SessionList`, `MarketTicker` (Task 4), `api.sessions.list`, `useAuth`, `Navbar`.
- Produces: halaman overview (ticker + kartu + daftar semua). Tombol "+ New Session" → navigate ke `/sessions/grid`.

- [ ] **Step 1: Tulis ulang `page.tsx`**
```tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { StrategyCards } from '@/components/sessions/StrategyCard'
import { SessionList } from '@/components/sessions/SessionList'
import { Bot } from 'lucide-react'

export default function SessionsOverviewPage() {
  const { logout, isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])
  const { data: sessions, isLoading, refetch } = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list, enabled: isAuthenticated })
  const stats = sessions ? { total: sessions.length, running: sessions.filter(s => s.status === 'running').length } : { total: 0, running: 0 }

  async function handleStart(id: number) { await api.sessions.start(id); refetch() }
  async function handleStop(id: number) { await api.sessions.stop(id); refetch() }
  async function handleDelete(id: number) { if (!confirm('Hapus session ini?')) return; await api.sessions.delete(id); refetch() }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Dashboard</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">{stats.total} session{stats.total !== 1 ? 's' : ''}{stats.running > 0 ? <> · <span className="text-[#9fe870] font-semibold">{stats.running} running</span></> : ''}</p>
          </div>
          <button onClick={() => router.push('/sessions/grid')} className="px-5 py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)]">+ New Session</button>
        </div>
        <MarketTicker />
        {sessions && sessions.length > 0 && <StrategyCards sessions={sessions} onOpen={(s) => router.push(`/sessions/${s}`)} />}
        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : (
          <SessionList sessions={sessions ?? []} strategy="all" onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
        )}
      </div>
    </div>
  )
}
```
(Tambahkan `import { useEffect } from 'react'` — sudah termasuk `useEffect` di import react: ganti baris import pertama jadi `import { useEffect } from 'react'`).

- [ ] **Step 2: Typecheck & build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: sukses.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat(frontend): rewrite /sessions as overview dashboard"
```

---

### Task 7: Frontend — halaman per-strategi (grid, trend, dca)

**Files:**
- Create: `frontend/src/app/sessions/grid/page.tsx`
- Create: `frontend/src/app/sessions/trend/page.tsx`
- Create: `frontend/src/app/sessions/dca/page.tsx`

**Interfaces:**
- Consumes: `CreateSessionForm` (Task 5), `SessionList`, `MarketTicker` (Task 4), `api.{strategy}.sessions.list`, `Navbar`.
- Produces: 3 halaman strategi.

- [ ] **Step 1: `grid/page.tsx`**
```tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { SessionList } from '@/components/sessions/SessionList'
import { CreateSessionForm } from '@/components/sessions/CreateSessionForm'
import { Grid2x2 } from 'lucide-react'

export default function GridPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])
  const { data: sessions, isLoading, refetch } = useQuery({ queryKey: ['grid-sessions'], queryFn: api.grid.sessions.list, enabled: isAuthenticated })
  async function handleStart(id: number) { await api.sessions.start(id); refetch() }
  async function handleStop(id: number) { await api.sessions.stop(id); refetch() }
  async function handleDelete(id: number) { if (!confirm('Hapus session ini?')) return; await api.sessions.delete(id); refetch() }
  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions/grid" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-10 h-10 rounded-[14px] bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870] flex items-center justify-center"><Grid2x2 size={20} /></span>
          <div><h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Grid Trading</h1><p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Pasang order beli & jual di level harga</p></div>
        </div>
        <MarketTicker />
        <CreateSessionForm strategy="grid" onCreated={() => refetch()} />
        {isLoading ? <div className="py-8 animate-pulse text-[#686868] dark:text-[#898989] text-sm">Memuat...</div> : (
          <SessionList sessions={sessions ?? []} strategy="grid" onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `trend/page.tsx`** — salin `grid/page.tsx`, ganti: `api.grid.sessions.list` → `api.trend.sessions.list`, `strategy="grid"` → `"trend"`, icon `Grid2x2` → `TrendingUp`, judul "Trend Following" + desc "Deteksi tren dengan SMA crossover", `Navbar active="sessions/trend"`.

- [ ] **Step 3: `dca/page.tsx`** — salin `grid/page.tsx`, ganti: `api.grid.sessions.list` → `api.dca.sessions.list`, `strategy="grid"` → `"dca"`, icon `Grid2x2` → `Coins`, judul "DCA" + desc "Beli rutin berkala (Dollar Cost Average)", `Navbar active="sessions/dca"`.

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: sukses, route `/sessions/grid`, `/sessions/trend`, `/sessions/dca` ter-build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/sessions/grid frontend/src/app/sessions/trend frontend/src/app/sessions/dca
git commit -m "feat(frontend): add per-strategy pages grid/trend/dca"
```

---

### Task 8: Frontend — perbarui Navbar active highlighting

**Files:**
- Modify: `frontend/src/components/Navbar.tsx`

**Interfaces:**
- Consumes: prop `active?: string`.
- Produces: highlight "Sessions" untuk semua sub-path `/sessions*`.

- [ ] **Step 1: Ubah tipe `active` & logika highlight**

Ganti signature `active?: 'sessions' | 'market' | 'glossary'` menjadi `active?: string`. Pada ketiga tombol (desktop + mobile), ganti kondisi `active === 'sessions'` menjadi `active === 'sessions' || (active ?? '').startsWith('sessions/')`.

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: sukses.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Navbar.tsx
git commit -m "feat(frontend): highlight Sessions nav for all strategy sub-pages"
```

---

### Task 9: Final verification

**Files:** semua.

- [ ] **Step 1: Backend build & test**

Run: `cd backend && go build ./... && go test ./internal/handler/ -run TestFilterSessionsByStrategy`
Expected: build OK, test PASS.

- [ ] **Step 2: Frontend build**

Run: `cd frontend && npm run build`
Expected: sukses, semua route ke-build.

- [ ] **Step 3: Smoke (manual, jika server jalan)** — buka `/sessions` (overview), klik kartu → `/sessions/grid`, buat session grid → muncul di list & `GET /v1/grid/sessions` filter benar.

- [ ] **Step 4: Commit final (jika ada sisa)**

```bash
git add -A && git commit -m "chore: final verification dashboard revamp" || echo "nothing to commit"
```
