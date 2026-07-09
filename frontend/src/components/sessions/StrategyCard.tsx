'use client'
import { useRouter } from 'next/navigation'
import { Grid2x2, TrendingUp, Coins, Zap } from 'lucide-react'
import type { Session } from '@/types'

const STRATS = [
  { key: 'grid' as const, label: 'Grid', desc: 'Order beli & jual berjenjang', icon: <Grid2x2 size={16} />, color: 'rgba(159,232,112,0.12)', textColor: 'text-[#163300] dark:text-[#9fe870]', borderColor: 'border-[rgba(159,232,112,0.25)]', hoverBorder: 'hover:border-[rgba(159,232,112,0.5)]', href: '/sessions/grid' },
  { key: 'trend' as const, label: 'Trend', desc: 'Ikuti tren pasar secara otomatis', icon: <TrendingUp size={16} />, color: 'rgba(56,200,255,0.1)', textColor: 'text-[#0994b3] dark:text-[#5dd8f5]', borderColor: 'border-[rgba(56,200,255,0.2)]', hoverBorder: 'hover:border-[rgba(56,200,255,0.45)]', href: '/sessions/trend' },
  { key: 'dca' as const, label: 'DCA', desc: 'Dollar-cost averaging berkala', icon: <Coins size={16} />, color: 'rgba(255,209,26,0.1)', textColor: 'text-[#7a5f00] dark:text-[#f5c842]', borderColor: 'border-[rgba(255,209,26,0.2)]', hoverBorder: 'hover:border-[rgba(255,209,26,0.45)]', href: '/sessions/dca' },
] as const

export function StrategyCards({ sessions }: { sessions: Session[] }) {
  const router = useRouter()
  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest mb-3">Strategi</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STRATS.map(strat => {
          const stratSessions = sessions.filter(s => s.strategy === strat.key)
          const running = stratSessions.filter(s => s.status === 'running').length
          const liveRunning = stratSessions.filter(s => s.status === 'running' && s.mode === 'live').length
          const hasLive = stratSessions.some(s => s.mode === 'live')
          const border = hasLive && liveRunning > 0
            ? 'border-[rgba(208,50,56,0.35)] hover:border-[rgba(208,50,56,0.55)]'
            : `${strat.borderColor} ${strat.hoverBorder}`

          return (
            <button key={strat.key} onClick={() => router.push(strat.href)}
              className={`bg-white dark:bg-[#1e201c] rounded-[20px] p-4 text-left border ${border} transition-all hover:shadow-[0_4px_16px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-[12px] flex items-center justify-center" style={{ background: strat.color }}>
                  <span className={strat.textColor}>{strat.icon}</span>
                </span>
                <div>
                  <span className={`text-sm font-bold ${strat.textColor}`}>{strat.label}</span>
                  <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">{strat.desc}</p>
                </div>
              </div>
              {running > 0 && (
                <div className="flex items-center gap-1.5 mb-2">
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
              <div className="border-t border-[rgba(14,15,12,0.05)] dark:border-[rgba(232,235,230,0.05)] pt-2.5 flex items-center justify-between">
                <span className="text-[10px] text-[#686868] dark:text-[#898989]">{stratSessions.length} session</span>
                <span className={`text-[10px] font-semibold ${strat.textColor}`}>Buka →</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
