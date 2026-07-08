# Dashboard Filter & Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\- [ ]\) syntax for tracking.

**Goal:** Add filter tabs and stats row to dashboard sessions page for filtering by strategy (All/Grid/Trend/DCA)

**Architecture:** Client-side filtering using React state. Stats calculated from existing sessions data. No backend changes.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, TanStack Query, Tailwind CSS

## Global Constraints

- Filter operates client-side only
- No new API endpoints
- Maintain existing design system (colors, spacing, rounded corners)
- Responsive: 4 columns on desktop, 2 columns on mobile

---

### Task 1: Add Filter State and Stats Calculation

**Files:**
- Modify: \rontend/src/app/sessions/page.tsx:93-665\

**Interfaces:**
- Consumes: \sessions\ from TanStack Query
- Produces: \ctiveFilter\ state, \stats\ object, \ilteredSessions\ array

- [ ] **Step 1: Add filter state after existing state declarations**

After line 130 (\const [nameEdited, setNameEdited] = useState(false)\), add:

\\\	ypescript
const [activeFilter, setActiveFilter] = useState<'all' | 'grid' | 'trend' | 'dca'>('all')
\\\

- [ ] **Step 2: Add stats calculation after filter state**

\\\	ypescript
const stats = sessions ? {
  all: { 
    total: sessions.length, 
    running: sessions.filter(s => s.status === 'running').length 
  },
  grid: { 
    total: sessions.filter(s => s.strategy === 'grid').length, 
    running: sessions.filter(s => s.strategy === 'grid' && s.status === 'running').length 
  },
  trend: { 
    total: sessions.filter(s => s.strategy === 'trend').length, 
    running: sessions.filter(s => s.strategy === 'trend' && s.status === 'running').length 
  },
  dca: { 
    total: sessions.filter(s => s.strategy === 'dca').length, 
    running: sessions.filter(s => s.strategy === 'dca' && s.status === 'running').length 
  }
} : { all: { total: 0, running: 0 }, grid: { total: 0, running: 0 }, trend: { total: 0, running: 0 }, dca: { total: 0, running: 0 } }
\\\

- [ ] **Step 3: Add filtered sessions calculation**

\\\	ypescript
const filteredSessions = sessions?.filter(s => 
  activeFilter === 'all' ? true : s.strategy === activeFilter
)
\\\

- [ ] **Step 4: Verify TypeScript compiles**

Run: \cd frontend && npm run build\
Expected: No TypeScript errors

- [ ] **Step 5: Commit**

\\\ash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat: add filter state and stats calculation"
\\\

---

### Task 2: Create Stats Row Component

**Files:**
- Modify: \rontend/src/app/sessions/page.tsx:298-299\ (insert after Market Ticker)

**Interfaces:**
- Consumes: \stats\ object, \ctiveFilter\ state, \setActiveFilter\ function
- Produces: Stats row UI with 4 clickable cards

- [ ] **Step 1: Add StatsRow component before SessionsPage component**

Insert before line 93 (\export default function SessionsPage()\):

\\\	ypescript
function StatsRow({ stats, activeFilter, onFilterChange }: {
  stats: { all: { total: number; running: number }; grid: { total: number; running: number }; trend: { total: number; running: number }; dca: { total: number; running: number } }
  activeFilter: 'all' | 'grid' | 'trend' | 'dca'
  onFilterChange: (filter: 'all' | 'grid' | 'trend' | 'dca') => void
}) {
  const filters = [
    { key: 'all' as const, label: 'All', icon: '🤖' },
    { key: 'grid' as const, label: 'Grid', icon: '📐' },
    { key: 'trend' as const, label: 'Trend', icon: '📈' },
    { key: 'dca' as const, label: 'DCA', icon: '🪙' }
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      {filters.map(f => {
        const isActive = activeFilter === f.key
        const stat = stats[f.key]
        return (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={\g-white dark:bg-[#1e201c] rounded-[16px] p-4 text-left transition-all border-2 \\}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{f.icon}</span>
              <span className={\	ext-sm font-bold \\}>
                {f.label}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={\	ext-2xl font-black \\}>
                {stat.total}
              </span>
              <span className="text-xs text-[#686868] dark:text-[#898989]">
                {stat.running} running
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
\\\

- [ ] **Step 2: Insert StatsRow in render tree**

Find line 298 (after Market Ticker closing div). Insert after the Market Ticker section and before Form panel:

\\\	ypescript
{/* Stats Row */}
<StatsRow stats={stats} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
\\\

- [ ] **Step 3: Test in browser**

Run: \cd frontend && npm run dev\
Open: \http://localhost:3000/sessions\
Expected: See 4 stats cards below market ticker

- [ ] **Step 4: Commit**

\\\ash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat: add stats row component with filter tabs"
\\\

---

### Task 3: Apply Filter to Session List

**Files:**
- Modify: \rontend/src/app/sessions/page.tsx:644-654\ (session list rendering)

**Interfaces:**
- Consumes: \ilteredSessions\ array from Task 1
- Produces: Filtered session list display

- [ ] **Step 1: Replace sessions with filteredSessions in list rendering**

Find line 644 (\} : sessions?.length ? (\) and change to:

\\\	ypescript
} : filteredSessions?.length ? (
\\\

- [ ] **Step 2: Update session count display**

Find line 647 (\<h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Sessions aktif · {sessions.length}</h2>\) and change to:

\\\	ypescript
<h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Sessions aktif · {filteredSessions.length}</h2>
\\\

- [ ] **Step 3: Update map iteration**

Find line 650 (\{sessions.map(s => (\) and change to:

\\\	ypescript
{filteredSessions.map(s => (
\\\

- [ ] **Step 4: Test filter interaction**

Run: \cd frontend && npm run dev\
Test: Click each stats card (All/Grid/Trend/DCA)
Expected: Session list updates to show only matching strategy

- [ ] **Step 5: Commit**

\\\ash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat: apply filter to session list rendering"
\\\

---

### Task 4: Add Empty State per Filter

**Files:**
- Modify: \rontend/src/app/sessions/page.tsx:655-661\ (empty state section)

**Interfaces:**
- Consumes: \ctiveFilter\ state, \ilteredSessions\ array
- Produces: Strategy-specific empty state message

- [ ] **Step 1: Replace generic empty state with filter-aware version**

Find lines 655-661 (empty state) and replace with:

\\\	ypescript
) : (
  <div className="text-center py-16">
    <div className="w-14 h-14 rounded-[24px] bg-[rgba(159,232,112,0.1)] flex items-center justify-center text-2xl mx-auto mb-4">
      {activeFilter === 'all' ? '🤖' : activeFilter === 'grid' ? '📐' : activeFilter === 'trend' ? '📈' : '🪙'}
    </div>
    <p className="text-[#0e0f0c] dark:text-[#e8ebe6] text-lg font-bold">
      {activeFilter === 'all' 
        ? 'Belum ada session' 
        : \Belum ada session \\
      }
    </p>
    <p className="text-[#686868] dark:text-[#898989] text-sm mt-1">
      {activeFilter === 'all'
        ? 'Pilih preset di atas atau klik "+ New Session"'
        : 'Klik "+ New Session" atau pilih preset di atas'
      }
    </p>
  </div>
)
\\\

- [ ] **Step 2: Test empty states**

Run: \cd frontend && npm run dev\
Test: Delete all sessions or filter to a strategy with 0 sessions
Expected: See strategy-specific empty state with correct icon

- [ ] **Step 3: Commit**

\\\ash
git add frontend/src/app/sessions/page.tsx
git commit -m "feat: add strategy-specific empty states"
\\\

---

### Task 5: Manual Testing & Verification

**Files:**
- Test: \rontend/src/app/sessions/page.tsx\

**Interfaces:**
- Consumes: Complete implementation from Tasks 1-4
- Produces: Verified working feature

- [ ] **Step 1: Test all filter states**

Actions:
1. Create 2 Grid sessions, 1 Trend session, 1 DCA session
2. Click All tab → expect 4 sessions
3. Click Grid tab → expect 2 Grid sessions
4. Click Trend tab → expect 1 Trend session
5. Click DCA tab → expect 1 DCA session

Expected: Each filter shows correct sessions

- [ ] **Step 2: Test stats accuracy**

Actions:
1. Start 1 Grid session
2. Verify All card shows "4 total, 1 running"
3. Verify Grid card shows "2 total, 1 running"

Expected: Running counts accurate

- [ ] **Step 3: Test responsive layout**

Actions:
1. Resize browser to mobile width
2. Verify stats row shows 2 columns

Expected: Responsive grid works

- [ ] **Step 4: Test empty states**

Actions:
1. Filter to DCA (if no DCA sessions exist)
2. Verify empty state shows DCA icon and message

Expected: Correct empty state per filter

- [ ] **Step 5: Final commit**

\\\ash
git add -A
git commit -m "test: verify dashboard filter and stats functionality"
\\\

---

## Self-Review Complete

✓ Spec coverage: All requirements implemented (filter tabs, stats row, empty states, client-side only)
✓ No placeholders: All code blocks complete
✓ Type consistency: \ctiveFilter\ type matches across all tasks
✓ File paths: Exact line numbers and paths provided

