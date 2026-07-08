'use client'
import { useState } from 'react'
import { Bot, Grid2x2, TrendingUp, Coins } from 'lucide-react'
import { SessionCard } from './SessionCard'
import type { Session } from '@/types'

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'running', label: 'Running' },
  { key: 'stopped', label: 'Stopped' },
] as const

type Filter = (typeof FILTERS)[number]['key']

export function SessionList({ sessions, strategy, onStart, onStop, onDelete, onDetail }: {
  sessions: Session[]
  strategy: 'all' | 'grid' | 'trend' | 'dca'
  onStart: (id: number) => void
  onStop: (id: number) => void
  onDelete: (id: number) => void
  onDetail: (id: number) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')

  if (sessions.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 rounded-[24px] bg-[rgba(159,232,112,0.1)] dark:bg-[rgba(159,232,112,0.08)] flex items-center justify-center mx-auto mb-4 text-[#163300] dark:text-[#9fe870]">
          {strategy === 'all' ? <Bot size={28} /> : strategy === 'grid' ? <Grid2x2 size={28} /> : strategy === 'trend' ? <TrendingUp size={28} /> : <Coins size={28} />}
        </div>
        <p className="text-[#0e0f0c] dark:text-[#e8ebe6] text-lg font-bold">
          {strategy === 'all' ? 'Belum ada session' : `Belum ada session ${strategy === 'grid' ? 'Grid' : strategy === 'trend' ? 'Trend' : 'DCA'}`}
        </p>
        <p className="text-[#686868] dark:text-[#898989] text-sm mt-1">Klik "+ New Session" untuk membuat session pertama</p>
      </div>
    )
  }

  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.status === filter)
  const counts = {
    all: sessions.length,
    running: sessions.filter(s => s.status === 'running').length,
    stopped: sessions.filter(s => s.status === 'stopped').length,
  }
  const paperRunning = sessions.filter(s => s.mode === 'paper' && s.status === 'running').length

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Sessions · {filtered.length}</h2>
          {paperRunning > 0 && (
            <span className="text-xs font-semibold bg-[rgba(159,232,112,0.12)] text-[#163300] dark:text-[#9fe870] px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse inline-block" />
              {paperRunning} paper running
            </span>
          )}
        </div>
        <div className="flex gap-1 p-1 bg-[#f0f1ee] dark:bg-[#252822] rounded-full border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                filter === f.key
                  ? 'bg-white dark:bg-[#1e201c] text-[#0e0f0c] dark:text-[#e8ebe6] shadow-sm'
                  : 'text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'
              }`}
            >
              {f.label} {counts[f.key] > 0 && <span className="opacity-60">{counts[f.key]}</span>}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-[#686868] dark:text-[#898989] py-10">
          Tidak ada session dengan status “{filter === 'running' ? 'Running' : 'Stopped'}.”
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <SessionCard key={s.id} session={s} onStart={onStart} onStop={onStop} onDelete={onDelete} onDetail={onDetail} />
          ))}
        </div>
      )}
    </>
  )
}
