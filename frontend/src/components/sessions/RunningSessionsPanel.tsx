'use client'
import { useState } from 'react'
import { Grid2x2, TrendingUp, Coins, FileText, BarChart2, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import type { Session } from '@/types'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

const strategyIcon = (s: Session['strategy']) =>
  s === 'grid' ? <Grid2x2 size={14} /> : s === 'trend' ? <TrendingUp size={14} /> : <Coins size={14} />

const strategyIconColor = (s: Session['strategy']) =>
  s === 'grid'
    ? 'text-[#163300] dark:text-[#9fe870]'
    : s === 'trend'
    ? 'text-[#0994b3] dark:text-[#5dd8f5]'
    : 'text-[#7a5f00] dark:text-[#f5c842]'

const modeBadge = (m: Session['mode']) => {
  if (m === 'paper') return { label: 'Paper', icon: <FileText size={9} />, cls: 'bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870]' }
  if (m === 'live')  return { label: '⚡ Live', icon: <Zap size={9} />, cls: 'bg-[rgba(208,50,56,0.15)] text-[#d03238] dark:text-[#ff6b6f]' }
  return                     { label: 'Signal', icon: <BarChart2 size={9} />, cls: 'bg-[rgba(56,200,255,0.15)] text-[#0994b3] dark:text-[#5dd8f5]' }
}

export function RunningSessionsPanel({ sessions, router }: { sessions: Session[]; router: AppRouterInstance }) {
  const [expanded, setExpanded] = useState(false)
  const running = sessions.filter(s => s.status === 'running')
  const liveRunning = running.filter(s => s.mode === 'live')
  if (running.length === 0) return null

  return (
    <div className={`mt-4 mb-2 rounded-[20px] border overflow-hidden ${
      liveRunning.length > 0
        ? 'bg-white dark:bg-[#1e201c] border-[rgba(208,50,56,0.25)]'
        : 'bg-white dark:bg-[#1e201c] border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]'
    }`}>
      {/* header */}
      <button className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] text-left" onClick={() => setExpanded(!expanded)}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />
        <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6] uppercase tracking-widest">Running Now</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870] text-[10px] font-bold">{running.length}</span>
        {liveRunning.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f] text-[10px] font-bold">
            ⚡ {liveRunning.length} live
          </span>
        )}
        <span className="ml-auto text-[#686868] dark:text-[#898989] transition-transform">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>

      {/* rows */}
      <div className={`grid transition-all duration-200 ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <ul className="overflow-hidden">
        {/* Live sessions first */}
        {[...running].sort((a, b) => {
          if (a.mode === 'live' && b.mode !== 'live') return -1
          if (b.mode === 'live' && a.mode !== 'live') return 1
          return 0
        }).map((s, i) => {
          const badge = modeBadge(s.mode)
          const balanceColor = s.mode === 'paper' && s.virtual_balance != null && s.initial_balance != null
            ? s.virtual_balance >= s.initial_balance
              ? 'text-[#054d28] dark:text-[#9fe870]'
              : 'text-[#d03238] dark:text-[#ff6b6f]'
            : ''

          return (
            <li key={s.id}>
              <button
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors${i < running.length - 1 ? ' border-b border-[rgba(14,15,12,0.04)] dark:border-[rgba(232,235,230,0.04)]' : ''} ${
                  s.mode === 'live'
                    ? 'bg-[rgba(208,50,56,0.03)] dark:bg-[rgba(208,50,56,0.06)] hover:bg-[rgba(208,50,56,0.06)] dark:hover:bg-[rgba(208,50,56,0.1)]'
                    : 'hover:bg-[rgba(14,15,12,0.03)] dark:hover:bg-[rgba(232,235,230,0.03)]'
                }`}
                onClick={() => router.push(`/sessions/${s.id}`)}
              >
                {/* live pulse or strategy icon */}
                {s.mode === 'live'
                  ? <span className="w-1.5 h-1.5 rounded-full bg-[#d03238] animate-pulse shrink-0" />
                  : <span className={`shrink-0 ${strategyIconColor(s.strategy)}`}>{strategyIcon(s.strategy)}</span>
                }

                {/* name */}
                <span className="flex-1 min-w-0 text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] truncate">{s.name}</span>

                {/* symbol */}
                <span className="shrink-0 text-[11px] text-[#686868] dark:text-[#898989] font-mono">{s.symbol.replace('_', '/')}</span>

                {/* mode badge */}
                <span className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>
                  {badge.label}
                </span>

                {/* paper balance */}
                {s.mode === 'paper' && s.virtual_balance != null && (
                  <span className={`shrink-0 text-[11px] font-bold tabular-nums ${balanceColor}`}>
                    {s.symbol.split('_')[1] === 'IDR'
                      ? 'Rp' + s.virtual_balance.toLocaleString('id-ID', { maximumFractionDigits: 0 })
                      : '$' + s.virtual_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
    </div>
  )
}
