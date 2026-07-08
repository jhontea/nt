# Dashboard Visual Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Improve visual hierarchy of dashboard /sessions page — StatsRow, SessionCard, and preset cards.

**Architecture:** Targeted CSS/Tailwind changes to existing components in a single file. No structural changes, no new components, no new dependencies.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS

## Global Constraints

- Only modify rontend/src/app/sessions/page.tsx
- No structural/layout changes — only className and minor JSX changes
- Maintain dark mode support for every change
- Brand colors: Grid=#9fe870, Trend=#38c8ff, DCA=#ffd11a
- Build must pass: 
pm run build in rontend/ with no TypeScript errors

---

### Task 1: StatsRow Visual Improvement

**Files:**
- Modify: rontend/src/app/sessions/page.tsx — StatsRow component (lines 93-139)

**Interfaces:**
- Consumes: stats, ctiveFilter, onFilterChange (unchanged)
- Produces: Improved StatsRow with pulse dot indicator and better active state

- [ ] **Step 1: Replace StatsRow return JSX**

Find the current StatsRow return block (line 105-138) and replace with:

`	sx
return (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
    {filters.map(f => {
      const isActive = activeFilter === f.key
      const stat = stats[f.key]
      const hasRunning = stat.running > 0
      return (
        <button
          key={f.key}
          onClick={() => onFilterChange(f.key)}
          className={elative bg-white dark:bg-[#1e201c] rounded-[16px] p-4 text-left transition-all border-2 }
        >
          {/* Running pulse dot — top right */}
          {hasRunning && (
            <span className="absolute top-3 right-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />
              <span className="text-[10px] font-bold text-[#9fe870]">{stat.running}</span>
            </span>
          )}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{f.icon}</span>
            <span className={	ext-base font-bold }>
              {f.label}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={	ext-2xl font-black }>
              {stat.total}
            </span>
            <span className="text-xs text-[#686868] dark:text-[#898989]">
              sesi
            </span>
          </div>
        </button>
      )
    })}
  </div>
)
`

- [ ] **Step 2: Build check**

`ash
cd frontend && npm run build
`
Expected: Compiled successfully, no TypeScript errors

- [ ] **Step 3: Commit**

`ash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat(ui): improve StatsRow visual hierarchy — pulse dot, active gradient, running border"
`

---

### Task 2: SessionCard Left Border + Running/Stopped Differentiation

**Files:**
- Modify: rontend/src/app/sessions/page.tsx — SessionCard component (lines ~730+)

**Interfaces:**
- Consumes: session prop (unchanged)
- Produces: Card with left border per strategy, better running/stopped visual differentiation

- [ ] **Step 1: Find SessionCard outer div and add left border**

Find this line in SessionCard (around line 740):
`	sx
<div className="bg-white dark:bg-[#1e201c] rounded-[24px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] hover:shadow-[0_8px_32px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all p-5 cursor-pointer group" onClick={() => onDetail(session.id)}>
`

Replace with:
`	sx
<div
  className={g-white dark:bg-[#1e201c] rounded-[24px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] hover:shadow-[0_8px_32px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all p-5 cursor-pointer group border-l-4  }
  onClick={() => onDetail(session.id)}
>
`

- [ ] **Step 2: Make running dot bigger and more visible**

Find the running status dot (around line 770):
`	sx
<span className={inline-block w-1.5 h-1.5 rounded-full } title={session.is_alive ? 'Goroutine aktif' : 'Status DB running, goroutine belum jalan'} />
`

Replace with:
`	sx
<span className={inline-block w-2 h-2 rounded-full } title={session.is_alive ? 'Goroutine aktif' : 'Status DB running, goroutine belum jalan'} />
`

- [ ] **Step 3: Make symbol more prominent**

Find (around line 775):
`	sx
<span className="font-medium text-[#5a5b58] dark:text-[#8a8d88]">{session.symbol}</span>
`

Replace with:
`	sx
<span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{session.symbol}</span>
`

- [ ] **Step 4: Build check**

`ash
cd frontend && npm run build
`
Expected: Compiled successfully, no TypeScript errors

- [ ] **Step 5: Commit**

`ash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat(ui): improve SessionCard — left border per strategy, running state, symbol prominence"
`

---

### Task 3: Preset Cards Icon Background

**Files:**
- Modify: rontend/src/app/sessions/page.tsx — preset cards render block (lines ~680+)

**Interfaces:**
- Consumes: presets array (unchanged)
- Produces: Preset cards with colored icon circle backgrounds

- [ ] **Step 1: Find preset card map and update icon rendering**

Find the preset cards render block:
`	sx
{presets.map(p => (
  <button key={p.label} onClick={() => applyPreset(p)}
    className="bg-white dark:bg-[#1e201c] hover:bg-[rgba(159,232,112,0.04)] dark:hover:bg-[rgba(159,232,112,0.08)] rounded-[24px] p-4 text-left transition-all border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(159,232,112,0.5)] hover:shadow-[0_4px_16px_rgba(159,232,112,0.12)] group">
    <p className="font-bold text-sm text-[#0e0f0c] dark:text-[#e8ebe6] mb-1 group-hover:text-[#163300] dark:group-hover:text-[#9fe870]">{p.label}</p>
    <p className="text-xs text-[#686868] dark:text-[#898989] leading-snug">{p.desc}</p>
  </button>
))}
`

Replace with:
`	sx
{presets.map(p => {
  const iconBg = p.strategy === 'grid'
    ? 'bg-[rgba(159,232,112,0.15)]'
    : p.strategy === 'trend'
    ? 'bg-[rgba(56,200,255,0.12)]'
    : 'bg-[rgba(255,209,26,0.12)]'
  // extract emoji from label (first char sequence before space)
  const icon = p.label.split(' ')[0]
  const labelText = p.label.split(' ').slice(1).join(' ')
  return (
    <button key={p.label} onClick={() => applyPreset(p)}
      className="bg-white dark:bg-[#1e201c] hover:bg-[rgba(159,232,112,0.04)] dark:hover:bg-[rgba(159,232,112,0.08)] rounded-[24px] p-4 text-left transition-all border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(159,232,112,0.5)] hover:shadow-[0_4px_16px_rgba(159,232,112,0.12)] group flex flex-col gap-2">
      <div className={w-10 h-10 rounded-full  flex items-center justify-center text-xl flex-shrink-0}>
        {icon}
      </div>
      <div>
        <p className="font-bold text-sm text-[#0e0f0c] dark:text-[#e8ebe6] mb-0.5 group-hover:text-[#163300] dark:group-hover:text-[#9fe870]">{labelText}</p>
        <p className="text-xs text-[#5a5b58] dark:text-[#8a8d88] leading-snug">{p.desc}</p>
      </div>
    </button>
  )
})}
`

- [ ] **Step 2: Build check**

`ash
cd frontend && npm run build
`
Expected: Compiled successfully, no TypeScript errors

- [ ] **Step 3: Commit**

`ash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat(ui): improve preset cards — icon circle background per strategy"
`

---

## Self-Review

✓ Spec coverage:
  - StatsRow pulse dot + active gradient + running border → Task 1
  - SessionCard left border per strategy → Task 2
  - SessionCard running/stopped differentiation → Task 2
  - SessionCard symbol prominence → Task 2
  - Preset cards icon background → Task 3
✓ No placeholders — all code blocks complete
✓ Type consistency — no new types introduced, all existing props unchanged
✓ Dark mode — every className change includes dark: variant
✓ Build verification step in every task
