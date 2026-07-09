# Trend Edit Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-friendly form for editing trend session config on the detail page, with beginner mode (recommendation) and manual mode.

**Architecture:** New `TrendEditConfigForm` component mirrors the create session form experience. Integrated into the detail page's existing edit config block by branching on `session.strategy === 'trend'`. No backend changes needed — uses existing `PATCH /v1/sessions/:id/config`.

**Tech Stack:** Next.js 16, TypeScript, React, TanStack Query, Tailwind CSS, api.ts, types/index.ts

## Global Constraints

- No new dependencies
- Follow existing Tailwind color tokens: `#9fe870` (green), `#38c8ff` (blue/trend), `#0e0f0c`/`#e8ebe6` text, `#f0f1ee`/`#252822` input bg
- Trend color accent: `rgba(56,200,255,0.85)` (same as create form)
- `api.trend.recommend({ symbol, horizon, capital })` returns `TrendRecommendation` from `src/types/index.ts`
- `api.sessions.applyConfig(sessionId, configJSON)` for save — `configJSON` is a JSON string
- Save disabled when `session.status === 'running'`
- Preserve existing config fields not in the form by merging with `currentConfig`
- Grid and DCA edit config behavior must be completely unaffected

---
### Task 1: TrendEditConfigForm component

**Files:**
- Create: `frontend/src/components/sessions/TrendEditConfigForm.tsx`

**Interfaces:**
- Consumes: `api.trend.recommend`, `api.sessions.applyConfig`, `TrendRecommendation` type
- Produces: `<TrendEditConfigForm sessionId symbol currentConfig onSaved onCancel />`

