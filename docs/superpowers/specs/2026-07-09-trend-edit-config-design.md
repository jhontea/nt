# Trend Edit Config Design

## Status
- Draft — ready for implementation planning

## Goals
- Add a user-friendly form for editing trend session config on the detail page.
- Mirror the create session form experience: beginner mode (horizon + capital → recommendation) and manual mode (direct field input).
- Replace the raw JSON editor for trend sessions with this form.
- All fields editable: fast_period, slow_period, interval, quantity, validation_target_value, validation_invalid_value, validation_window_minutes, stop_loss_pct, take_profit_pct.

## Non-Goals
- Editing grid or DCA config (those keep their existing behavior).
- Changing session symbol, mode, or strategy.
- Backend changes (PATCH /v1/sessions/:id/config already exists).

---

## Part 1: Component

### New file
`frontend/src/components/sessions/TrendEditConfigForm.tsx`

### Props
```ts
interface TrendEditConfigFormProps {
  sessionId: number
  symbol: string
  currentConfig: Record<string, any>
  onSaved: () => void
  onCancel: () => void
}
```

### State
- `isBeginner: boolean` — toggle beginner/manual mode, default `true`
- `horizon: 'short' | 'medium' | 'long'` — default `'medium'`
- `capital: string` — default `'100'`
- `recommendation: TrendRecommendation | null`
- `recLoading: boolean`
- `fastPeriod: string` — pre-filled from `currentConfig.fast_period`
- `slowPeriod: string` — pre-filled from `currentConfig.slow_period`
- `trendInterval: '5m' | '15m' | '1h' | '4h'` — pre-filled from `currentConfig.interval`
- `quantity: string` — pre-filled from `currentConfig.quantity`
- `validationTargetValue: string` — pre-filled from `currentConfig.validation_target_value`
- `validationInvalidValue: string` — pre-filled from `currentConfig.validation_invalid_value`
- `validationWindowMinutes: string` — pre-filled from `currentConfig.validation_window_minutes`
- `stopLossPct: string` — pre-filled from `currentConfig.stop_loss_pct`
- `takeProfitPct: string` — pre-filled from `currentConfig.take_profit_pct`
- `saving: boolean`
- `error: string`

### Beginner mode UI
1. Horizon selector (short/medium/long)
2. Modal input (USDT capital)
3. "Rekomendasi" button → call `api.trend.recommend({ symbol, horizon, capital })`
4. On recommendation received: auto-fill fastPeriod, slowPeriod, trendInterval, quantity, validationTargetValue, validationInvalidValue, validationWindowMinutes
5. Preview card: SMA fast/slow, interval, qty, validation values, reason string

### Manual mode UI
1. SMA Cepat (fast_period)
2. SMA Lambat (slow_period)
3. Interval Candle (5m/15m/1h/4h)
4. Qty per sinyal (quantity)
5. Validasi target % (validation_target_value)
6. Validasi invalid % (validation_invalid_value)
7. Window menit (validation_window_minutes)
8. Stop Loss % (optional)
9. Take Profit % (optional)

### Save behavior
Build config JSON from form state and call `api.sessions.applyConfig(sessionId, configJSON)`.
Preserve existing config fields not covered by the form (e.g. `capital`, `horizon`) by merging with `currentConfig`.
On success: call `onSaved()`.
On error: show error message.
Disable save button while session is running (same behavior as existing grid edit).

---

## Part 2: Integration in detail page

### Where
In `frontend/src/app/sessions/[id]/page.tsx`, inside the `{editingConfig ? ... : ...}` block (around line 1256).

### Change
Add a branch: if `session.strategy === 'trend'`, render `<TrendEditConfigForm>` instead of the textarea + grid recommendation panel.

```tsx
{editingConfig ? (
  session.strategy === 'trend' ? (
    <TrendEditConfigForm
      sessionId={Number(id)}
      symbol={session.symbol}
      currentConfig={configDisplay}
      onSaved={() => { setEditingConfig(false); qc.invalidateQueries({ queryKey: ['session', id] }) }}
      onCancel={() => { setEditingConfig(false) }}
    />
  ) : (
    // existing grid/DCA JSON editor + grid recommendation panel
    ...
  )
) : (
  // existing JSON display + Edit button
  ...
)}
```

State variables `editConfigValue`, `editConfigSaving`, `editConfigError`, `editRec`, `editRecLoading`, `editRecHorizon`, `editRecCapital` remain for grid/DCA path. No removal needed.

---

## Part 3: Error Handling

- Recommendation fetch fails: show inline error, allow manual mode fallback.
- Save fails: show error message below form, keep form open.
- Session running: disable save button, show tooltip "Hentikan session sebelum mengubah config".
- Invalid field values (e.g. slow_period < fast_period + 2): client-side validation before calling API.

---

## Part 4: Validation Rules (client-side, mirrors backend)

- `fast_period >= 2`
- `slow_period >= fast_period + 2`
- `slow_period <= 200`
- `quantity > 0`
- `interval` must be one of `5m`, `15m`, `1h`, `4h`
- `validation_target_value >= 0`
- `validation_invalid_value >= 0`
- `validation_window_minutes` between 0 and 10080
- `stop_loss_pct` between 0 and 99.99
- `take_profit_pct` between 0 and 1000

---

## Part 5: Acceptance Criteria

- Clicking "✏️ Edit" on a trend session opens `TrendEditConfigForm` instead of raw JSON textarea.
- Beginner mode shows horizon + capital + recommendation button.
- Clicking "Rekomendasi" fetches `api.trend.recommend` and auto-fills form fields.
- Preview card shows SMA, interval, qty, validation values, reason.
- Manual mode shows all fields pre-filled from current config.
- Toggling between beginner/manual preserves field values.
- Save calls `api.sessions.applyConfig` with correct JSON.
- Existing config fields not in the form are preserved.
- Error message shown if save fails.
- Save disabled when session is running.
- Grid and DCA edit config behavior is completely unaffected.
- Client-side validation prevents invalid field combinations.
