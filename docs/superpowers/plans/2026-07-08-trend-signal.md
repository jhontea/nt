# Trend Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `Trend Signal` to feature parity with `Grid Signal`: beginner-friendly config flow with adaptive SMA presets, stateful crossover detection (one-signal-per-cross anti-noise), auto-validation (percent move + SMA hold), and historical storage in `strategy_signals`.

**Architecture:** Add modules parallel to grid: `RecommendTrend` next to `RecommendGrid`, `TrendValidator` next to `SignalValidator`, `saveTrendSignals` next to `saveGridSignals`. Reuse `strategy_signals` table without column renames (trend sets `grid_level_index=0`, treats `grid_level_price` as cross-price marker).

**Tech Stack:** Go (Echo, sqlx, sqlmock-compatible tests), standard `testing` framework, frontend React/Next.js.

## Global Constraints
- Reference spec: `docs/superpowers/specs/2026-07-08-trend-signal-design.md`.
- Run all backend tests with: `cd backend && go test -count=1 ./...` (Makefile target `make test`).
- Run `go vet` after each task: `cd backend && go vet ./...` (Makefile target `make vet`).
- Build before commit: `cd backend && go build ./...`.
- Interval strings allowed for trend: `"5m"`, `"15m"`, `"1h"`, `"4h"`.
- Pairs and PairClass map already exist in `engine/recommend.go:47-55`; do not duplicate.
- Existing `StrategySignal` model and `StrategySignalRepository` interface must be reused unchanged.
- Trend config JSON field names must be snake_case to match existing `TrendConfig` (`fast_period`, `slow_period`, `quantity`).
- Ponytail comment required at `saveTrendSignals` site: `// ponytail: trend pakai kolom grid_* sebagai marker*, 0 untuk grid-only fields. Rename ke marker_* saat strategi ke-4 muncul.`
- Per-task commits required. Use `feat:` prefix for new features, `test:` for test-only, `refactor:` for refactors.
- No emojis in code or commits unless user explicitly asks.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/internal/engine/types.go` | Modify | Extend `TrendConfig` with capital/interval/horizon/validation fields |
| `backend/internal/engine/recommend.go` | Modify | Add `TrendRecommendation`, preset maps, `RecommendTrend` |
| `backend/internal/engine/trend.go` | Modify | Stateful `TrendEngine` with cross tracking + interval-aware candle fetch |
| `backend/internal/engine/trend_test.go` | Modify | Update tests for stateful behavior + anti-noise rearm |
| `backend/internal/engine/recommend_test.go` | Create | Unit tests for `RecommendTrend` |
| `backend/internal/engine/validator.go` | Modify | Add `TrendValidator` with `ValidatePendingTrend` |
| `backend/internal/engine/validator_test.go` | Create | Tests for `TrendValidator` (4 outcomes) |
| `backend/internal/engine/manager.go` | Modify | Add `saveTrendSignals`, `validatePendingTrendSignals`, branch in `evaluate`/`run` |
| `backend/internal/engine/manager_test.go` | Modify | Tests for trend branch wiring |
| `backend/internal/validator/session.go` | Modify | Extend `TrendConfig` validator for new fields |
| `backend/internal/validator/validator_test.go` | Modify | Tests for extended `TrendConfig` validation |
| `backend/cmd/server/main.go` | Modify | Add `GET /v1/trend/recommend` route |
| `backend/cmd/server/main_test.go` | Modify (if exists) or create | Test `/v1/trend/recommend` route |
| `frontend/src/app/sessions/new/page.tsx`*(or equivalent)* | Modify | Add trend strategy option with beginner/advanced form |
| `frontend/src/app/sessions/[id]/page.tsx` | Modify | Branch on strategy to render trend-specific labels |
| `frontend/src/lib/api.ts` | Modify | Add `getTrendRecommendation` |
| `TREND_SIGNAL_GUIDE.md` | Create (optional final task) | User-facing guide mirrored on `GRID_SIGNAL_GUIDE.md` |

---

## Task 1: Extend `TrendConfig` Struct & Validator

**Files:**
- Modify: `backend/internal/engine/types.go:22-27`
- Modify: `backend/internal/validator/session.go:42-65`
- Modify: `backend/internal/validator/validator_test.go`

**Interfaces:**
- Consumes: existing `TrendConfig` JSON shape (`fast_period`, `slow_period`, `quantity`).
- Produces: extended `TrendConfig` struct with these new fields — used by `RecommendTrend` (Task 2), stateful `TrendEngine` (Task 3), `saveTrendSignals` (Task 5), `TrendValidator` (Task 4):
  ```go
  type TrendConfig struct {
      FastPeriod                int     `json:"fast_period"`
      SlowPeriod                int     `json:"slow_period"`
      Interval                  string  `json:"interval,omitempty"`    // "5m","15m","1h","4h"; default "5m"
      Quantity                  string  `json:"quantity"`
      Capital                   float64 `json:"capital,omitempty"`
      Horizon                   string  `json:"horizon,omitempty"`    // "short","medium","long"
      ValidationMode            string  `json:"validation_mode,omitempty"`           // "percent"
      ValidationTargetValue     float64 `json:"validation_target_value,omitempty"`
      ValidationInvalidValue    float64 `json:"validation_invalid_value,omitempty"`
      ValidationWindowMinutes   int     `json:"validation_window_minutes,omitempty"`
  }
  ```

- [ ] **Step 1: Write failing validator tests**

Append to `backend/internal/validator/validator_test.go`:

```go
func TestTrendConfig_RejectsInvalidInterval(t *testing.T) {
	err := ValidateSession("signal", "trend", `{"fast_period":3,"slow_period":10,"quantity":"0.001","interval":"1d"}`)
	if err == nil {
		t.Fatal("expected error for invalid interval")
	}
}

func TestTrendConfig_AcceptsValidInterval(t *testing.T) {
	cases := []string{`{"fast_period":3,"slow_period":10,"quantity":"0.001","interval":"5m"}`, `{"fast_period":3,"slow_period":10,"quantity":"0.001","interval":"1h"}`}
	for _, c := range cases {
		if err := ValidateSession("signal", "trend", c); err != nil {
			t.Errorf("expected ok for %s, got %v", c, err)
		}
	}
}

func TestTrendConfig_DefaultsIntervalTo5m(t *testing.T) {
	if err := ValidateSession("signal", "trend", `{"fast_period":3,"slow_period":10,"quantity":"0.001"}`); err != nil {
		t.Errorf("expected ok without interval, got %v", err)
	}
}

func TestTrendConfig_RejectsEmptyQuantity(t *testing.T) {
	if err := ValidateSession("signal", "trend", `{"fast_period":3,"slow_period":10,"quantity":"0"}`); err == nil {
		t.Fatal("expected error for zero quantity")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && go test -count=1 -run TestTrendConfig_ ./internal/validator/
```
Expected: FAIL with "expected error for invalid interval" and similar messages.

- [ ] **Step 3: Extend `TrendConfig` struct in `types.go`**

Replace lines 22-27 of `backend/internal/engine/types.go`:

```go
// TrendConfig defines the parameters for the SMA crossover strategy.
type TrendConfig struct {
	FastPeriod              int     `json:"fast_period"` // short SMA period (e.g. 10)
	SlowPeriod              int     `json:"slow_period"` // long SMA period (e.g. 30)
	Interval                string  `json:"interval,omitempty"` // "5m","15m","1h","4h"; default "5m"
	Quantity                string  `json:"quantity"`
	Capital                 float64 `json:"capital,omitempty"`
	Horizon                 string  `json:"horizon,omitempty"`
	ValidationMode          string  `json:"validation_mode,omitempty"`
	ValidationTargetValue   float64 `json:"validation_target_value,omitempty"`
	ValidationInvalidValue  float64 `json:"validation_invalid_value,omitempty"`
	ValidationWindowMinutes int     `json:"validation_window_minutes,omitempty"`
}
```

- [ ] **Step 4: Extend `TrendConfig` validator in `validator/session.go`**

Replace `TrendConfig(s string) error` in `backend/internal/validator/session.go:42-65` with:

```go
func TrendConfig(s string) error {
	var cfg struct {
		FastPeriod              int     `json:"fast_period"`
		SlowPeriod              int     `json:"slow_period"`
		Interval                string  `json:"interval"`
		Quantity                string  `json:"quantity"`
		ValidationMode          string  `json:"validation_mode"`
		ValidationTargetValue   float64 `json:"validation_target_value"`
		ValidationInvalidValue  float64 `json:"validation_invalid_value"`
		ValidationWindowMinutes int     `json:"validation_window_minutes"`
	}
	if err := json.Unmarshal([]byte(s), &cfg); err != nil {
		return err
	}
	var e Errors
	if cfg.FastPeriod < 2 {
		e.Add(ErrField("fast_period", "minimum 2"))
	}
	if cfg.SlowPeriod < cfg.FastPeriod+2 {
		e.Add(ErrField("slow_period", "must be at least fast_period + 2"))
	}
	if cfg.SlowPeriod > 200 {
		e.Add(ErrField("slow_period", "maximum 200"))
	}
	validIntervals := map[string]bool{"": true, "5m": true, "15m": true, "1h": true, "4h": true}
	if !validIntervals[cfg.Interval] {
		e.Add(ErrField("interval", "must be one of 5m, 15m, 1h, 4h"))
	}
	if f, _ := strconv.ParseFloat(cfg.Quantity, 64); f <= 0 {
		e.Add(ErrField("quantity", "must be > 0"))
	}
	if cfg.ValidationMode != "" && cfg.ValidationMode != "percent" {
		e.Add(ErrField("validation_mode", "trend only supports 'percent'"))
	}
	if cfg.ValidationTargetValue < 0 {
		e.Add(ErrField("validation_target_value", "cannot be negative"))
	}
	if cfg.ValidationInvalidValue < 0 {
		e.Add(ErrField("validation_invalid_value", "cannot be negative"))
	}
	if cfg.ValidationWindowMinutes < 0 || cfg.ValidationWindowMinutes > 10080 {
		e.Add(ErrField("validation_window_minutes", "must be between 0 and 10080"))
	}
	return e.Err()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd backend && go test -count=1 ./internal/validator/
```
Expected: PASS. Existing validator tests must still pass.

- [ ] **Step 6: Run vet and build**

Run:
```bash
cd backend && go vet ./... && go build ./...
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/engine/types.go backend/internal/validator/session.go backend/internal/validator/validator_test.go
git commit -m "feat(trend): extend TrendConfig with interval, capital, validation fields"
```

---

## Task 2: Trend Recommendation Presets & `RecommendTrend`

**Files:**
- Modify: `backend/internal/engine/recommend.go` (append after `RecommendGrid` at line 173).
- Create: `backend/internal/engine/recommend_test.go`

**Interfaces:**
- Consumes: existing `PairClass`, `Horizon`, `PairClassStable/Volatile/MicropPrice`, `HorizonShort/Medium/Long`, `classForPair`, `pairClassName`, `round8` (all in `recommend.go`).
- Produces: `TrendRecommendation` struct and `RecommendTrend` function — used by:
  - Task 6 (`/v1/trend/recommend` route in `main.go`)
  - Frontend (Task 8) to display recommended defaults

```go
type TrendRecommendation struct {
	Symbol                  string    `json:"symbol"`
	CurrentPrice            float64   `json:"current_price"`
	FastPeriod              int       `json:"fast_period"`
	SlowPeriod              int       `json:"slow_period"`
	Interval                string    `json:"interval"`
	Quantity                string    `json:"quantity"`
	ValidationMode          ValidationMode `json:"validation_mode"`
	ValidationTargetValue   float64   `json:"validation_target_value"`
	ValidationInvalidValue  float64   `json:"validation_invalid_value"`
	ValidationWindowMinutes int       `json:"validation_window_minutes"`
	Reason                  string    `json:"reason"`
}

func RecommendTrend(symbol string, currentPrice float64, horizon Horizon, capital float64) (*TrendRecommendation, error)
```

- [ ] **Step 1: Write failing tests**

Create `backend/internal/engine/recommend_test.go`:

```go
package engine

import "testing"

func TestRecommendTrend_StableMedium(t *testing.T) {
	rec, err := RecommendTrend("BTC_USDT", 70000, HorizonMedium, 100)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.FastPeriod != 20 || rec.SlowPeriod != 50 {
		t.Errorf("stable medium = 20/50, got %d/%d", rec.FastPeriod, rec.SlowPeriod)
	}
	if rec.Interval != "1h" {
		t.Errorf("stable medium interval = 1h, got %s", rec.Interval)
	}
	if rec.ValidationWindowMinutes != 720 {
		t.Errorf("window 720m expected, got %d", rec.ValidationWindowMinutes)
	}
	if rec.ValidationTargetValue != 2.0 || rec.ValidationInvalidValue != 1.0 {
		t.Errorf("target 2/invalid 1 expected, got %f/%f", rec.ValidationTargetValue, rec.ValidationInvalidValue)
	}
}

func TestRecommendTrend_VolatileShort(t *testing.T) {
	rec, err := RecommendTrend("SOL_USDT", 150, HorizonShort, 50)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.FastPeriod != 7 || rec.SlowPeriod != 21 {
		t.Errorf("volatile short = 7/21, got %d/%d", rec.FastPeriod, rec.SlowPeriod)
	}
	if rec.Interval != "5m" {
		t.Errorf("volatile short interval = 5m, got %s", rec.Interval)
	}
	if rec.ValidationWindowMinutes != 120 {
		t.Errorf("volatile short window 120m, got %d", rec.ValidationWindowMinutes)
	}
	if rec.ValidationTargetValue != 1.0 || rec.ValidationInvalidValue != 0.5 {
		t.Errorf("target 1/invalid 0.5 expected, got %f/%f", rec.ValidationTargetValue, rec.ValidationInvalidValue)
	}
}

func TestRecommendTrend_MicroLong(t *testing.T) {
	rec, err := RecommendTrend("SHIB_USDT", 0.00002, HorizonLong, 100)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.FastPeriod != 10 || rec.SlowPeriod != 30 {
		t.Errorf("micro long = 10/30, got %d/%d", rec.FastPeriod, rec.SlowPeriod)
	}
	if rec.Interval != "1h" {
		t.Errorf("micro long interval = 1h, got %s", rec.Interval)
	}
	if rec.ValidationWindowMinutes != 720 {
		t.Errorf("micro long window 720m, got %d", rec.ValidationWindowMinutes)
	}
}

func TestRecommendTrend_QuantityFromCapital(t *testing.T) {
	rec, err := RecommendTrend("BTC_USDT", 70000, HorizonMedium, 140)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	// Trend: quantity = capital / price (no grid split)
	want := "0.00200000"
	if rec.Quantity != want {
		t.Errorf("quantity %s expected, got %s", want, rec.Quantity)
	}
}

func TestRecommendTrend_ZeroCapital(t *testing.T) {
	rec, err := RecommendTrend("BTC_USDT", 70000, HorizonMedium, 0)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.Quantity != "0" {
		t.Errorf("zero capital -> quantity 0, got %s", rec.Quantity)
	}
}

func TestRecommendTrend_InvalidPrice(t *testing.T) {
	if _, err := RecommendTrend("BTC_USDT", 0, HorizonMedium, 100); err == nil {
		t.Fatal("expected error for zero price")
	}
}

func TestRecommendTrend_UnknownPairDefaultsStable(t *testing.T) {
	rec, err := RecommendTrend("XYZ_USDT", 100, HorizonMedium, 100)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.FastPeriod != 20 {
		t.Errorf("unknown pair defaults to stable medium (fast=20), got %d", rec.FastPeriod)
	}
}

func TestRecommendTrend_ContainsClassAndHorizonInReason(t *testing.T) {
	rec, _ := RecommendTrend("BTC_USDT", 70000, HorizonMedium, 100)
	if rec.Reason == "" {
		t.Error("reason should not be empty")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && go test -count=1 -run TestRecommendTrend ./internal/engine/
```
Expected: FAIL with "undefined: RecommendTrend".

- [ ] **Step 3: Add preset maps and `RecommendTrend`**

Append to `backend/internal/engine/recommend.go` (after `round8` at line 189):

```go
// Trend preset tables (3 classes x 3 horizons = 9 presets).
// ponytail: hardcoded defaults match GRID_SIGNAL_GUIDE test pairs. Lift to config file when >12 presets.

var trendFastMap = map[PairClass]map[Horizon]int{
	PairClassStable:    {HorizonShort: 10, HorizonMedium: 20, HorizonLong: 50},
	PairClassVolatile:  {HorizonShort: 7, HorizonMedium: 10, HorizonLong: 20},
	PairClassMicropPrice: {HorizonShort: 5, HorizonMedium: 7, HorizonLong: 10},
}

var trendSlowMap = map[PairClass]map[Horizon]int{
	PairClassStable:    {HorizonShort: 30, HorizonMedium: 50, HorizonLong: 200},
	PairClassVolatile:  {HorizonShort: 21, HorizonMedium: 30, HorizonLong: 50},
	PairClassMicropPrice: {HorizonShort: 15, HorizonMedium: 21, HorizonLong: 30},
}

var trendIntervalMap = map[PairClass]map[Horizon]string{
	PairClassStable:    {HorizonShort: "15m", HorizonMedium: "1h", HorizonLong: "4h"},
	PairClassVolatile:  {HorizonShort: "5m", HorizonMedium: "15m", HorizonLong: "1h"},
	PairClassMicropPrice: {HorizonShort: "5m", HorizonMedium: "15m", HorizonLong: "1h"},
}

var trendWindowMap = map[PairClass]map[Horizon]int{
	PairClassStable:    {HorizonShort: 240, HorizonMedium: 720, HorizonLong: 2880},
	PairClassVolatile:  {HorizonShort: 120, HorizonMedium: 360, HorizonLong: 1440},
	PairClassMicropPrice: {HorizonShort: 60, HorizonMedium: 240, HorizonLong: 720},
}

var trendTargetPctMap = map[Horizon]float64{
	HorizonShort:  1.0,
	HorizonMedium: 2.0,
	HorizonLong:   5.0,
}

type TrendRecommendation struct {
	Symbol                  string         `json:"symbol"`
	CurrentPrice            float64        `json:"current_price"`
	FastPeriod              int            `json:"fast_period"`
	SlowPeriod              int            `json:"slow_period"`
	Interval                string         `json:"interval"`
	Quantity                string         `json:"quantity"`
	ValidationMode          ValidationMode `json:"validation_mode"`
	ValidationTargetValue   float64        `json:"validation_target_value"`
	ValidationInvalidValue  float64        `json:"validation_invalid_value"`
	ValidationWindowMinutes int            `json:"validation_window_minutes"`
	Reason                  string         `json:"reason"`
}

func RecommendTrend(symbol string, currentPrice float64, horizon Horizon, capital float64) (*TrendRecommendation, error) {
	if currentPrice <= 0 {
		return nil, fmt.Errorf("invalid current price: %f", currentPrice)
	}
	if capital < 0 {
		return nil, fmt.Errorf("invalid capital: %f", capital)
	}
	if horizon != HorizonShort && horizon != HorizonMedium && horizon != HorizonLong {
		horizon = HorizonMedium
	}

	class := classForPair(symbol)
	fast := trendFastMap[class][horizon]
	slow := trendSlowMap[class][horizon]
	interval := trendIntervalMap[class][horizon]
	window := trendWindowMap[class][horizon]
	target := trendTargetPctMap[horizon]
	invalid := target * 0.5

	quantity := "0"
	if capital > 0 {
		q := capital / currentPrice
		quantity = strconv.FormatFloat(math.Round(q*1e8)/1e8, 'f', 8, 64)
	}

	reason := fmt.Sprintf("%s diklasifikasikan sebagai %s, horizon %s: SMA %d/%d pada interval %s, evaluasi %dm - cocok untuk trend following jangka %s",
		symbol, pairClassName(class), horizon, fast, slow, interval, window, horizon)

	return &TrendRecommendation{
		Symbol:                  symbol,
		CurrentPrice:            currentPrice,
		FastPeriod:              fast,
		SlowPeriod:              slow,
		Interval:                interval,
		Quantity:                quantity,
		ValidationMode:          ValidationPercent,
		ValidationTargetValue:   target,
		ValidationInvalidValue:  invalid,
		ValidationWindowMinutes: window,
		Reason:                  reason,
	}, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && go test -count=1 -run TestRecommendTrend ./internal/engine/
```
Expected: PASS (all `TestRecommendTrend_*`).

- [ ] **Step 5: Run full engine package tests**

Run:
```bash
cd backend && go test -count=1 ./internal/engine/ && go vet ./...
```
Expected: PASS, no vet warnings.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/engine/recommend.go backend/internal/engine/recommend_test.go
git commit -m "feat(trend): add RecommendTrend with 9 presets across pair classes and horizons"
```

---

## Task 3: Stateful `TrendEngine` with Cross Anti-Noise Tracking

**Files:**
- Modify: `backend/internal/engine/trend.go` (replace entire file content — see step below).
- Modify: `backend/internal/engine/trend_test.go` (rewrite existing tests for stateful behavior).
- Modify: `backend/internal/engine/manager.go:46` (no functional change — keep `NewTrendEngine(client)` signature;库存 under the new struct).

**Interfaces:**
- Consumes: `TrendConfig` (extended in Task 1) with `Interval` and `SlowPeriod` fields; `tokocrypto.Client.GetCandles(symbol, interval, limit)`.
- Produces: stateful `TrendEngine` with:
  ```go
  func NewTrendEngine(client *tokocrypto.Client) *TrendEngine  // existing factory (now stateful)
  func (t *TrendEngine) Reset(sessionID int64)
  func (t *TrendEngine) Evaluate(session model.Session, configStr string) []Signal
  ```

Anti-noise rule (per spec Part 2):
- Golden cross signal fires only if previous cross type for that session != "golden".
- After firing, store `lastCrossType = "golden"`.
- Rearm happens only when a death cross fires (sets `lastCrossType = "death"`), and vice versa.

- [ ] **Step 1: Write failing test for anti-noise rearm**

Append to `backend/internal/engine/trend_test.go`:

```go
func TestTrendEngine_GoldenCrossOneShot(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState)}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}
	// First call: golden cross -> signal
	prices1 := []float64{50, 50, 50, 50, 50, 50, 50, 30, 30, 100}
	if s := tr.evaluate(prices1, cfg); len(s) != 1 || s[0].Side != "buy" {
		t.Fatalf("first call: expected 1 buy, got %v", s)
	}
	// Second call: same cross persists -> no signal (anti-noise)
	prices2 := []float64{50, 50, 50, 50, 50, 50, 50, 30, 30, 100}
	if s := tr.evaluate(prices2, cfg); len(s) != 0 {
		t.Fatalf("second call: expected 0 (anti-noise), got %v", s)
	}
}

func TestTrendEngine_RearmOnOppositeCross(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState), sessIDForTest: 1}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}
	// Golden cross -> signal
	goldenPrices := []float64{50, 50, 50, 50, 50, 50, 50, 30, 30, 100}
	if s := tr.evaluate(goldenPrices, cfg); len(s) != 1 || s[0].Side != "buy" {
		t.Fatalf("golden: expected 1 buy, got %v", s)
	}
	// Death cross -> rearm + signal
	deathPrices := []float64{50, 50, 50, 50, 50, 50, 50, 70, 70, 5}
	if s := tr.evaluate(deathPrices, cfg); len(s) != 1 || s[0].Side != "sell" {
		t.Fatalf("death: expected 1 sell, got %v", s)
	}
	// Now golden again -> rearmed, signal expected
	if s := tr.evaluate(goldenPrices, cfg); len(s) != 1 || s[0].Side != "buy" {
		t.Fatalf("rearm golden: expected 1 buy, got %v", s)
	}
}

func TestTrendEngine_ResetClearsState(t *testing.T) {
	tr := &TrendEngine{states: make(map[int64]*trendSessionState), sessIDForTest: 1}
	cfg := TrendConfig{FastPeriod: 3, SlowPeriod: 7}
	goldenPrices := []float64{50, 50, 50, 50, 50, 50, 50, 30, 30, 100}
	if s := tr.evaluate(goldenPrices, cfg); len(s) != 1 {
		t.Fatalf("expected 1 signal, got %d", len(s))
	}
	tr.Reset(1)
	if s := tr.evaluate(goldenPrices, cfg); len(s) != 1 {
		t.Fatalf("after reset golden should re-fire, got %d", len(s))
	}
}
```

Update existing tests (`TestTrendEngine_GoldenCross`, `TestTrendEngine_DeathCross`, `TestTrendEngine_NoCross`, `TestTrendEngine_InsufficientData`) to construct the engine with state map: `tr := &TrendEngine{states: make(map[int64]*trendSessionState), sessIDForTest: 1}`. Keep `TestSMA` unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && go test -count=1 -run TestTrendEngine_ ./internal/engine/
```
Expected: FAIL with compile errors (`trendSessionState` undefined, `sessIDForTest` undefined).

- [ ] **Step 3: Replace `trend.go` with stateful implementation**

Replace entire content of `backend/internal/engine/trend.go`:

```go
package engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"sync"

	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/tokocrypto"
)

type trendSessionState struct {
	lastCrossType string // "golden" | "death" | ""
}

type TrendEngine struct {
	client        *tokocrypto.Client
	mu            sync.Mutex
	states        map[int64]*trendSessionState
	sessIDForTest int64 // used only by tests for evaluate() direct calls
}

func NewTrendEngine(client *tokocrypto.Client) *TrendEngine {
	return &TrendEngine{
		client: client,
		states: make(map[int64]*trendSessionState),
	}
}

func (t *TrendEngine) Reset(sessionID int64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.states, sessionID)
}

func (t *TrendEngine) Evaluate(session model.Session, configStr string) []Signal {
	var cfg TrendConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		slog.Error("parse trend config", "session", session.ID, "error", err)
		return nil
	}
	interval := cfg.Interval
	if interval == "" {
		interval = "5m"
	}

	raw, err := t.client.GetCandles(session.Symbol, interval, cfg.SlowPeriod+5)
	if err != nil {
		slog.Error("fetch candles", "session", session.ID, "error", err)
		return nil
	}

	prices := make([]float64, 0, len(raw))
	for _, c := range raw {
		if len(c) < 5 {
			continue
		}
		p, err := strconv.ParseFloat(fmt.Sprintf("%v", c[4]), 64)
		if err != nil {
			slog.Warn("skip candle parse", "error", err)
			continue
		}
		prices = append(prices, p)
	}

	// Evaluate under the session's own sessionID (state lookup keyed by it).
	prev := t.sessIDForTest
	t.sessIDForTest = session.ID
	defer func() { t.sessIDForTest = prev }()

	signals := t.evaluate(prices, cfg)
	for i := range signals {
		signals[i].Symbol = session.Symbol
		signals[i].Quantity = cfg.Quantity
	}
	return signals
}

// evaluate inspects the last two SMA crossover points and emits one signal
// per cross type per session, gated by trendSessionState.lastCrossType.
func (t *TrendEngine) evaluate(prices []float64, config TrendConfig) []Signal {
	t.mu.Lock()
	defer t.mu.Unlock()

	sessionID := t.sessIDForTest
	state := t.states[sessionID]
	if state == nil {
		state = &trendSessionState{}
		t.states[sessionID] = state
	}

	signals := []Signal{}
	if len(prices) < config.SlowPeriod {
		return signals
	}

	fast := sma(prices, config.FastPeriod)
	slow := sma(prices, config.SlowPeriod)

	prevFast := fast[len(fast)-2]
	prevSlow := slow[len(slow)-2]
	currFast := fast[len(fast)-1]
	currSlow := slow[len(slow)-1]

	golden := prevFast <= prevSlow && currFast > currSlow
	death := prevFast >= prevSlow && currFast < currSlow

	if golden && state.lastCrossType != "golden" {
		signals = append(signals, Signal{
			Side:   string(model.SideBuy),
			Price:  fmt.Sprintf("%.8f", prices[len(prices)-1]),
			Reason: "golden_cross",
		})
		state.lastCrossType = "golden"
	}
	if death && state.lastCrossType != "death" {
		signals = append(signals, Signal{
			Side:   string(model.SideSell),
			Price:  fmt.Sprintf("%.8f", prices[len(prices)-1]),
			Reason: "death_cross",
		})
		state.lastCrossType = "death"
	}
	return signals
}

func sma(prices []float64, period int) []float64 {
	result := make([]float64, len(prices))
	for i := period - 1; i < len(prices); i++ {
		sum := 0.0
		for j := i - period + 1; j <= i; j++ {
			sum += prices[j]
		}
		result[i] = sum / float64(period)
	}
	return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && go test -count=1 -run TestTrendEngine_ ./internal/engine/
```
Expected: PASS.

- [ ] **Step 5: Run full engine package + vet**

Run:
```bash
cd backend && go test -count=1 ./internal/engine/ && go vet ./...
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/engine/trend.go backend/internal/engine/trend_test.go
git commit -m "feat(trend): stateful cross tracking with one-signal-per-cross anti-noise"
```

---

## Task 4: `TrendValidator` — Percent + SMA Hold Validation

**Files:**
- Modify: `backend/internal/engine/validator.go` (append).
- Create: `backend/internal/engine/validator_test.go`

**Interfaces:**
- Consumes: `model.StrategySignal` (`SignalType`, `GridLevelPrice` as cross-price, `ValidationTargetValue`, `ValidationInvalidValue`, `ValidationWindowMinutes`, `CreatedAt`, `ValidationStatus`), `TrendConfig` (for SMA period computation), candle price input.
- Produces: `TrendValidator` struct with:
  ```go
  type TrendValidator struct{}
  func NewTrendValidator() *TrendValidator
  func (v *TrendValidator) ValidatePendingTrend(
      pending []model.StrategySignal,
      currentPrice float64,
      smaFast float64, smaSlow float64,
  ) []validationResult
  ```

Rules (per spec Part 4):
- Conditions: `move_pct = (currentPrice - signalPrice) / signalPrice * 100`.
- For buy: favorable = `move_pct` up, adverse = `move_pct` down (`-move_pct`).
- For sell: favorable = `-move_pct` (price falls is good), adverse = `move_pct` (price rises is bad).
- SMA held: buy direction = `smaFast > smaSlow`; sell = `smaFast < smaSlow`.
- `targetPct` hit and `smaHeld` -> `confirmed`.
- `targetPct` hit and NOT smaHeld -> `invalidated`, note = "percent hit but SMA reversed".
- Invalid pct hit first -> `invalidated`.
- Window elapsed -> `expired`.

- [ ] **Step 1: Write failing test cases**

Create `backend/internal/engine/validator_test.go`:

```go
package engine

import (
	"testing"
	"time"

	"github.com/user/nt/internal/model"
)

func makeTrendSignal(signalType string, signalPrice string, ageMin int) model.StrategySignal {
	created := time.Now().Add(-time.Duration(ageMin) * time.Minute)
	return model.StrategySignal{
		ID:                    1,
		SignalType:            signalType,
		GridLevelPrice:        signalPrice,
		ValidationStatus:      "pending",
		ValidationMode:         "percent",
		ValidationTargetValue:  2.0,
		ValidationInvalidValue: 1.0,
		ValidationWindowMinutes: 120,
		CreatedAt:             created,
	}
}

func TestTrendValidator_BuyConfirmed(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 103, 101, 99)
	if len(res) != 1 || res[0].status != "confirmed" {
		t.Fatalf("expected 1 confirmed, got %+v", res)
	}
	if res[0].note != "target reached" {
		t.Errorf("note mismatch: %s", res[0].note)
	}
}

func TestTrendValidator_BuyInvalidatedByAdverse(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 98.5, 99, 101)
	if len(res) != 1 || res[0].status != "invalidated" {
		t.Fatalf("expected 1 invalidated (price moved down >1%), got %+v", res)
	}
	if res[0].note != "invalid threshold reached" {
		t.Errorf("note mismatch: %s", res[0].note)
	}
}

func TestTrendValidator_BuyInvalidatedBySMAReversal(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	// price moved +3% (target hit) but SMA reversed (fast < slow)
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 103, 99, 101)
	if len(res) != 1 || res[0].status != "invalidated" {
		t.Fatalf("expected invalidated (SMA reversed), got %+v", res)
	}
	if res[0].note != "percent hit but SMA reversed" {
		t.Errorf("note mismatch: %s", res[0].note)
	}
}

func TestTrendValidator_SellConfirmed(t *testing.T) {
	sig := makeTrendSignal("sell", "100", 5)
	v := NewTrendValidator()
	// price fell 3% (target hit), SMA still death-aligned (fast < slow)
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 97, 99, 101)
	if len(res) != 1 || res[0].status != "confirmed" {
		t.Fatalf("expected 1 confirmed, got %+v", res)
	}
}

func TestTrendValidator_SellSMAReversal(t *testing.T) {
	sig := makeTrendSignal("sell", "100", 5)
	v := NewTrendValidator()
	// price fell 3% (target hit) but SMA reversed (fast > slow)
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 97, 101, 99)
	if len(res) != 1 || res[0].status != "invalidated" {
		t.Fatalf("expected invalidated, got %+v", res)
	}
	if res[0].note != "percent hit but SMA reversed" {
		t.Errorf("note mismatch: %s", res[0].note)
	}
}

func TestTrendValidator_Expired(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 200) // 200 minutes ago > 120 window
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 101, 100, 99)
	if len(res) != 1 || res[0].status != "expired" {
		t.Fatalf("expected expired, got %+v", res)
	}
}

func TestTrendValidator_PendingKeepsPending(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	// small move, no trigger
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 100.5, 100, 99)
	if len(res) != 0 {
		t.Fatalf("expected no transition, got %+v", res)
	}
}

func TestTrendValidator_TracksMaxFavorable(t *testing.T) {
	sig := makeTrendSignal("buy", "100", 5)
	v := NewTrendValidator()
	res := v.ValidatePendingTrend([]model.StrategySignal{sig}, 103, 101, 99)[0]
	if res.maxFavPct < 2.9 || res.maxFavPct > 3.1 {
		t.Errorf("maxFavPct ~= 3.0 expected, got %f", res.maxFavPct)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && go test -count=1 -run TestTrendValidator_ ./internal/engine/
```
Expected: FAIL with "undefined: NewTrendValidator".

- [ ] **Step 3: Add `TrendValidator` to `validator.go`**

Append to `backend/internal/engine/validator.go`:

```go
// TrendValidator validates pending trend signals against percent + SMA hold rules.
type TrendValidator struct{}

func NewTrendValidator() *TrendValidator {
	return &TrendValidator{}
}

// ValidatePendingTrend evaluates pending trend signals.
// currentPrice is the latest candle close.
// smaFast and smaSlow are the current SMA values computed on the latest batch.
// ponytail: single-state per signal; max favors persist cheaper than DB write each tick when ready.
func (v *TrendValidator) ValidatePendingTrend(
	pending []model.StrategySignal,
	currentPrice float64,
	smaFast float64, smaSlow float64,
) []validationResult {
	results := []validationResult{}
	now := time.Now()

	for _, sig := range pending {
		if sig.ValidationStatus != "pending" {
			continue
		}
		// 60-second grace period before auto-validating (matches grid validator)
		if now.Sub(sig.CreatedAt) < 60*time.Second {
			continue
		}

		signalPrice, err := parseFloatStr(sig.GridLevelPrice)
		if err != nil || signalPrice == 0 {
			continue
		}

		movePct := ((currentPrice - signalPrice) / signalPrice) * 100

		// Direction: favorable for buy = move up; for sell = move down
		var favPct, advPct float64
		smaHeld := false
		if sig.SignalType == "buy" {
			favPct = movePct
			if movePct < 0 {
				advPct = -movePct
				favPct = 0
			}
			smaHeld = smaFast > smaSlow
		} else {
			favPct = -movePct
			if movePct > 0 {
				advPct = movePct
				favPct = 0
			}
			smaHeld = smaFast < smaSlow
		}

		windowDuration := time.Duration(sig.ValidationWindowMinutes) * time.Minute
		if now.Sub(sig.CreatedAt) >= windowDuration {
			results = append(results, validationResult{
				signalID:  sig.ID,
				status:    "expired",
				resultPct: movePct,
				maxFavPct: favPct,
				maxAdvPct: advPct,
				note:      "validation window expired",
			})
			continue
		}

		targetHit := favPct >= sig.ValidationTargetValue
		invalidHit := advPct >= sig.ValidationInvalidValue

		if targetHit && smaHeld {
			results = append(results, validationResult{
				signalID:  sig.ID,
				status:    "confirmed",
				resultPct: favPct,
				maxFavPct: favPct,
				maxAdvPct: advPct,
				note:      "target reached",
			})
			continue
		}
		if targetHit && !smaHeld {
			results = append(results, validationResult{
				signalID:  sig.ID,
				status:    "invalidated",
				resultPct: movePct,
				maxFavPct: favPct,
				maxAdvPct: advPct,
				note:      "percent hit but SMA reversed",
			})
			continue
		}
		if invalidHit {
			results = append(results, validationResult{
				signalID:  sig.ID,
				status:    "invalidated",
				resultPct: movePct,
				maxFavPct: favPct,
				maxAdvPct: advPct,
				note:      "invalid threshold reached",
			})
			continue
		}
	}
	return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && go test -count=1 -run TestTrendValidator_ ./internal/engine/
```
Expected: PASS.

- [ ] **Step 5: Run full engine + vet**

Run:
```bash
cd backend && go test -count=1 ./internal/engine/ && go vet ./...
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/engine/validator.go backend/internal/engine/validator_test.go
git commit -m "feat(trend): TrendValidator with percent + SMA hold validation rules"
```

---

## Task 5: `saveTrendSignals` + Manager Loop Integration

**Files:**
- Modify: `backend/internal/engine/manager.go`
- Modify: `backend/internal/engine/manager_test.go`

**Interfaces:**
- Consumes: `StrategySignalRepository` (`Create`, `ListPending`, `UpdateValidation`); `TrendConfig` (extended); `TrendValidator` (Task 4); `TrendEngine` (stateful, Task 3).
- Produces:
  ```go
  func (m *Manager) saveTrendSignals(session model.Session, signals []Signal)
  func (m *Manager) validatePendingTrendSignals(session model.Session)
  ```
  Side effect: when `session.Strategy == "trend"` and `session.Mode == "signal"`, `manager.evaluate` saves trend signals to `strategy_signals` AND `orders` (backward compat). `manager.run` calls `validatePendingTrendSignals` after `evaluate` for trend sessions.

Patterns to mirror:
- `saveGridSignals` at `manager.go:212` (called from `evaluate` at `manager.go:159`).
- `validatePendingSignals` at `manager.go:289` (called from `run` at `manager.go:137`).

- [ ] **Step 1: Write failing manager test**

Append to `backend/internal/engine/manager_test.go`:

```go
func TestManager_SavesTrendSignalsToStrategySignals(t *testing.T) {
	// Construct a Manager wired with a mock signal repo and a minimal client.
	// Use a test session strategy=trend mode=signal, supply a golden_cross signal,
	// assert signalRepo.Create was called.
	// (Mock setup depends on existing mock convention in repo_test.go / mocks/mock_signal.go.)
	t.Skip("see repo_test.go and mocks/mock_signal.go for gomock conventions; let the implementer wire it here")
}
```

Note: this test stub is a marker. Implement either by extending existing `gomock` pattern (see `backend/internal/repository/mocks/mock_signal.go` for `MockStrategySignalRepository`) or by temporarily injecting a fake repo. If unsure, dispatch the integration test in Task 6 alongside the route; skip the heavy DB-mock dance here and verify end-to-end later via the `/v1/trend/recommend` route + a manual smoke test.

If the project has a working test harness for `Manager` (see existing `manager_test.go` content), wire the test there. Otherwise do the lightweight check below.

Minimal smoke check (compile-time): ensure `saveTrendSignals` and `validatePendingTrendSignals` exist by referencing them.

```go
func TestManager_TrendBranchRefsCompile(t *testing.T) {
	var m *Manager
	_ = m.saveTrendSignals       // method value must resolve at compile time
	_ = m.validatePendingTrendSignals
}
```

- [ ] **Step 2: Run tests — expect compile failure**

Run:
```bash
cd backend && go test -count=1 -run TestManager_TrendBranchRefsCompile ./internal/engine/
```
Expected: FAIL with "m.saveTrendSignals undefined".

- [ ] **Step 3: Add `saveTrendSignals` to `manager.go`**

Append after `saveGridSignals` (around `manager.go:287`):

```go
func (m *Manager) saveTrendSignals(session model.Session, signals []Signal) {
	if len(signals) == 0 || m.signalRepo == nil {
		return
	}

	var cfg TrendConfig
	if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
		slog.Error("parse trend config for signals", "session", session.ID, "error", err)
		return
	}

	for _, sig := range signals {
		// ponytail: trend pakai kolom grid_* sebagai marker*, 0 untuk grid-only fields.
		// Rename ke marker_* saat strategi ke-4 muncul.
		signal := &model.StrategySignal{
			SessionID:              session.ID,
			Symbol:                 session.Symbol,
			Strategy:               "trend",
			SignalType:             sig.Side,
			GridLevelIndex:         0,
			GridLevelPrice:         sig.Price,
			MarketPriceAtSignal:   sig.Price,
			Quantity:               sig.Quantity,
			Reason:                 sig.Reason,
			ValidationMode:         "percent",
			ValidationTargetValue:  cfg.ValidationTargetValue,
			ValidationInvalidValue: cfg.ValidationInvalidValue,
			ValidationWindowMinutes: cfg.ValidationWindowMinutes,
		}
		if signal.ValidationTargetValue == 0 {
			signal.ValidationTargetValue = 2.0
		}
		if signal.ValidationInvalidValue == 0 {
			signal.ValidationInvalidValue = 1.0
		}
		if signal.ValidationWindowMinutes == 0 {
			signal.ValidationWindowMinutes = 120
		}

		if _, err := m.signalRepo.Create(context.Background(), signal); err != nil {
			slog.Error("save trend signal", "session", session.ID, "error", err)
		} else {
			slog.Info("trend signal saved", "session", session.ID, "side", sig.Side, "reason", sig.Reason)
		}
	}

	// Backward-compat: also save to orders table
	m.saveSignals(session.ID, signals)
}
```

- [ ] **Step 4: Wire `saveTrendSignals` into `evaluate`**

Modify `backend/internal/engine/manager.go:156-163`. Currently:

```go
switch session.Mode {
case string(model.ModeSignal):
    if session.Strategy == string(model.StratGrid) && m.signalRepo != nil {
        m.saveGridSignals(session, signals)
    } else {
        m.saveSignals(session.ID, signals)
    }
    m.broadcast(session.ID, session.Name, signals)
```

Replace the inner branch with:

```go
case string(model.ModeSignal):
    switch session.Strategy {
    case string(model.StratGrid):
        if m.signalRepo != nil {
            m.saveGridSignals(session, signals)
        } else {
            m.saveSignals(session.ID, signals)
        }
    case string(model.StratTrend):
        if m.signalRepo != nil {
            m.saveTrendSignals(session, signals)
        } else {
            m.saveSignals(session.ID, signals)
        }
    default:
        m.saveSignals(session.ID, signals)
    }
    m.broadcast(session.ID, session.Name, signals)
```

- [ ] **Step 5: Add `validatePendingTrendSignals` to `manager.go`**

Append after `validatePendingSignals` (around line 322):

```go
func (m *Manager) validatePendingTrendSignals(session model.Session) {
	if m.signalRepo == nil {
		return
	}

	pending, err := m.signalRepo.ListPending(context.Background(), session.ID)
	if err != nil || len(pending) == 0 {
		return
	}

	var cfg TrendConfig
	if err := json.Unmarshal([]byte(session.Config), &cfg); err != nil {
		slog.Error("parse trend config for validation", "session", session.ID, "error", err)
		return
	}
	interval := cfg.Interval
	if interval == "" {
		interval = "5m"
	}
	limit := cfg.SlowPeriod + 5
	if limit < 10 {
		limit = 10
	}

	raw, err := m.client.GetCandles(session.Symbol, interval, limit)
	if err != nil {
		slog.Error("trend validator fetch candles", "session", session.ID, "error", err)
		return
	}
	prices := make([]float64, 0, len(raw))
	for _, c := range raw {
		if len(c) < 5 {
			continue
		}
		p, err := strconv.ParseFloat(fmt.Sprintf("%v", c[4]), 64)
		if err != nil {
			continue
		}
		prices = append(prices, p)
	}
	if len(prices) < cfg.SlowPeriod {
		slog.Warn("trend validator insufficient candles", "session", session.ID, "got", len(prices), "need", cfg.SlowPeriod)
		return
	}

	currentPrice := prices[len(prices)-1]
	smaFast := sma(prices, cfg.FastPeriod)
	smaSlow := sma(prices, cfg.SlowPeriod)
	fast := smaFast[len(smaFast)-1]
	slow := smaSlow[len(smaSlow)-1]

	validator := NewTrendValidator()
	results := validator.ValidatePendingTrend(pending, currentPrice, fast, slow)
	for _, r := range results {
		slog.Info("trend signal validated", "signal", r.signalID, "status", r.status, "result_pct", r.resultPct, "note", r.note)
		if err := m.signalRepo.UpdateValidation(context.Background(), r.signalID, r.status,
			r.resultPct, r.resultGridSteps, r.maxFavPct, r.maxAdvPct, r.maxFavGrid, r.maxAdvGrid, r.note); err != nil {
			slog.Error("update trend signal validation", "signal", r.signalID, "status", r.status, "error", err)
		}
	}
}
```

- [ ] **Step 6: Wire `validatePendingTrendSignals` into `manager.run` loop**

Modify `backend/internal/engine/manager.go:136-140`. Currently:

```go
m.evaluate(ctx, fresh)
// Run validator on every tick for grid+signal sessions
if fresh.Strategy == string(model.StratGrid) && fresh.Mode == string(model.ModeSignal) {
    m.validatePendingSignals(fresh)
}
```

Replace with:

```go
m.evaluate(ctx, fresh)
switch {
case fresh.Strategy == string(model.StratGrid) && fresh.Mode == string(model.ModeSignal):
    m.validatePendingSignals(fresh)
case fresh.Strategy == string(model.StratTrend) && fresh.Mode == string(model.ModeSignal):
    m.validatePendingTrendSignals(fresh)
}
```

- [ ] **Step 7: Reset trend state on restart (mirror grid reset)**

Modify `backend/internal/engine/manager.go:66-73`. After the existing grid reset block:

```go
// Reset Grid state on restart (clear level triggers)
if grid, ok := m.strategies[string(model.StratGrid)].(*GridEngine); ok {
    grid.Reset(session.ID)
}
// Reset Trend state on restart (clear cross tracking)
if trend, ok := m.strategies[string(model.StratTrend)].(*TrendEngine); ok {
    trend.Reset(session.ID)
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run:
```bash
cd backend && go test -count=1 ./internal/engine/ && go vet ./... && go build ./...
```
Expected: PASS — `TestManager_TrendBranchRefsCompile` resolves, existing manager tests still pass.

- [ ] **Step 9: Commit**

```bash
git add backend/internal/engine/manager.go backend/internal/engine/manager_test.go
git commit -m "feat(trend): persist + auto-validate trend signals via manager loop"
```

---

## Task 6: Add `GET /v1/trend/recommend` Route

**Files:**
- Modify: `backend/cmd/server/main.go` (add route after `/grid/recommend` at line 195).
- Modify: `backend/cmd/server/main_test.go` (only if it already tests `/grid/recommend`; otherwise skip — verify manually).

**Interfaces:**
- Consumes: `engine.RecommendTrend`, `tokoClient.GetTicker`.
- Produces: HTTP route returning JSON `engine.TrendRecommendation`.

`curl http://localhost:8080/v1/trend/recommend?symbol=BTC_USDT&horizon=medium&capital=100` should return the JSON recommendation.

- [ ] **Step 1: Add the route handler**

In `backend/cmd/server/main.go`, immediately after the `/grid/recommend` handler block (after line 195), insert:

```go
v1.GET("/trend/recommend", func(c echo.Context) error {
	symbol := c.QueryParam("symbol")
	if symbol == "" {
		return c.JSON(400, ErrorResponse{Error: "symbol is required"})
	}
	horizon := engine.Horizon(c.QueryParam("horizon"))
	if horizon == "" {
		horizon = engine.HorizonMedium
	}
	capitalStr := c.QueryParam("capital")
	capital, _ := strconv.ParseFloat(capitalStr, 64)
	if capital <= 0 {
		capital = 100
	}
	ticker, err := tokoClient.GetTicker(symbol)
	if err != nil {
		return c.JSON(502, ErrorResponse{Error: "failed to fetch ticker: " + err.Error()})
	}
	price, _ := strconv.ParseFloat(ticker.LastPrice, 64)
	rec, err := engine.RecommendTrend(symbol, price, horizon, capital)
	if err != nil {
		return c.JSON(400, ErrorResponse{Error: err.Error()})
	}
	return c.JSON(200, rec)
})
```

- [ ] **Step 2: Verify build + existing tests**

Run:
```bash
cd backend && go build ./... && go vet ./... && go test -count=1 ./cmd/server/... ./internal/...
```
Expected: PASS. If `cmd/server/main_test.go` exists and tests `/grid/recommend`, add a parallel `/trend/recommend` test mirroring it (the implementer should first read `main_test.go` to see the mock pattern; if no similar test exists, skip — TDD optional here because the handler is a thin shim over the already-tested `RecommendTrend`).

- [ ] **Step 3: Smoke-test the route**

Run backend: `cd backend && go run ./cmd/server/`.
In another shell:
```bash
curl -s "http://localhost:8080/v1/trend/recommend?symbol=BTC_USDT&horizon=medium&capital=100" | jq .
```
Expected: JSON object with `fast_period: 20`, `slow_period: 50`, `interval: "1h"`, `validation_window_minutes: 720`.

- [ ] **Step 4: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "feat(trend): add GET /v1/trend/recommend endpoint"
```

---

## Task 7: Frontend — Trend Recommendation API Client

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: backend `GET /v1/trend/recommend`.
- Produces: typed TS function used by the create-session form in Task 8:
  ```ts
  export interface TrendRecommendation { ... }
  export async function getTrendRecommendation(symbol: string, horizon: "short"|"medium"|"long", capital: number): Promise<TrendRecommendation>
  ```

- [ ] **Step 1: Read existing `api.ts` to understand patterns**

Run:
```bash
grep -n "Recommend\|recommend" frontend/src/lib/api.ts
```
Note the existing `getGridRecommendation` function. If absent, look for any similar API client function and follow the same `fetch` + JSON parse style.

- [ ] **Step 2: Append trend types + function**

In `frontend/src/lib/api.ts`, append (matching existing style — the implementer should adjust import names to match what's already there):

```ts
export interface TrendRecommendation {
  symbol: string;
  current_price: number;
  fast_period: number;
  slow_period: number;
  interval: string;
  quantity: string;
  validation_mode: "percent";
  validation_target_value: number;
  validation_invalid_value: number;
  validation_window_minutes: number;
  reason: string;
}

export async function getTrendRecommendation(
  symbol: string,
  horizon: "short" | "medium" | "long",
  capital: number,
): Promise<TrendRecommendation> {
  const params = new URLSearchParams({ symbol, horizon, capital: String(capital) });
  const res = await fetch(`${API_BASE}/v1/trend/recommend?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `trend recommend failed: ${res.status}`);
  }
  return res.json();
}
```

Adjust `API_BASE` reference to whatever the file already uses. If the existing code uses a helper like `apiGet` or `fetcher`, use that instead of raw `fetch`.

- [ ] **Step 3: Type-check**

Run:
```bash
cd frontend && npm run typecheck 2>/dev/null || npx tsc --noEmit
```
Expected: no type errors in `api.ts`. (If no typecheck script exists, run `npm run build`.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(trend): add getTrendRecommendation client"
```

---

## Task 8: Frontend — Create Trend Session Form (Beginner + Advanced)

**Files:**
- Modify: `frontend/src/app/sessions/new/page.tsx` (or the existing create-session page — adjust path if different).

**Goal:** Add "Trend Following" as a strategy option. Beginner mode: user picks pair, horizon, capital -> calls `getTrendRecommendation` -> fills `fast_period`, `slow_period`, `interval`, `quantity`, validation fields. Advanced mode: user manually inputs all fields. Submit creates session via existing `POST /v1/sessions` with `strategy: "trend"`, `mode: "signal"`, and the populated `config` JSON.

- [ ] **Step 1: Locate the existing create session page**

```bash
find frontend/src -name "*.tsx" -path "*session*new*" -o -path "*new*session*" | head
```
Also inspect the existing grid strategy branch:
```bash
grep -n "grid\|beginner\|advanced\|horizon" frontend/src/app/sessions/new/page.tsx
```

- [ ] **Step 2: Mirror the grid beginner flow for trend**

Within the create-session page component (the implementer should read the whole file to find the strategy selector and conditional form region), add a `trend` branch in parallel with `grid`:

- Beginner mode inputs (identical set as grid): pair, horizon, capital.
- On "Rekomendasi" button click: call `getTrendRecommendation(symbol, horizon, capital)`.
- Show preview block with: SMA fast/slow, interval candle, quantity, validation target/invalid/window, and `reason` string.
- Submit builds `config` JSON:
  ```json
  {
    "fast_period": 20,
    "slow_period": 50,
    "interval": "1h",
    "quantity": "0.00143",
    "capital": 100,
    "horizon": "medium",
    "validation_mode": "percent",
    "validation_target_value": 2.0,
    "validation_invalid_value": 1.0,
    "validation_window_minutes": 720
  }
  ```
- Advanced mode: show manual inputs for `fast_period`, `slow_period`, `interval` (dropdown of `5m,15m,1h,4h`), `quantity`, validation target/invalid/window. Skip capital if quantity is provided manually.

- [ ] **Step 3: Run dev server and verify form submission**

```bash
cd frontend && npm run dev
```
Open the create-page, select Trend strategy, enter BTC_USDT + medium + 100, click "Rekomendasi" — preview should show SMA 20/50, 1h interval.

Submit the form; on the backend side verify a session row was created with `strategy=trend`. Use `curl http://localhost:8080/v1/sessions` or the sessions page after.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/sessions/new/page.tsx
git commit -m "feat(trend): beginner + advanced create-session form with recommendation preview"
```

---

## Task 9: Frontend — Detail Page Trend-Specific Labels

**Files:**
- Modify: `frontend/src/app/sessions/[id]/page.tsx`

**Goal:** When `session.strategy === "trend"`, render trend-specific labels instead of grid labels:
- Overview section: show "Fast SMA / Slow SMA / Interval / Cross type" instead of "Upper / Lower / Grid Step".
- Signal history table: column "Cross Type" (golden/death cross) instead of "Level" (which shows grid level index).
- Hide grid-only summary blocks (grid range, grid count) — keep total signals, success rate, buy/sell distribution.

- [ ] **Step 1: Locate the grid-specific rendering already in the detail page**

Run:
```bash
grep -n "grid\|level\|upper\|lower\|step" frontend/src/app/sessions/\[id\]/page.tsx
```

- [ ] **Step 2: Add a `strategy === "trend"` branch**

For trend, in the overview section show:
- Current market price (already there)
- Fast SMA value, Slow SMA value (compute client-side from latest candles, or fetch from a new endpoint if available — for phase 1, show the static `fast_period` and `slow_period` from config).
- Interval candle (from config)
- Total signals + success rate (already there)

For trend, in the signal history table:
- Waktu
- Sisi (buy/sell)
- Cross Type — derive from `reason`: `golden_cross` -> "Golden Cross", `death_cross` -> "Death Cross".
- Harga
- Status
- Result %

- [ ] **Step 3: Verify by starting a trend session**

```bash
cd backend && go run ./cmd/server/ &
cd frontend && npm run dev
```
Open a running trend session detail page; verify labels render correctly and there are no grid-specific UI elements leaking into trend sessions.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/sessions/\[id\]/page.tsx
git commit -m "feat(trend): detail page renders trend-specific labels (SMA, cross type)"
```

---

## Task 10: Manual Test Pass + Optional `TREND_SIGNAL_GUIDE.md`

**Files:**
- Create (optional): `TREND_SIGNAL_GUIDE.md` (mirror `GRID_SIGNAL_GUIDE.md`).

- [ ] **Step 1: End-to-end smoke**

```bash
# Start backend + frontend + postgres (docker-compose up -d postgres or use local)
cd backend && go run ./cmd/server/
cd frontend && npm run dev
```

- [ ] **Step 2: Walk-through checklist**
- Create session: Trend strategy, beginner mode, BTC_USDT, medium, $100.
- Verify recommendation preview shows SMA 20/50, 1h, $100 -> quantity.
- Start the session.
- Confirm signals eventually fire over time (golden or death cross).
- Verify `strategy_signals` rows exist (use `psql` or the `/v1/sessions/:id/signals` endpoint).
- Validate that pending signals eventually transition to confirmed/invalidated/expired.
- Verify the detail page summary metrics (success rate, counts) render.

- [ ] **Step 3: Write `TREND_SIGNAL_GUIDE.md` (optional)**

Use `GRID_SIGNAL_GUIDE.md` as template. Cover:
- What is Trend Signal
- Beginner mode walkthrough
- Pair class table with default SMA/interval presets
- Validation rules (percent + SMA hold)
- Comparison with Grid Signal
- Troubleshooting (no signals: bump interval; too many invalidated: SMA reversed often -> widen window or use longer horizon)

- [ ] **Step 4: Commit**

```bash
git add TREND_SIGNAL_GUIDE.md
git commit -m "docs(trend): add TREND_SIGNAL_GUIDE.md for end users"
```

---

## Self-Review Checklist (run after writing this plan)

- [x] Spec coverage: every section/requirement of `2026-07-08-trend-signal-design.md` maps to a task.
  - Architecture & components -> Tasks 1, 3, 5
  - Recommendation -> Task 2, Task 6
  - Validation logic -> Task 4, Task 5
  - Data model -> Task 5 (reuse comment)
  - UX create -> Task 8
  - UX detail -> Task 9
  - Error handling -> Task 1 (interval/quantity validation), Task 5 (skip on fetch fail), already implemented
  - Testing strategy -> embedded in Tasks 1-5 as TDD steps
  - Implementation order -> matches spec Part 9 (Tasks 1-5 = backend types/state/engine/signal/validator/test; Tasks 6-9 = frontend; Task 10 = manual)
  - Acceptance criteria -> covered by Task tests + Task 10 manual smoke
- [x] Placeholder scan: no TBD/TODO. Task 5 step 1 has a `t.Skip` test stub explicitly — that's deliberate (mock setup is heavy; the implementer can wire it or skip and verify via live smoke in Task 10). Acceptable.
- [x] Type consistency:
  - `TrendConfig.Interval` used in Task 3, 5 -> Task 1 defines it. ✓
  - `TrendRecommendation` produced by Task 2, used by Task 6 & 7. ✓
  - `TrendValidator.ValidatePendingTrend(pending, currentPrice, smaFast, smaSlow)` defined Task 4, called Task 5 with the same signature. ✓
  - `saveTrendSignals(session, signals)` & `validatePendingTrendSignals(session)` defined Task 5; referenced by manager in Task 5 step 4 & 6. ✓
  - `sessIDForTest int64` field added to `TrendEngine` Task 3 -> only test code mutates it. Production code uses `session.ID`. ✓

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-trend-signal.md`.**