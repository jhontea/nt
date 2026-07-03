# Task 11: Paper Trading Engine

## Status: Complete

## Files Created
- `backend/internal/engine/paper.go` — PaperEngine struct with Execute(), executeBuy(), executeSell(), getBalance(), setBalance()

## Files Modified
- `backend/internal/engine/manager.go` — Added `paper *PaperEngine` field, refactored `evaluateSignal()` to return `[]Signal`, added paper mode case in `evaluate()`
- `backend/internal/model/models.go` — Added `VirtualBalance *float64` to Session struct
- `backend/internal/repository/db.go` — Added ALTER TABLE migration for `virtual_balance REAL DEFAULT 0`

## Build
`go build ./cmd/server/` — **passes** with no errors

## Implementation Summary
- **signal mode**: `evaluateSignal()` returns signals; `evaluate()` calls `saveSignals()` — unchanged behavior
- **paper mode**: `evaluateSignal()` returns signals; `evaluate()` calls `paper.Execute()` for each signal
- Paper buys: deduct virtual balance, insert "filled" order at market price
- Paper sells: FIFO match with earliest open buy, calculate P&L, mark buy "closed", insert sell order + trade record
- `getBalance`/`setBalance` use raw SQL with `sql.NullFloat64` (handles NULL for existing sessions)

## Concerns
- Single-threaded FIFO matching (adequate for paper, upgrade per-symbol queues if throughput matters)
- No virtual_balance initialization for new paper sessions (defaults to NULL → treated as 0, which prevents any buy)
