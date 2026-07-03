# Trading Bot Implementation Plan

**Goal:** Build personal trading bot with Next.js frontend + Go backend, TokoCrypto API integration, signal → paper → live phases.

**Architecture:** Go monolith with clean internal packages (handler → service → repository), Echo router, sqlx DB. Next.js 16 App Router frontend. SQLite first, PostgreSQL later.

**Tech Stack:** Go 1.26.4, Echo v4, sqlx, Next.js 16, TypeScript, SQLite, JWT (3h expiry)

---

## Fase 1 — Signal Mode (Tasks 1-10)

### Task 1: Project Scaffolding
**Files:**
- Create: `backend/go.mod`
- Create: `backend/cmd/server/main.go`
- Create: `backend/internal/config/config.go`
- Create: `backend/.env.example`
- Create: `frontend/package.json`, `frontend/next.config.ts`
- Create: `frontend/.env.local`

### Task 2: Database Setup
**Files:**
- Create: `backend/internal/model/models.go`
- Create: `backend/internal/repository/db.go`
- Create: `backend/migrations/001_init.sql`

### Task 3: TokoCrypto Client — Market Data
**Files:**
- Create: `backend/internal/tokocrypto/client.go`
- Create: `backend/internal/tokocrypto/types.go`
- Methods: `GetTicker(symbol)`, `GetCandles(symbol, interval, limit)`

### Task 4: Authentication
**Files:**
- Create: `backend/internal/handler/auth.go`
- Create: `backend/internal/middleware/auth.go`
- Create: `backend/internal/service/auth_service.go`
- Create: `backend/internal/repository/user_repo.go`
- Endpoints: `POST /api/auth/register`, `POST /api/auth/login`

### Task 5: Grid Strategy Engine (Signal)
**Files:**
- Create: `backend/internal/engine/types.go`
- Create: `backend/internal/engine/grid.go`
- Produces: `GridConfig`, `GridEngine.Evaluate(config, price) → []Signal`

### Task 6: Trend Strategy Engine (Signal)
**Files:**
- Create: `backend/internal/engine/trend.go`
- Produces: `TrendConfig`, `TrendEngine.Evaluate(candles, config) → []Signal`

### Task 7: Session Management
**Files:**
- Create: `backend/internal/handler/session.go`
- Create: `backend/internal/service/session_service.go`
- Create: `backend/internal/repository/session_repo.go`
- Endpoints: CRUD sessions, start/stop

### Task 8: Engine Manager
**Files:**
- Create: `backend/internal/engine/manager.go`
- Manages goroutine lifecycle per session

### Task 9: Route Registration
**Files:**
- Modify: `backend/cmd/server/main.go`
- Wire all repos, services, handlers, engine

### Task 10: Next.js Frontend
**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/auth.tsx`
- Create: `frontend/src/app/page.tsx` (dashboard)
- Create: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/app/sessions/page.tsx`
- Create: `frontend/src/app/sessions/[id]/page.tsx`
- Create: `frontend/src/components/SignalTable.tsx`
- Create: `frontend/src/components/SessionForm.tsx`

---

## Fase 2 — Paper Trading (Tasks 11-14)

### Task 11: Virtual Balance & Order Simulation
**Files:**
- Create: `backend/internal/engine/paper.go`

### Task 12: P&L Calculation
**Files:**
- Create: `backend/internal/service/pnl_service.go`

### Task 13: Dashboard Portfolio
**Files:**
- Modify: `frontend/src/app/sessions/[id]/page.tsx`
- Create: `frontend/src/components/PnLChart.tsx`
- Create: `frontend/src/components/PortfolioCard.tsx`

### Task 14: Telegram Notifications
**Files:**
- Create: `backend/internal/service/notifier.go`

---

## Fase 3 — Live Trading (Tasks 15-17)

### Task 15: Real Order Execution
**Files:**
- Modify: `backend/internal/tokocrypto/client.go` (add PlaceOrder, CancelOrder)
- Modify: `backend/internal/engine/manager.go` (live mode)

### Task 16: Risk Management
**Files:**
- Create: `backend/internal/engine/risk.go`

### Task 17: WebSocket Real-Time
**Files:**
- Create: `backend/internal/handler/ws.go`
- Create: `frontend/src/lib/useWS.ts`

---

## Fase 4 — Production (Tasks 18-20)

### Task 18: Docker Setup
**Files:**
- Create: `Dockerfile.backend`
- Create: `Dockerfile.frontend`
- Create: `docker-compose.yml`

### Task 19: PostgreSQL Migration
**Files:**
- Modify: `backend/internal/repository/db.go`

### Task 20: Final Polish & README
**Files:**
- Create: `README.md`
