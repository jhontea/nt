'use client'
import { useRouter } from 'next/navigation'
import { TrendingUp, Trophy, TrendingDown, Zap } from 'lucide-react'
import type { Session } from '@/types'

const strategyLabel = (s: Session) =>
  s.strategy === 'grid' ? 'Grid' : s.strategy === 'trend' ? 'Trend' : 'DCA'

export function PerformanceSummary({ sessions }: { sessions: Session[] }) {
  const router = useRouter()

  const paper = sessions.filter(s => s.mode === 'paper' && s.virtual_balance != null)
  const totalInitial = paper.reduce((sum, s) => sum + (s.initial_balance ?? 0), 0)
  const totalCurrent = paper.reduce((sum, s) => sum + (s.virtual_balance ?? 0), 0)
  const pnl = totalCurrent - totalInitial
  const pnlPct = totalInitial > 0 ? (pnl / totalInitial) * 100 : 0

  let best: Session | null = null
  let bestPct = -Infinity
  let worst: Session | null = null
  let worstPct = Infinity
  for (const s of paper) {
    const init = s.initial_balance ?? 0
    if (init <= 0) continue
    const pct = ((s.virtual_balance! - init) / init) * 100
    if (pct > bestPct) { bestPct = pct; best = s }
    if (pct < worstPct) { worstPct = pct; worst = s }
  }

  const liveSessions = sessions.filter(s => s.mode === 'live')
  const liveRunning = liveSessions.filter(s => s.status === 'running')
  const hasPaper = paper.length > 0

  return (
    <div className="mb-6 space-y-3">
      {/* Live sessions block — only shown when live exists, prominent */}
      {liveSessions.length > 0 && (
        <div className={`rounded-[20px] border p-4 ${liveRunning.length > 0 ? 'border-[rgba(208,50,56,0.3)] bg-[rgba(208,50,56,0.03)] dark:bg-[rgba(208,50,56,0.06)]' : 'border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] bg-white dark:bg-[#1e201c]'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className={liveRunning.length > 0 ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#686868] dark:text-[#898989]'} />
            <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6] uppercase tracking-widest">Live Sessions</span>
            {liveRunning.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#d03238] animate-pulse" />}
            <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${liveRunning.length > 0 ? 'bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]' : 'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989]'}`}>
              {liveRunning.length > 0 ? `${liveRunning.length} running` : 'semua stopped'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {liveSessions.map(s => {
              const isRunning = s.status === 'running'
              return (
                <button key={s.id} onClick={() => router.push(`/sessions/${s.id}`)}
                  className={`text-left px-3 py-2.5 rounded-[14px] border transition-colors ${isRunning ? 'border-[rgba(208,50,56,0.2)] bg-white dark:bg-[#1e201c] hover:border-[rgba(208,50,56,0.4)]' : 'border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] bg-[rgba(14,15,12,0.02)] dark:bg-[rgba(232,235,230,0.02)] hover:bg-white dark:hover:bg-[#1e201c]'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-[#d03238] animate-pulse flex-shrink-0" />}
                    <span className="text-[10px] font-bold text-[#0e0f0c] dark:text-[#e8ebe6] truncate">{s.name}</span>
                  </div>
                  <p className="text-[9px] text-[#686868] dark:text-[#898989] truncate">{s.symbol.replace('_','/')} · {strategyLabel(s)}</p>
                  <p className={`text-[9px] font-semibold mt-0.5 ${isRunning ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#686868] dark:text-[#898989]'}`}>
                    {isRunning ? '● Running' : '○ Stopped'}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Paper performance cards */}
      {hasPaper && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              icon: <TrendingUp size={16} />, label: 'Paper P&L',
              value: `$${totalCurrent.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              sub: `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`,
              color: pnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]',
            },
            {
              icon: <Trophy size={16} />, label: 'Best Performer',
              value: best ? `${strategyLabel(best)} ${best.symbol.replace('_','/')}` : '—',
              sub: best ? `${bestPct >= 0 ? '+' : ''}${bestPct.toFixed(1)}%` : 'belum ada data',
              color: best ? (bestPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]') : 'text-[#686868] dark:text-[#898989]',
              href: best ? `/sessions/${best.id}` : undefined,
            },
            {
              icon: <TrendingDown size={16} />, label: 'Worst Performer',
              value: worst && worst.id !== best?.id ? `${strategyLabel(worst)} ${worst.symbol.replace('_','/')}` : '—',
              sub: worst && worst.id !== best?.id ? `${worstPct >= 0 ? '+' : ''}${worstPct.toFixed(1)}%` : 'belum ada data',
              color: worst && worst.id !== best?.id ? (worstPct < 0 ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#054d28] dark:text-[#9fe870]') : 'text-[#686868] dark:text-[#898989]',
              href: worst && worst.id !== best?.id ? `/sessions/${worst.id}` : undefined,
            },
          ].map((c, i) => (
            <div key={i}
              onClick={c.href ? () => router.push(c.href as string) : undefined}
              role={c.href ? 'button' : undefined}
              tabIndex={c.href ? 0 : undefined}
              className={`bg-white dark:bg-[#1e201c] rounded-[18px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] ${c.href ? 'hover:border-[#9fe870] cursor-pointer transition-colors' : 'cursor-default'}`}>
              <div className="flex items-center gap-1.5 mb-2 text-[#686868] dark:text-[#898989]">
                <span className={c.color}>{c.icon}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">{c.label}</span>
              </div>
              <p className={`text-lg font-black text-[#0e0f0c] dark:text-[#e8ebe6] leading-tight truncate`}>{c.value}</p>
              <p className={`text-xs mt-0.5 truncate font-semibold ${c.color}`}>{c.sub}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
