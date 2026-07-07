# Postgres-First Architecture and Grid Signal Design

## Status
- Draft approved in conversation
- Ready for implementation planning

## Goals
- Move the backend fully to PostgreSQL as the only primary database.
- Replace ad-hoc SQLite-first runtime assumptions with explicit Postgres configuration.
- Redesign `Grid Signal` so it is understandable for beginners, stateful, auditable, and measurable.
- Make `Grid Signal` outputs explainable: what happened, why it happened, and whether the signal was good.

## Non-Goals
- Migrate existing SQLite data into PostgreSQL.
- Build a full paper/live grid execution engine in this phase.
- Add AI scoring, backtesting engine, or pair ranking system.
- Preserve SQLite as a supported runtime target.

## Scope Overview
This work is split into two implementation phases under one final architecture:

1. **Phase 1: Postgres Foundation**
   - Postgres-only config and connection model
   - startup, migration, and pool tuning
   - removal of SQLite-first assumptions from runtime flow

2. **Phase 2: Grid Signal**
   - beginner-friendly configuration flow
   - stateful grid signal generation
   - automatic signal validation
   - historical storage and summary metrics

---

## Part 1: Postgres-Only Foundation

### Target Environment Variables
Backend will use these `.env` values:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=navisha_trade
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSLMODE=disable
DB_MAX_CONNECTIONS=25
DB_MAX_IDLE_CONNECTIONS=5
```

### Runtime Rules
- PostgreSQL is the only supported primary database.
- Backend startup builds the DSN from the environment variables above.
- SQLite path-based startup logic is removed from the main execution path.
- `repository.NewDB` becomes Postgres-first rather than driver-switching by env.
- Connection pool settings must be explicitly applied.

### DSN Construction
Expected DSN shape:

```text
host=<DB_HOST> port=<DB_PORT> dbname=<DB_NAME> user=<DB_USER> password=<DB_PASSWORD> sslmode=<DB_SSLMODE>
```

### Connection Pool Settings
- `SetMaxOpenConns(DB_MAX_CONNECTIONS)`
- `SetMaxIdleConns(DB_MAX_IDLE_CONNECTIONS)`
- Reasonable defaults apply when env values are missing or invalid.

### Migration Strategy
- Database starts empty.
- Existing schema is created fresh in PostgreSQL.
- No data-copy or backfill logic is needed.
- Existing `Migrate()` function remains the migration mechanism for now.

### Constraints
- Current SQL should remain parameterized and simple.
- Any SQL that is SQLite-specific should be replaced with Postgres-safe equivalents if encountered.
- Existing tests should be updated only where assumptions are SQLite-specific.

---

## Part 2: Grid Signal Product Design

## Product Intent
`Grid Signal` is not an auto-execution grid bot.
It is a **stateful level-based signal engine** that:
- watches a configured price range,
- emits buy/sell signals when grid levels are touched,
- stores those signals,
- validates them automatically after creation,
- and shows whether the setup is useful or noisy.

## What the User Should Get
When a user creates a Grid Signal session, they should eventually see:
- current market price,
- configured upper/lower range,
- grid count and step size,
- latest signal,
- historical signals,
- signal validation status,
- success rate and summary quality metrics.

## Signal Semantics
- Lower-side grid levels are buy candidates.
- Upper-side grid levels are sell candidates.
- A level emits **one signal per touch cycle**.
- A level becomes eligible again only after price moves away and returns.

## Recommended Mode Behavior
Chosen product behavior from discussion:
- **Stateful Grid Signal**
- **One signal per level**
- **Automatic validation by the system**
- **Adaptive recommendations per pair and horizon**

---

## Grid Signal Logic

### Grid Construction
Inputs:
- `upper_price`
- `lower_price`
- `grid_count`
- `quantity`

Derived value:
- `grid_step = (upper_price - lower_price) / grid_count`

Grid levels are generated from lower to upper price.

### Buy/Sell Side Partition
- lower half of levels => buy area
- upper half of levels => sell area
- center acts as neutral transition zone

### One-Signal-Per-Level Rule
Each level has a runtime state:
- `inactive`
- `triggered`

Flow:
- when price touches a valid level, signal is created and level becomes `triggered`
- the same level does not emit repeatedly on every 30-second evaluation
- the level rearms only after price exits the level zone and re-enters later

### Rearm Rule
Level rearm happens after price has clearly moved away from the level and then returned.
This prevents repeated duplicate signals while price hovers at the same level.

---

## Signal Validation Design

### Validation Ownership
Validation is automatic. The user does not mark signals manually.

### Validation States
- `pending`
- `confirmed`
- `invalidated`
- `expired`

### Validation Modes
Chosen product requirement:
- user can choose validation by **percent** or by **grid steps**

Supported config:
- `validation_mode = percent | grid_steps`
- `validation_target_value`
- `validation_invalid_value`
- `validation_window_minutes`

### Default Validation Window
Chosen direction from discussion:
- validation window is **adaptive**, not fixed
- defaults depend on pair class and range behavior

### Adaptive Validation Guidance
- Stable pairs (`BTC_USDT`, `ETH_USDT`, `BNB_USDT`): typically 2-4h
- Mid-volatility pairs (`SOL_USDT`, `DOT_USDT`, `DOGE_USDT`): typically 30-120m
- High-volatility micro-price pairs (`SHIB_USDT`): typically 15-60m

### Validation Completion Rules
Signal starts as `pending`.

It becomes:
- `confirmed` when target is hit first
- `invalidated` when invalid threshold is hit first
- `expired` when neither happens before window ends

### Invalid Threshold Default
Recommended default:
- percent mode => invalid threshold = `target * 0.5`
- grid step mode => invalid threshold = `max(1, floor(target / 2))`

---

## Pair-Specific Recommendation Model

## Pair Classes

### Class A: Large / Relatively Stable
- `BTC_USDT`
- `ETH_USDT`
- `BNB_USDT`

### Class B: Medium / Volatile
- `SOL_USDT`
- `DOT_USDT`
- `DOGE_USDT`

### Class C: Very Volatile / Micro Price
- `SHIB_USDT`

## Horizon Profiles
- `short`
- `medium`
- `long`

## Recommendation Rules

### Class A
- short: range `±5%`, grid `6-8`
- medium: range `±10%`, grid `8-12`
- long: range `±15%`, grid `10-14`

### Class B
- short: range `±7%`, grid `5-8`
- medium: range `±12%`, grid `8-10`
- long: range `±18%`, grid `10-12`

### Class C
- short: range `±10%`, grid `4-6`
- medium: range `±18%`, grid `6-8`
- long: range `±25%`, grid `8-10`

## Price Range Formula
- `upper = currentPrice * (1 + rangePct)`
- `lower = currentPrice * (1 - rangePct)`

## Quantity Recommendation
Beginner mode should prefer `capital` input rather than manual quantity.

Formula:
- `allocationPerGrid = capital / activeGridCount`
- `quantity = allocationPerGrid / currentPrice`

This ensures quantity scales naturally across BTC vs SHIB-like assets.

---

## Data Model

### Session Config
Stored in `sessions.config`:
- `upper_price`
- `lower_price`
- `grid_count`
- `quantity`
- `capital`
- `horizon`
- `validation_mode`
- `validation_target_value`
- `validation_invalid_value`
- `validation_window_minutes`
- `recommendation_profile`

### Runtime State
Stored in memory for phase 1:
- current price
- per-level active/triggered state
- last triggered signal per level
- pending signal references

Reason: runtime state changes too frequently and is not yet worth persisting.

### Historical Signal Storage
New table recommended:
- `strategy_signals`

#### Suggested columns
- `id`
- `session_id`
- `symbol`
- `strategy`
- `signal_type`
- `grid_level_index`
- `grid_level_price`
- `market_price_at_signal`
- `quantity`
- `reason`
- `validation_mode`
- `validation_target_value`
- `validation_invalid_value`
- `validation_window_minutes`
- `validation_status`
- `created_at`
- `validation_started_at`
- `validation_finished_at`
- `result_pct`
- `result_grid_steps`
- `max_favorable_move_pct`
- `max_adverse_move_pct`
- `max_favorable_grid_steps`
- `max_adverse_grid_steps`
- `validation_note`

### Summary Metrics
Phase 1 recommendation:
- do not create a separate summary table yet
- calculate summary metrics from `strategy_signals` queries

Metrics include:
- total signals
- total buy/sell
- pending/confirmed/invalidated/expired counts
- success rate
- average result
- best/worst signal
- latest signal timestamp

---

## Service and Repository Boundaries

### Repository
New repository recommended:
- `StrategySignalRepository`

Responsibilities:
- create signal
- list signals by session
- list pending signals
- update validation result
- query summary metrics

### Domain / Service Layer
- `GridRecommendationService`
  - computes defaults per pair/horizon/capital
- `GridSignalValidator`
  - evaluates pending signals against validation rules

### Engine
- `GridEngine`
  - generates signals from price vs level state
- `Manager`
  - invokes generator and validator on each evaluation cycle

### Validation Execution Strategy
Recommended phase-1 approach:
- validator runs inside existing engine evaluation loop
- no separate scheduler/service process yet

---

## UX Design

## Create Session UX

### Beginner Mode
User provides:
- pair
- horizon
- capital
- validation mode

System auto-fills:
- upper price
- lower price
- grid count
- quantity
- validation window
- validation invalid threshold

### Advanced Mode
User can override:
- upper
- lower
- grid count
- quantity
- validation target
- validation invalid threshold
- validation window

### Recommendation Preview
Before starting, show:
- current market price
- recommended range
- recommended grid count
- estimated step size
- recommended quantity
- chosen validation mode
- chosen validation window
- explanation why those defaults were chosen

Example explanation:
- `BTC_USDT dipilih sebagai pair stabil, jadi range dibuat menengah dan grid lebih rapat agar sinyal cukup sering namun tidak terlalu noisy.`

## Detail Page UX

### Overview section
- current market price
- upper/lower
- grid count
- step size
- validation mode/window
- total signals
- success rate

### Signal History section
- timestamp
- side
- level index
- signal price
- status
- validation result

### Performance section (phase 1 optional)
- summary metrics only
- no advanced charts required yet

---

## Error Handling

### Postgres
- fail fast if Postgres config is invalid
- fail fast if DB connection cannot be opened or pinged
- clear startup logs should show which host/port/database are used (without echoing secrets)

### Grid Signal
- reject invalid range: `upper_price <= lower_price`
- reject invalid grid count: `grid_count <= 0`
- reject invalid quantity/capital
- reject invalid validation window / thresholds
- if recommendation data cannot be generated, user may still switch to advanced/manual mode

### Price Data
- if market price fetch fails, show explicit error to user instead of silent defaulting
- runtime engine should skip evaluation for that tick rather than emit bad signals

---

## Testing Strategy

### Postgres Foundation
- config parsing tests for new env keys
- DSN construction tests
- repository DB initialization tests against Postgres-compatible assumptions
- startup path test where Postgres config is missing/invalid

### Grid Signal Logic
- per-level one-shot signal behavior
- rearm behavior after price exits and re-enters
- correct buy vs sell level partitioning
- validation mode: percent
- validation mode: grid steps
- status transitions: pending -> confirmed / invalidated / expired

### Repository / History
- signal insert
- pending signal query
- validation result update
- summary aggregation query

### UI / Recommendation
- recommendation output differs across pair classes
- quantity calculation from capital
- preview renders expected defaults

---

## Recommended Implementation Order

1. Postgres config model and DSN builder
2. Postgres-only DB startup and pool settings
3. Verify migrations and app boot against fresh Postgres DB
4. Add `strategy_signals` table and repository
5. Add `GridRecommendationService`
6. Add stateful `GridEngine` one-signal-per-level behavior
7. Add automatic validation flow
8. Add frontend beginner/advanced Grid Signal UX
9. Add history + overview UI

---

## Acceptance Criteria

### Postgres
- App starts with only the provided Postgres env config
- SQLite is not required for normal runtime
- Migrations create all required tables in a fresh Postgres DB

### Grid Signal
- Grid Signal sessions can be created with adaptive defaults
- Signal fires once per level, not repeatedly every tick
- Signals are stored historically in Postgres
- Signals are auto-validated with percent or grid-step mode
- Session detail page shows signal history and summary quality metrics
- User can tell whether the session is useful, noisy, or underperforming
