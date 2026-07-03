# Task 13 Report: Dashboard Portfolio

## Status
✅ Complete

## Commits
No commits — not requested.

## Files Changed
- `frontend/src/lib/api.ts` — Added `sessions.getPnL()` method calling `GET /api/sessions/:id/pnl`
- `frontend/src/app/sessions/[id]/page.tsx` — Added P&L summary cards (balance, realized P&L, total P&L, win rate, trade count) fetched via `useQuery`

## Concerns
- No orders endpoint exists yet on the backend, so the orders table was skipped as directed
- PnL values come as strings from the API (`realized_pnl`, `total_pnl`); parsed with `parseFloat` for color logic
- `pnl.balance` may be absent if backend omits it; falls back to `'0.00'`
- Only shows loading spinner for session, not for PnL (shows separate "Loading P&L..." text)

## Path
`frontend/src/app/sessions/[id]/`
