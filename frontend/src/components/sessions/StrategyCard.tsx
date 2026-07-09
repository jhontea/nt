'use client'
import { Grid2x2, TrendingUp, Coins, Zap } from 'lucide-react'
import type { Session } from '@/types'

const STRATS = [
  { key: 'grid' as const, label: 'Grid', icon: <Grid2x2 size={16} />, color: 'rgba(159,232,112,0.12)', textColor: 'text-[#163300] dark:text-[#9fe870]', borderColor: 'border-[rgba(159,232,112,0.25)]', hoverBorder: 'hover:border-[rgba(159,232,112,0.5)]' },
  { key: 'trend' as const, label: 'Trend', icon: <TrendingUp size={16} />, color: 'rgba(56,200,255,0.1)', textColor: 'text-[#0994b3] dark:text-[#5dd8f5]', borderColor: 'border-[rgba(56,200,255,0.2)]', hoverBorder: 'hover:border-[rgba(56,200,255,0.45)]' },
  { key: 'dca' as const, label: 'DCA', icon: <Coins size={16} />, color: 'rgba(255,209,26,0.1)', textColor: 'text-[#7a5f00] dark:text-[#f5c842]', borderColor: 'border-[rgba(255,209,26,0.2)]', hoverBorder: 'hover:border-[rgba(255,209,26,0.45)]' },
] as const

export function StrategyCards({ sessions, onOpen }: { sessions: Session[]; onOpen: (s: 'grid' | 'trend' | 'dca') => void }) {
  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest mb-3">Strategi</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STRATS.map(strat => {
          const stratSessions = sessions.filter(s => s.strategy === strat.key)
          if (stratSessions.length === 0) return null
          const running = stratSessions.filter(s => s.status === 'running').length
          const liveRunning = stratSessions.filter(s => s.status === 'running' && s.mode === 'live').length
          const paperSessions = stratSessions.filter(s => s.mode === 'paper')
          const liveSessions = stratSessions.filter(s => s.mode === 'live')
          const signalSessions = stratSessions.filter(s => s.mode === 'signal')
          const bestBalance = paperSessions.reduce((best, s) => { const bal = s.virtual_balance ?? 0; return bal > best ? bal : best }, 0)
          const bestInitial = paperSessions.find(s => (s.virtual_balance ?? 0) === bestBalance)?.initial_balance ?? 1000
          const bestPct = bestInitial > 0 ? ((bestBalance - bestInitial) / bestInitial) * 100 : 0
          const hasLive = liveSessions.length > 0
          const border = hasLive && liveRunning > 0
            ? 'border-[rgba(208,50,56,0.35)] hover:border-[rgba(208,50,56,0.55)]'
            : `${strat.borderColor} ${strat.hoverBorder}`

          return (
            <button key={strat.key} onClick={() => onOpen(strat.key)}
              className={`bg-white dark:bg-[#1e201c] rounded-[20px] p-4 text-left border ${border} transition-all hover:shadow-[0_4px_16px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]`}>

              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: strat.color }}>
                    <span className={strat.textColor}>{strat.icon}</span>
                  </span>
                  <span className={`text-sm font-bold ${strat.textColor}`}>{strat.label}</span>
                </div>
                {running > 0 && (
                  <div className="flex items-center gap-1.5">
                    {liveRunning > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.08)] px-1.5 py-0.5 rounded-full">
                        <span className="w-1 h-1 rounded-full bg-[#d03238] animate-pulse" />{liveRunning}⚡
                      </span>
                    )}
                    {running - liveRunning > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#054d28] dark:text-[#9fe870] bg-[rgba(159,232,112,0.1)] px-1.5 py-0.5 rounded-full">
                        <span className="w-1 h-1 rounded-full bg-[#9fe870] animate-pulse" />{running - liveRunning}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div className="bg-[rgba(14,15,12,0.03)] dark:bg-[rgba(232,235,230,0.03)] rounded-[10px] px-2 py-1.5">
                  <p className="text-[9px] text-[#686868] dark:text-[#898989] uppercase tracking-wide">Total</p>
                  <p className="font-black text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5 text-sm">{stratSessions.length}</p>
                </div>
                <div className="bg-[rgba(14,15,12,0.03)] dark:bg-[rgba(232,235,230,0.03)] rounded-[10px] px-2 py-1.5">
                  <p className="text-[9px] text-[#686868] dark:text-[#898989] uppercase tracking-wide">Paper</p>
                  <p className="font-black text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5 text-sm">{paperSessions.length}</p>
                </div>
                <div className={`rounded-[10px] px-2 py-1.5 ${hasLive ? 'bg-[rgba(208,50,56,0.06)] dark:bg-[rgba(208,50,56,0.08)]' : 'bg-[rgba(14,15,12,0.03)] dark:bg-[rgba(232,235,230,0.03)]'}`}>
                  <p className="text-[9px] text-[#686868] dark:text-[#898989] uppercase tracking-wide">{hasLive ? 'Live' : 'Signal'}</p>
                  <p className={`font-black mt-0.5 text-sm ${hasLive ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#0e0f0c] dark:text-[#e8ebe6]'}`}>
                    {hasLive ? liveSessions.length : signalSessions.length}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-[rgba(14,15,12,0.05)] dark:border-[rgba(232,235,230,0.05)] pt-2.5 flex items-center justify-between">
                {paperSessions.length > 0 && bestBalance > 0 ? (
                  <div>
                    <p className="text-[9px] text-[#686868] dark:text-[#898989] mb-0.5">Best Paper</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-black text-[#0e0f0c] dark:text-[#e8ebe6]">${bestBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className={`text-[10px] font-bold ${bestPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>{bestPct >= 0 ? '+' : ''}{bestPct.toFixed(1)}%</span>
                    </div>
                  </div>
                ) : hasLive ? (
                  <div className="flex items-center gap-1">
                    <Zap size={10} className="text-[#d03238] dark:text-[#ff6b6f]" />
                    <span className="text-[10px] font-semibold text-[#d03238] dark:text-[#ff6b6f]">{liveSessions.length} live</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-[#686868] dark:text-[#898989]">{signalSessions.length} signal only</span>
                )}
                <span className={`text-[10px] font-semibold ${strat.textColor}`}>Lihat →</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
