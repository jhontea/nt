'use client'
import { Bot, Zap, TrendingUp, Trophy } from 'lucide-react'
import type { Session } from '@/types'

export function PerformanceSummary({ sessions }: { sessions: Session[] }) {
  const total = sessions.length
  const running = sessions.filter(s => s.status === 'running').length

  const paper = sessions.filter(s => s.mode === 'paper' && s.virtual_balance != null)
  const totalInitial = paper.reduce((sum, s) => sum + (s.initial_balance ?? 0), 0)
  const totalCurrent = paper.reduce((sum, s) => sum + (s.virtual_balance ?? 0), 0)
  const pnl = totalCurrent - totalInitial
  const pnlPct = totalInitial > 0 ? (pnl / totalInitial) * 100 : 0

  let best: Session | null = null
  let bestPct = -Infinity
  for (const s of paper) {
    const init = s.initial_balance ?? 0
    if (init <= 0) continue
    const pct = ((s.virtual_balance! - init) / init) * 100
    if (pct > bestPct) { bestPct = pct; best = s }
  }

  const cards = [
    { icon: <Bot size={18} />, label: 'Total Sessions', value: String(total), sub: `${running} running`, color: 'text-[#9fe870]' },
    { icon: <Zap size={18} />, label: 'Sedang Running', value: String(running), sub: running > 0 ? 'aktif' : 'tidak ada', color: 'text-[#9fe870]' },
    {
      icon: <TrendingUp size={18} />, label: 'Paper P&L',
      value: `$${totalCurrent.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      sub: `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`,
      color: pnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]',
    },
    {
      icon: <Trophy size={18} />, label: 'Best Performer',
      value: best ? best.name : '—',
      sub: best ? `${bestPct >= 0 ? '+' : ''}${bestPct.toFixed(1)}%` : 'belum ada',
      color: best ? (bestPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]') : 'text-[#686868] dark:text-[#898989]',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((c, i) => (
        <div key={i} className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
          <div className="flex items-center gap-2 mb-2 text-[#686868] dark:text-[#898989]">
            <span className={c.color}>{c.icon}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest">{c.label}</span>
          </div>
          <p className={`text-xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] leading-tight truncate ${c.color}`}>{c.value}</p>
          <p className="text-xs text-[#686868] dark:text-[#898989] mt-1 truncate">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}
