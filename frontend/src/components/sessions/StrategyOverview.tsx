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
  const liveSessions = stratSessions.filter(s => s.mode === 'live')
  const signalSessions = stratSessions.filter(s => s.mode === 'signal')
  const liveRunning = liveSessions.filter(s => s.status === 'running').length
  const paperRunning = paperSessions.filter(s => s.status === 'running').length
  const totalRunning = stratSessions.filter(s => s.status === 'running').length

  const avgBalance = paperSessions.length > 0
    ? paperSessions.reduce((sum, s) => sum + (s.virtual_balance ?? 0), 0) / paperSessions.length
    : null
  const avgInitial = paperSessions.length > 0
    ? paperSessions.reduce((sum, s) => sum + (s.initial_balance ?? 0), 0) / paperSessions.length
    : 0
  const avgPct = avgBalance !== null && avgInitial > 0 ? ((avgBalance - avgInitial) / avgInitial) * 100 : null

  return (
    <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest">{LABEL[strategy]}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs items-center">
        <span><span className="text-[#686868] dark:text-[#898989]">Total </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{stratSessions.length}</span></span>
        {totalRunning > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />
            <span className="font-bold text-[#054d28] dark:text-[#9fe870]">{totalRunning} running</span>
            {liveRunning > 0 && (
              <span className="text-[9px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.08)] px-1.5 py-0.5 rounded-full">⚡ {liveRunning} live</span>
            )}
          </span>
        )}
        <span><span className="text-[#686868] dark:text-[#898989]">Paper </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{paperSessions.length}</span>{paperRunning > 0 && <span className="text-[#9fe870] ml-1">({paperRunning})</span>}</span>
        {liveSessions.length > 0 && (
          <span><span className="text-[#686868] dark:text-[#898989]">Live </span><span className="font-bold text-[#d03238] dark:text-[#ff6b6f]">{liveSessions.length}</span></span>
        )}
        {signalSessions.length > 0 && (
          <span><span className="text-[#686868] dark:text-[#898989]">Signal </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{signalSessions.length}</span></span>
        )}
        {avgBalance !== null && avgPct !== null && (
          <span>
            <span className="text-[#686868] dark:text-[#898989]">Avg paper </span>
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
