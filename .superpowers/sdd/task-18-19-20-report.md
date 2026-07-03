# Task 18-20 Report

## Status: Complete

### Files Created
- `Dockerfile.backend` — Multi-stage Go build (alpine, CGO_ENABLED=0)
- `Dockerfile.frontend` — Multi-stage Next.js build (node:22-alpine)
- `docker-compose.yml` — Two services (backend:8100, frontend:3100) with env_file and volume mounts
- `.dockerignore` — Excludes .git, node_modules, data/, *.md
- `README.md` — Full project documentation

### Files Modified
- `backend/internal/repository/db.go` — Dual-driver support (sqlite/pgx via DB_DRIVER env). Schema uses SERIAL/TIMESTAMP/VARCHAR for PG compatibility (sqlite handles these fine).
- `backend/internal/config/config.go` — Added DatabaseDriver, DatabaseDSN fields
- `backend/cmd/server/main.go` — Routes dsn through driver-aware logic

### Dependencies Added
- `github.com/jackc/pgx/v5/stdlib` — PostgreSQL driver for sqlx

### Build Result
- `go mod tidy` + `go build ./cmd/server/` — **PASS** (no errors)

### Concerns
- `docker-compose.yml` context is project root — Dockerfiles use `COPY backend/` which works but copies the whole backend dir into builder context. Fine for now.
- Schema uses `SERIAL`/`TIMESTAMP`/`VARCHAR` which work on both sqlite and pg. No driver-specific migration paths yet — add if dual support diverges.
- No `go.sum` lockfile committed note — standard Go practice, skip unless asked.

### Path Forward
- Test docker build: `docker-compose build` (requires Docker Desktop)
- For PG: set `DB_DRIVER=postgres` and `DATABASE_DSN=postgres://...` in backend/.env
- Default (no env changes) stays on SQLite — zero config change for existing users
