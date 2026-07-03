# Task 7 & 8 — Session CRUD + Engine Manager

## Status
Done.

## Files Created
- `backend/internal/repository/session_repo.go` — SessionRepo with CRUD + UpdateStatus
- `backend/internal/service/session_service.go` — SessionService wrapping repo
- `backend/internal/engine/manager.go` — Engine Manager: Start/Stop/evaluate cycles, grid & trend evaluation
- `backend/internal/handler/session.go` — SessionHandler: Create, List, Get, Update, Start, Stop

## Files Modified
- `backend/cmd/server/main.go` — wired SessionHandler, EngineManager, TokoCrypto client; added JWT-protected group with session routes

## Build Result
`go build ./cmd/server/` — success, no errors.
`go vet ./internal/...` — clean.

## Concerns
- No authentication/ownership checks on session GET/UPDATE/START/STOP — any authed user can act on any session ID. Add scoping to `user_id` in service layer if multi-tenant.
- Engine manager has no restart/resume on server restart. Sessions that were "running" at shutdown stay "running" in DB but aren't re-started. Need a restore loop on startup.
- `evaluateSignal` runs every 30s per session — if many sessions run simultaneously, API rate limits on TokoCrypto could be hit. Consider a shared ticker or per-session jitter.
- No graceful shutdown — engine goroutines leak if server is killed. Add context propagation from main.

## Path
All done. Next: paper/live execution mode in engine manager, or order fulfillment.
