'use client'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import type { Session } from '@/types'

const strategyLabel = (s: Session) =>
  s.strategy === 'grid' ? 'Grid' : s.strategy === 'trend' ? 'Trend' : 'DCA'

export function PerformanceSummary({ sessions }: { sessions: Session[] }) {
  const router = useRouter()

  const liveSessions = sessions.filter(s => s.mode === 'live')
  const liveRunning = liveSessions.filter(s => s.status === 'running')

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
    </div>
  )
}
