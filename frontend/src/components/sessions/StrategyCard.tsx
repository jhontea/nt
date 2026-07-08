'use client'
import { Grid2x2, TrendingUp, Coins } from 'lucide-react'
import type { Session } from '@/types'

const STRATS = [
  { key: 'grid' as const, label: 'Grid', icon: <Grid2x2 size={16} />, color: 'rgba(159,232,112,0.12)', textColor: 'text-[#163300] dark:text-[#9fe870]', borderColor: 'border-[rgba(159,232,112,0.25)]' },
  { key: 'trend' as const, label: 'Trend', icon: <TrendingUp size={16} />, color: 'rgba(56,200,255,0.1)', textColor: 'text-[#0994b3] dark:text-[#5dd8f5]', borderColor: 'border-[rgba(56,200,255,0.2)]' },
  { key: 'dca' as const, label: 'DCA', icon: <Coins size={16} />, color: 'rgba(255,209,26,0.1)', textColor: 'text-[#7a5f00] dark:text-[#f5c842]', borderColor: 'border-[rgba(255,209,26,0.2)]' },
] as const

export function StrategyCards({ sessions, onOpen }: { sessions: Session[]; onOpen: (s: 'grid' | 'trend' | 'dca') => void }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest mb-3">Overview per Strategi</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STRATS.map(strat => {
          const stratSessions = sessions.filter(s => s.strategy === strat.key)
          if (stratSessions.length === 0) return null
          const running = stratSessions.filter(s => s.status === 'running').length
          const paperSessions = stratSessions.filter(s => s.mode === 'paper')
          const signalSessions = stratSessions.filter(s => s.mode === 'signal')
          const bestBalance = paperSessions.reduce((best, s) => { const bal = s.virtual_balance ?? 0; return bal > best ? bal : best }, 0)
          const bestInitial = paperSessions.find(s => (s.virtual_balance ?? 0) === bestBalance)?.initial_balance ?? 1000
          const bestPct = bestInitial > 0 ? ((bestBalance - bestInitial) / bestInitial) * 100 : 0
          return (
            <button key={strat.key} onClick={() => onOpen(strat.key)}
              className={`bg-white dark:bg-[#1e201c] rounded-[20px] p-4 text-left border ${strat.borderColor} hover:shadow-[0_4px_16px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center`} style={{ background: strat.color }}>{strat.icon}</span>
                  <span className={`text-sm font-bold ${strat.textColor}`}>{strat.label}</span>
                </div>
                {running > 0 && (<span className="flex items-center gap-1 text-[10px] font-bold text-[#9fe870]"><span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />{running} running</span>)}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div><p className="text-[#686868] dark:text-[#898989]">Total</p><p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{stratSessions.length}</p></div>
                <div><p className="text-[#686868] dark:text-[#898989]">Paper</p><p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{paperSessions.length}</p></div>
                <div><p className="text-[#686868] dark:text-[#898989]">Signal</p><p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{signalSessions.length}</p></div>
              </div>
              {paperSessions.length > 0 && bestBalance > 0 && (
                <div className="border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] pt-2.5">
                  <p className="text-[10px] text-[#686868] dark:text-[#898989] mb-1">Best Paper Balance</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-[#0e0f0c] dark:text-[#e8ebe6]">${bestBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className={`text-[10px] font-bold ${bestPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>{bestPct >= 0 ? '+' : ''}{bestPct.toFixed(1)}%</span>
                  </div>
                </div>
              )}
              <p className={`text-[10px] font-semibold mt-2.5 ${strat.textColor}`}>Lihat {strat.label} →</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
