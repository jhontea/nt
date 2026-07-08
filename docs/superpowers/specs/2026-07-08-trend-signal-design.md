# Trend Signal Design (Parity with Grid Signal)

## Status
- Draft approved in conversation
- Ready for implementation planning

## Goals
- Bring `Trend Signal` to feature parity with `Grid Signal`: beginner-friendly, stateful, auditable, measurable.
- Add adaptive SMA crossover recommendations per pair class and horizon (9 presets).
- Add stateful cross tracking to prevent repeated signals during sideways chop.
- Add automatic validation for trend signals using combined percent-move and SMA-hold rules.
- Reuse the existing `strategy_signals` table and repository without schema migrations.

## Non-Goals
- Rename `grid_*` columns to `marker_*` (deferred until a 4th strategy appears).
- Multi-timeframe confirmation, EMA, MACD, or alternative indicators (upgrade path later).
- Backtesting engine or pair ranking system.
- Migration of historical trend signals (none exist in `strategy_signals` yet).

---

## Part 1: Conceptual Background

### What is Trend Signal?
A trend-following strategy that emits buy/sell signals based on momentum shifts
detected via SMA crossover, instead of price touching static grid levels.

### SMA (Simple Moving Average)
Arithmetic mean of the last N close prices:
```
SMA(N) = (P1 + P2 + ... + PN) / N
```

- **Fast SMA** (short period, e.g. 10): reacts quickly, more sensitive, more noise.
- **Slow SMA** (long period, e.g. 50): smooths price action, confirms long-term trend.

### Crossover Signals
- **Golden Cross**: fast SMA crosses above slow SMA -> **BUY** (uptrend begins).
- **Death Cross**: fast SMA crosses below slow SMA -> **SELL** (downtrend begins).

### Comparison with Grid Signal

| Aspect | Grid Signal | Trend Signal |
|---|---|---|
| Philosophy | Range-bound: buy low, sell high at static levels | Trend-following: follow momentum |
| Ideal market | Sideways / ranging | Trending (clear up or down) |
| Trigger | Price touches grid level | SMA crossover at last candle |
| Frequency | Depends on grid density & range width | Depends on SMA sensitivity & interval |
| Stateful | Yes (one-signal-per-level) | Yes (after this work: one-signal-per-cross) |
| Validation | Auto (pending/confirmed/invalidated/expired) | Auto (after this work) |
| History in `strategy_signals` | Yes | Yes (after this work) |
| Recommendation per pair | Yes (`RecommendGrid`) | Yes (after this work: `RecommendTrend`) |
| Capital-based quantity | Yes | Yes (after this work) |
| Summary metrics | Yes | Yes (after this work) |
| Backward compat (orders table) | Yes | Yes (after this work) |

Current state of `trend.go` is stateless and minimal: it only inspects the last
two candles for a crossover and saves signals to the legacy `orders` table only.
This design brings it to grid parity.

---

## Part 2: Architecture

### Approach
**Pendekatan A: Paralel ke Grid.** Add trend-specific modules in the same
positions where grid equivalents already live. Reuse `strategy_signals` table
without renaming `grid_*` columns; trend reinterprets those fields.

### Components

| Location | Change |
|---|---|
| `engine/types.go` | Extend `TrendConfig` with `Capital`, `Interval`, `Horizon`, `ValidationMode`, `ValidationTargetValue`, `ValidationInvalidValue`, `ValidationWindowMinutes` |
| `engine/recommend.go` | Add `trendFastMap`, `trendSlowMap`, `trendIntervalMap`, `trendWindowMap`, `trendTargetPctMap`, `trendInvalidPctMap` + `RecommendTrend()` + `TrendRecommendation` struct |
| `engine/trend.go` | Make `TrendEngine` stateful: per-session `lastCrossType` tracking; one signal per cross cycle |
| `engine/validator.go` | Add `TrendValidator` with `ValidatePendingTrend()` implementing percent + SMA hold |
| `engine/manager.go` | Branch in `evaluate()` and `run()`: call `saveTrendSignals` and `validatePendingTrendSignals` for `StratTrend + ModeSignal` |
| `repository/signal_repo.go` | No changes: reuse `Create`, `ListPending`, `UpdateValidation` |
| `model/models.go` | No structural changes; trend reinterprets existing fields |
| `validator/session.go` | Extend `TrendConfig` validation to accept new fields; horizon/interval optional in advanced mode |
| Frontend | Trend beginner/advanced form (pair/horizon/capital -> SMA recommendation); detail page branching for trend-specific labels |

### TrendEngine stateful cross tracking

```go
type TrendEngine struct {
    client *tokocrypto.Client
    mu     sync.Mutex
    states map[int64]*trendSessionState
}

type trendSessionState struct {
    lastCrossType string // "golden" | "death" | ""
}
```

Anti-noise rule:
- Golden cross signal fires **only if** `lastCrossType != "golden"`.
- After firing, set `lastCrossType = "golden"`.
- Rearm happens only when a death cross fires (and vice versa).
- This prevents repeated golden-cross signals while price oscillates near the slow SMA during sideways chop.

`Reset(sessionID)` clears state on session restart, mirroring `GridEngine.Reset` at `manager.go:71`.

---

## Part 3: Recommendation Model

### Pair Classes (reuse from grid, `recommend.go:47-55`)
- `PairClassStable`: BTC_USDT, ETH_USDT, BNB_USDT
- `PairClassVolatile`: SOL_USDT, DOT_USDT, DOGE_USDT
- `PairClassMicropPrice`: SHIB_USDT

### Horizon Profiles (reuse, `recommend.go:19-23`)
- `short`, `medium`, `long`

### Trend Preset Table (9 combinations)

| Class | Horizon | Fast | Slow | Interval | Validation Window |
|---|---|---|---|---|---|
| Stable | short | 10 | 30 | 15m | 4h (240m) |
| Stable | medium | 20 | 50 | 1h | 12h (720m) |
| Stable | long | 50 | 200 | 4h | 48h (2880m) |
| Volatile | short | 7 | 21 | 5m | 2h (120m) |
| Volatile | medium | 10 | 30 | 15m | 6h (360m) |
| Volatile | long | 20 | 50 | 1h | 24h (1440m) |
| Micro | short | 5 | 15 | 5m | 1h (60m) |
| Micro | medium | 7 | 21 | 15m | 4h (240m) |
| Micro | long | 10 | 30 | 1h | 12h (720m) |

Rationale:
- Stable pairs move quietly -> longer SMA periods to filter noise.
- Volatile / micro pairs swing harder -> shorter SMA periods to catch swings faster.
- Short horizon = faster interval & shorter window; long horizon = slower interval & longer window.

### Validation Defaults (per horizon, applies to trend)

| Horizon | Target % | Invalid % |
|---|---|---|
| short | 1.0 | 0.5 |
| medium | 2.0 | 1.0 |
| long | 5.0 | 2.5 |

`invalid = target * 0.5`, consistent with grid percent mode.

### Capital -> Quantity
Trend does not split capital across levels like grid. One signal -> one order.
```
quantity = capital / currentPrice
```
Conservative assumption: only one position open at a time per trend session.

### `RecommendTrend()` signature

```go
func RecommendTrend(symbol string, currentPrice float64, horizon Horizon, capital float64) (*TrendRecommendation, error)

type TrendRecommendation struct {
    Symbol                  string
    CurrentPrice            float64
    FastPeriod              int
    SlowPeriod              int
    Interval               string  // "5m","15m","1h","4h"
    Quantity                string
    ValidationMode          ValidationMode // always "percent" for trend
    ValidationTargetValue  float64
    ValidationInvalidValue  float64
    ValidationWindowMinutes int
    Reason                  string
}
```

### Example reason string
```
"BTC_USDT diklasifikasikan stabil, horizon medium: SMA 20/50 pada interval 1h, evaluasi 12h - cocok untuk trend following jangka menengah"
```

---

## Part 4: Validation Logic

### Validation ownership
Validation is automatic. The user does not mark signals manually. Same as grid.

### Validation states
`pending` -> `confirmed` | `invalidated` | `expired`

### Combined percent + SMA hold rule

For each pending trend signal, on every tick:

```
elapsed = now - created_at
if elapsed >= window:
    status = expired
    return

move_pct = (currentPrice - signal_price) / signal_price * 100
// for BUY: favorable = up, adverse = down
// for SELL: favorable = down, adverse = up (negate move_pct)

recompute sma_fast & sma_slow on the latest candle batch
sma_held = (buy  AND sma_fast > sma_slow)
        OR (sell AND sma_fast < sma_slow)

track max_favorable_move_pct and max_adverse_move_pct each tick

decision rules:
  if buy:
    if move_pct >= target_pct:
      if sma_held: confirmed
      else: invalidated, note = "percent hit but SMA reversed"
    elif move_pct <= -invalid_pct:
      invalidated
  if sell:
    if -move_pct >= target_pct:
      if sma_held: confirmed
      else: invalidated, note = "percent hit but SMA reversed"
    elif -move_pct <= -invalid_pct: // i.e. price moved up
      invalidated
```

### Decision matrix

| Condition | Result |
|---|---|
| Target % reached AND SMA still aligned | `confirmed` |
| Target % reached BUT SMA reversed | `invalidated` (false breakout) |
| Invalid % reached first | `invalidated` |
| Window ends without either | `expired` |

### Tracking fields (reuse)
- `max_favorable_move_pct`, `max_adverse_move_pct` -> update each tick
- `result_grid_steps`, `max_favorable_grid_steps`, `max_adverse_grid_steps` -> set `0` for trend (not applicable)
- `validation_note` -> reason if invalidated before window end

### `TrendValidator` implementation

```go
// engine/validator.go (extend existing file)

type TrendValidator struct {
    client *tokocrypto.Client
}

func (v *TrendValidator) ValidatePendingTrend(
    ctx context.Context,
    pending []model.StrategySignal,
    config TrendConfig,
) []ValidationResult
```

Difference from grid validator: trend needs to re-fetch candles to inspect SMA,
whereas grid only needs the ticker. One HTTP request per tick per session.
(Caching across ticks is YAGNI for phase 1.)

### Manager loop integration

```go
// in manager.run() loop, after evaluate():
if fresh.Strategy == string(model.StratTrend) && fresh.Mode == string(model.ModeSignal) {
    m.validatePendingTrendSignals(fresh)
}
```

Same pattern as `validatePendingSignals` for grid at `manager.go:137`.

---

## Part 5: Data Model & Persistence

### Reuse `strategy_signals` table (no migration)

Column reinterpretation for trend rows:

| Column | Grid meaning | Trend meaning |
|---|---|---|
| `grid_level_index` | level grid index | `0` (trend has no levels) |
| `grid_level_price` | price of grid level | price at cross (equals `market_price_at_signal`) |
| `validation_mode` | "percent" or "grid_steps" | always "percent" |
| `validation_target_value` | % or step target | % target |
| `validation_invalid_value` | % or step invalid | % invalid |
| `validation_window_minutes` | window | window |
| `result_pct` | % move after signal | % move after signal |
| `result_grid_steps` | steps moved | `0` (n/a) |
| `max_favorable_grid_steps` | best favorable steps | `0` (n/a) |
| `validation_note` | note | note + SMA status |
| `reason` | "grid_buy_level_3" | "golden_cross" or "death_cross" |

Ponytail comment required in code:
```go
// ponytail: trend pakai kolom grid_* sebagai marker*, 0 untuk grid-only fields.
// Rename ke marker_* saat strategi ke-4 muncul.
```

### `saveTrendSignals()` in `manager.go` (parallel to `saveGridSignals`)

1. Parse `TrendConfig` (including validation fields).
2. For each signal: extract cross type from `sig.Reason`.
3. Build `&model.StrategySignal{...}` with trend interpretation.
4. `signalRepo.Create(...)`.
5. Also save to `orders` table for backward compatibility with existing UI (mirror `saveGridSignals` final step).

---

## Part 6: UX Design

### Create Session - Beginner Mode (Trend)

User input:
- Pair (dropdown)
- Horizon (short/medium/long)
- Capital (USDT)

System auto-fills (from `RecommendTrend`):
- Fast period, slow period, interval candle
- Quantity (capital / price)
- Validation target %, invalid %, window minutes

Recommendation preview:
```
Pair: BTC_USDT (stabil)
Horizon: Medium -> SMA 20/50, interval 1h
Modal: $100 -> Quantity: 0.00143 BTC
Validasi: target +2%, invalid -1%, window 12h
Alasan: "BTC_USDT stabil, horizon medium: SMA 20/50 pada 1h, evaluasi 12h"
```

### Create Session - Advanced Mode

User override:
- Fast period, slow period, interval candle
- Quantity (manual, not from capital)
- Validation target %, invalid %, window

### Detail Page - trend-specific labels

Overview section:
- Current market price
- Fast SMA value, slow SMA value, spread (visual: fast above/below slow)
- Interval candle
- Total signals, success rate

Signal history table columns:
- Waktu
- Sisi (buy/sell)
- Cross Type (golden/death cross)
- Harga
- Status (pending/confirmed/invalidated/expired)
- Result %

Performance summary: success rate, best/worst signal.

### Frontend branching
If `session.strategy === "trend"`, render trend-specific labels.
If `session.strategy === "grid"`, render grid labels.
One shared detail page component with conditional sections per strategy.

---

## Part 7: Error Handling

### Trend Signal
- Reject invalid `fast_period < 2`.
- Reject `slow_period < fast_period + 2`.
- Reject `slow_period > 200`.
- Reject `quantity <= 0` (when capital not provided).
- Reject invalid `interval` (must be one of "5m","15m","1h","4h").
- Reject invalid validation window / thresholds.
- If recommendation data cannot be generated, allow advanced/manual mode.

### Price / Candle Data
- If candle fetch fails, skip evaluation for that tick instead of emitting bad signals.
- If insufficient candles (< slowPeriod), skip evaluation and log a warning, no signals.

### Validation
- If re-fetching candles during validation fails, skip validation for that tick (leave signals pending).
- Never mark a signal invalidated/confirmed without successful candle fetch.

---

## Part 8: Testing Strategy

### TrendEngine logic
- Golden cross detection (existing test extended for stateful behavior).
- Death cross detection (existing test extended for stateful behavior).
- No cross -> no signal.
- Insufficient data -> no signal.
- One-signal-per-cross: same cross repeated in subsequent ticks does not fire again.
- Rearm: opposite cross rearms the original direction.

### SMA helper
- Existing `TestSMA` covers basic correctness.
- Add edge case: period equals sample size.

### Recommendation
- `RecommendTrend` output differs across pair classes.
- `RecommendTrend` output differs across horizons.
- Quantity calculation from capital matches `(capital / price)` rounded to 8 decimals.
- Interval string is valid for all presets.

### Validator
- Confirmed: target hit, SMA still aligned.
- Invalidated by SMA reversal: target hit, SMA crossed back.
- Invalidated by adverse move: invalid % hit first.
- Expired: window elapsed without target or invalid.
- Tracking: `max_favorable_move_pct` and `max_adverse_move_pct` accumulate correctly.
- Validation note set correctly on invalidation.

### Repository / History
- `saveTrendSignals` inserts into `strategy_signals`.
- `saveTrendSignals` also inserts into `orders` for backward compat.
- Pending trend signals listed correctly by `ListPending`.
- Validation result updates correctly via `UpdateValidation`.

### Manager integration
- `manager.run` calls `saveTrendSignals` for `StratTrend + ModeSignal`.
- `manager.run` calls `validatePendingTrendSignals` for `StratTrend + ModeSignal`.
- Restart clears `TrendEngine` state (analog to `GridEngine.Reset` at `manager.go:71`).

### UI / Recommendation
- Recommendation output differs across pair classes.
- Beginner form auto-fills SMA periods from horizon selection.
- Preview renders expected defaults.
- Detail page renders trend-specific labels when strategy is trend.

---

## Part 9: Implementation Order

1. **Backend types & recommendation**
   - Extend `TrendConfig` struct in `engine/types.go`.
   - Add preset maps and `RecommendTrend` in `engine/recommend.go`.
   - Extend `TrendConfig` validator in `validator/session.go`.

2. **Backend stateful engine**
   - Make `TrendEngine` stateful with `lastCrossType` tracking.
   - Add `Reset` and `getOrCreateState` helpers.
   - Update existing tests for stateful behavior.

3. **Backend signal persistence**
   - Add `saveTrendSignals` in `manager.go`.
   - Wire `StratTrend + ModeSignal` branch in `manager.evaluate`.

4. **Backend validator**
   - Add `TrendValidator` and `ValidatePendingTrend` in `engine/validator.go`.
   - Add `validatePendingTrendSignals` in `manager.go`.
   - Wire `StratTrend + ModeSignal` validation call in `manager.run`.

5. **Backend tests (parity with grid)**
   - Tests for stateful cross tracking.
   - Tests for `RecommendTrend` across all 9 presets.
   - Tests for `TrendValidator` all four outcomes.
   - Tests for `saveTrendSignals` DB insert.

6. **Frontend create session**
   - Add beginner/advanced trend form.
   - Wire `RecommendTrend` API call for preview.
   - Submit creates trend session with recommended config.

7. **Frontend detail page**
   - Branch on `strategy` for trend-specific labels.
   - Render SMA values, cross type, trend metrics.

8. **Manual test pass**
   - Create BTC_USDT trend session (beginner).
   - Start session, observe signals.
   - Verify validation outcomes over time.
   - Verify summary metrics render.

---

## Part 10: Acceptance Criteria

- Trend Signal sessions can be created with adaptive defaults from pair/horizon/capital.
- `TrendEngine` is stateful: same cross repeat does not emit duplicate signals.
- Opposite cross rearms the original direction.
- Trend signals are stored in `strategy_signals` (with trend reinterpretation of `grid_*` columns).
- Trend signals are also stored in `orders` for backward UI compat.
- Trend signals are auto-validated using percent + SMA hold rules.
- Validation states transition correctly: pending -> confirmed | invalidated | expired.
- Validation note explains invalidation reason when applicable.
- `max_favorable_move_pct` and `max_adverse_move_pct` accumulate during pending state.
- Session detail page shows trend signal history and summary quality metrics.
- User can tell whether the trend session is useful, noisy, or underperforming.
- Restart clears `TrendEngine` state (no stale cross tracking).
- Insufficient candle data skips evaluation without crashing.
- Candle fetch failure skips validation for that tick without crashing.