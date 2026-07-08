'use client'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { StrategyCards } from '@/components/sessions/StrategyCard'
import { SessionList } from '@/components/sessions/SessionList'
import { Bot } from 'lucide-react'

export default function SessionsOverviewPage() {
  const { logout, isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.sessions.list,
    enabled: isAuthenticated,
  })

  const stats = sessions ? { total: sessions.length, running: sessions.filter(s => s.status === 'running').length } : { total: 0, running: 0 }

  async function handleStart(id: number) { await api.sessions.start(id); refetch() }
  async function handleStop(id: number) { await api.sessions.stop(id); refetch() }
  async function handleDelete(id: number) {
    if (!confirm('Hapus session ini? Data sinyal dan order akan hilang permanen.')) return
    await api.sessions.delete(id); refetch()
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Dashboard</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">
              {stats.total
                ? <>{stats.total} session{stats.total !== 1 ? 's' : ''}{stats.running > 0 ? <> · <span className="text-[#9fe870] font-semibold">{stats.running} running</span></> : ''}</>
                : 'Bot trading otomatis Anda'
              }
            </p>
          </div>
          <button onClick={() => router.push('/sessions/grid')} className="px-5 py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] hover:scale-[1.03] active:scale-[0.97] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)]">
            + New Session
          </button>
        </div>

        <MarketTicker />

        {sessions && sessions.length > 0 && (
          <StrategyCards sessions={sessions} onOpen={(s) => router.push(`/sessions/${s}`)} />
        )}

        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" />
            <span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span>
          </div>
        ) : (
          <SessionList sessions={sessions ?? []} strategy="all" onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
        )}
      </div>
    </div>
  )
}
