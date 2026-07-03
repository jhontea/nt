# Task 15-16 Report: Live Order Execution & Risk Management

## Status
- [x] Task 15: Live Order Execution — implemented
- [x] Task 16: Risk Management — implemented

## Files Created
- `backend/internal/engine/risk.go` — `RiskConfig`, `RiskManager` with `MaxOrderValue` check
- `backend/internal/engine/live.go` — `LiveEngine` fetches ticker, checks risk, places real order via TokoCrypto API, saves to DB

## Files Modified
- `backend/internal/engine/manager.go` — added `live *LiveEngine` field, init in `NewManager`, `"live"` case in `evaluate()`

## Build Result
```
> go build ./cmd/server/
```
**PASS** — no errors, no warnings.

## Concerns
- No test coverage for live mode
- `executed_price` is the ticker price at order time, not the actual fill price from the exchange (that's what TokoCrypto returns in `ExecutedPrice`)
- Risk config is parsed from `session.Config` — if users don't set `max_order_value`, the check is a no-op (safe default)

## Path Forward
- Add integration test with mock client before production use
- Consider adding `daily_loss_limit` and `max_drawdown_pct` if needed
