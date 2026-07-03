# Task 12: P&L Calculation — Report

**Status**: ✅ Complete

## Changes

| File | Action |
|------|--------|
| `backend/internal/service/pnl_service.go` | Created — PnLService with `GetSessionPnL` |
| `backend/internal/service/session_service.go` | Modified — added `PnL` field, `NewSessionServiceWithPnL` |
| `backend/internal/handler/session.go` | Modified — added `GetPnL` handler |
| `backend/cmd/server/main.go` | Modified — wired PnLService, added `GET /sessions/:id/pnl` |

## Build

`go build ./cmd/server/` — **passes** (no output, exit 0)

## P&L Summary Response

| Field | Source |
|-------|--------|
| `realized_pnl` | `SUM(CAST(pnl AS REAL))` from trades table |
| `unrealized_pnl` | `"0.00"` (not yet implemented — needs open position tracking) |
| `total_pnl` | Same as realized (unrealized = 0) |
| `win_count` / `loss_count` | Sign-based count from trades.pnl |
| `win_rate` | `wins / total * 100` |
| `trade_count` | `COUNT(*)` from trades |
| `balance` | `virtual_balance` from sessions |

## Concerns

- **Unrealized P&L hardcoded to "0.00"** — requires open position tracking (position entry price + current mark price). Add when position model exists.
- **`CAST(pnl AS REAL)`** — assumes pnl is stored as string/numeric. If already REAL, CAST is harmless but redundant.
- **No auth check** — endpoint returns P&L for any session ID the caller knows. Session ownership not verified (consistent with existing `GET /sessions/:id` pattern).

## Path

`GET /api/sessions/:id/pnl` (behind auth middleware)
