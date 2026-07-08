'use client'
import { Grid2x2, TrendingUp, Coins, Zap, FileText, BarChart2, X } from 'lucide-react'
import { PriceBadge } from '@/components/PriceBadge'
import type { Session } from '@/types'

export function SessionCard({ session, onStart, onStop, onDelete, onDetail }: {
  session: Session
  onStart: (id: number) => void
  onStop: (id: number) => void
  onDelete: (id: number) => void
  onDetail: (id: number) => void
}) {
  const strategyIcon = session.strategy === 'grid' ? <Grid2x2 size={22} /> : session.strategy === 'trend' ? <TrendingUp size={22} /> : <Coins size={22} />
  const modeIcon = session.mode === 'live' ? <Zap size={10} /> : session.mode === 'paper' ? <FileText size={10} /> : <BarChart2 size={10} />
  const modeBg = session.mode === 'live'
    ? 'bg-[rgba(255,209,26,0.9)] dark:bg-[rgba(255,209,26,0.8)]'
    : session.mode === 'paper'
    ? 'bg-[rgba(159,232,112,0.9)] dark:bg-[rgba(159,232,112,0.7)]'
    : 'bg-[rgba(56,200,255,0.9)] dark:bg-[rgba(56,200,255,0.7)]'
  const strategyBg = session.strategy === 'grid'
    ? 'bg-[rgba(159,232,112,0.15)]'
    : session.strategy === 'trend'
    ? 'bg-[rgba(56,200,255,0.1)]'
    : 'bg-[rgba(255,209,26,0.1)]'
  const strategyIconColor = session.strategy === 'grid'
    ? 'text-[#163300] dark:text-[#9fe870]'
    : session.strategy === 'trend'
    ? 'text-[#0994b3] dark:text-[#5dd8f5]'
    : 'text-[#7a5f00] dark:text-[#f5c842]'
  const modeIconColor = session.mode === 'live'
    ? 'text-[#7a5f00]'
    : session.mode === 'paper'
    ? 'text-[#163300]'
    : 'text-[#0994b3]'
  const strategyLabel = session.strategy === 'grid' ? 'Grid Trading' : session.strategy === 'trend' ? 'Trend Following' : 'DCA'

  return (
    <div
      className={`bg-white dark:bg-[#1e201c] rounded-[24px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] hover:shadow-[0_8px_32px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all p-5 cursor-pointer group border-l-4 ${
        session.strategy === 'grid'
          ? 'border-l-[#9fe870]'
          : session.strategy === 'trend'
          ? 'border-l-[#38c8ff]'
          : 'border-l-[#ffd11a]'
      } ${
        session.status === 'running'
          ? 'bg-[rgba(159,232,112,0.015)] dark:bg-[rgba(159,232,112,0.03)]'
          : ''
      }`}
      onClick={() => onDetail(session.id)}
    >
      <div className="flex items-center gap-4">
        {/* Strategy icon utama + mode badge kecil */}
        <div className="relative flex-shrink-0">
          <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center ${strategyBg} ${strategyIconColor}`}>
            {strategyIcon}
          </div>
          <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${modeBg} ${modeIconColor}`}>
            {modeIcon}
          </span>
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] text-base leading-tight truncate max-w-[200px] sm:max-w-[300px] md:max-w-sm">{session.name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              session.mode === 'live'
                ? 'bg-[rgba(255,209,26,0.15)] text-[#7a5f00] dark:text-[#f5c842]'
                : session.mode === 'paper'
                ? 'bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870]'
                : 'bg-[rgba(56,200,255,0.12)] text-[#0994b3] dark:text-[#5dd8f5]'
            }`}>
              {session.mode === 'signal' ? 'Signal' : session.mode === 'paper' ? 'Paper' : 'Live'}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              session.status === 'running'
                ? 'bg-[rgba(159,232,112,0.15)] dark:bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870]'
                : 'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#5a5b58] dark:text-[#8a8d88]'
            }`}>
              {session.status === 'running' && (
                <span className={`inline-block w-2 h-2 rounded-full ${session.is_alive ? 'bg-[#9fe870] animate-pulse' : 'bg-[#ffd11a]'}`} title={session.is_alive ? 'Goroutine aktif' : 'Status DB running, goroutine belum jalan'} />
              )}
              {session.status === 'running' ? 'Running' : 'Stopped'}
            </span>
          </div>
          <p className="text-xs text-[#686868] dark:text-[#898989] truncate min-w-0">
            <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{session.symbol}</span> · {strategyLabel} · <PriceBadge symbol={session.symbol} compact />
          </p>
          {session.mode === 'paper' && session.virtual_balance != null && (
            <p className="text-xs mt-1 flex items-center gap-2">
              <span className="text-[#686868] dark:text-[#898989]">Saldo virtual</span>
              <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${session.virtual_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {session.initial_balance != null && (
                <span className={`text-xs font-semibold ${session.virtual_balance >= session.initial_balance ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {session.virtual_balance >= session.initial_balance ? '+' : ''}{(((session.virtual_balance - session.initial_balance) / session.initial_balance) * 100).toFixed(1)}%
                </span>
              )}
            </p>
          )}
        </div>
        {/* Actions — stop propagation agar tidak trigger onDetail */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {session.status === 'running' ? (
            <button className="px-4 py-2 text-xs font-semibold bg-[rgba(208,50,56,0.08)] text-[#d03238] hover:bg-[#d03238] hover:text-white border border-[rgba(208,50,56,0.2)] hover:border-[#d03238] rounded-full transition" onClick={() => onStop(session.id)}>Stop</button>
          ) : (
            <button className="px-4 py-2 text-xs font-semibold bg-[#9fe870] text-[#163300] hover:bg-[#cdffad] rounded-full transition shadow-[0_2px_8px_rgba(159,232,112,0.3)]" onClick={() => onStart(session.id)}>Start</button>
          )}
          <button className="flex items-center gap-1 px-3 py-2 text-[#686868] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.08)] dark:hover:text-[#ff6b6f] dark:hover:bg-[rgba(208,50,56,0.15)] rounded-full text-sm transition" onClick={() => onDelete(session.id)} title="Hapus">
              <X size={14} />
              <span className="sr-only sm:not-sr-only text-xs font-medium">Hapus</span>
            </button>
        </div>
      </div>
    </div>
  )
}
