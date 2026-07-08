'use client'
import type { Session } from '@/types'

const LABEL: Record<string, string> = {
  grid: 'Grid Trading',
  trend: 'Trend Following',
  dca: 'DCA',
}

export function StrategyOverview({ sessions, strategy }: { sessions: Session[]; strategy: 'grid' | 'trend' | 'dca' }) {
  const stratSessions = sessions.filter(s => s.strategy === strategy)
  const paperSessions = stratSessions.filter(s => s.mode === 'paper')
  const signalSessions = stratSessions.filter(s => s.mode === 'signal')
  const running = stratSessions.filter(s => s.status === 'running')
  const paperRunning = paperSessions.filter(s => s.status === 'running')

  const avgBalance = paperSessions.length > 0
    ? paperSessions.reduce((sum, s) => sum + (s.virtual_balance ?? 0), 0) / paperSessions.length
    : null
  const avgInitial = paperSessions.length > 0
    ? paperSessions.reduce((sum, s) => sum + (s.initial_balance ?? 0), 0) / paperSessions.length
    : 0
  const avgPct = avgBalance !== null && avgInitial > 0 ? ((avgBalance - avgInitial) / avgInitial) * 100 : null

  return (
    <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-6 flex flex-wrap items-center gap-4">
      <span className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest">{LABEL[strategy]}</span>
      <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)]" />
      <div className="flex flex-wrap gap-4 text-xs">
        <span><span className="text-[#686868] dark:text-[#898989]">Total </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{stratSessions.length}</span></span>
        <span><span className="text-[#686868] dark:text-[#898989]">Running </span><span className="font-bold text-[#9fe870]">{running.length}</span></span>
        <span><span className="text-[#686868] dark:text-[#898989]">Paper </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{paperSessions.length}</span>{paperRunning.length > 0 && <span className="text-[#9fe870] ml-1">({paperRunning.length} running)</span>}</span>
        <span><span className="text-[#686868] dark:text-[#898989]">Signal </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{signalSessions.length}</span></span>
        {avgBalance !== null && avgPct !== null && (
          <span>
            <span className="text-[#686868] dark:text-[#898989]">Avg balance </span>
            <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">${avgBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span className={`ml-1 font-semibold ${avgPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
              {avgPct >= 0 ? '+' : ''}{avgPct.toFixed(1)}%
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
