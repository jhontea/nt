# Task 3: TokoCrypto Client

## Status: DONE

## Files Created
- `backend/internal/tokocrypto/types.go` — API types (Ticker, Candle, Order, Account)
- `backend/internal/tokocrypto/client.go` — REST client with public + HMAC SHA256 signed endpoints

## Build/Test Summary
- `go build ./cmd/server/` — success, no errors

## Concerns
- API keys in config.go read from env vars (`TOKO_API_KEY`, `TOKO_SECRET_KEY`) — no defaults, as expected for credentials
- `go.mod` missing `sqlx` and `sqlite3` deps used in `internal/repository/db.go`, but not required for this build target

## Report
- File: `.superpowers/sdd/task-3-report.md`
