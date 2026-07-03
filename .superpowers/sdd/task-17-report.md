# Task 17: WebSocket Real-Time Updates

## Status: Done

## Files Changed

### Backend
- `backend/internal/engine/ws.go` — Created: WSHub, WSSignal/WSUpdate types, WebSocket upgrade handler
- `backend/internal/engine/manager.go` — Modified: Added `Hub *WSHub` field, broadcasts on signal/trade in all 3 modes
- `backend/cmd/server/main.go` — Modified: Creates wsHub, wires to engine, registers `GET /ws/sessions/:id`
- `backend/go.mod` / `backend/go.sum` — Modified: Added `github.com/gorilla/websocket`

### Frontend
- `frontend/src/lib/useWS.ts` — Created: `useSessionWS` hook with auto-reconnect
- `frontend/src/app/sessions/[id]/page.tsx` — Modified: Added WS listener that invalidates PnL query on signal
- `frontend/.env.local` — Modified: Added `NEXT_PUBLIC_WS_URL`

## Build Results
- `go build ./cmd/server/` — Pass
- `go vet ./...` — Pass  
- `npx tsc --noEmit` — Pass

## Design Notes
- Moved WSHub to `engine` package to avoid import cycle (engine → handler → engine)
- WS endpoint is public (no auth) — session ID is in URL; auth can be added later if needed
- Reconnect is 3s fixed delay; exponential backoff would be more robust for production
- PnL auto-refreshes via query invalidation on `signal` events; no PnL broadcast yet

## Concerns
- Global `CheckOrigin: true` — acceptable for dev, lock down in production
- No write timeout on websocket — slow clients could block broadcast
