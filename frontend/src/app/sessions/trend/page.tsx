'use client'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { SessionList } from '@/components/sessions/SessionList'
import { StrategyOverview } from '@/components/sessions/StrategyOverview'
import { CreateSessionModal } from '@/components/sessions/CreateSessionModal'
import { StrategyTabs } from '@/components/sessions/StrategyTabs'
import { SectionLabel } from '@/components/sessions/SectionLabel'
import { InfoStrip } from '@/components/sessions/InfoStrip'
import { EmptyState } from '@/components/sessions/EmptyState'
import { HelpIcon } from '@/components/HelpIcon'
import { TrendingUp } from 'lucide-react'

export default function TrendPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [showCreate, setShowCreate] = useState(false)

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['trend-sessions'],
    queryFn: api.trend.sessions.list,
    enabled: isAuthenticated,
  })

  async function handleStart(id: number) { await api.sessions.start(id); refetch() }
  async function handleStop(id: number) { await api.sessions.stop(id); refetch() }
  async function handleDelete(id: number) {
    if (!confirm('Hapus session ini? Data sinyal dan order akan hilang permanen.')) return
    await api.sessions.delete(id); refetch()
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions/trend" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[14px] bg-[rgba(56,200,255,0.12)] text-[#0994b3] dark:text-[#5dd8f5] flex items-center justify-center"><TrendingUp size={20} /></span>
            <div>
              <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Trend Following</h1>
              <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">
                Bot mendeteksi tren dengan SMA crossover — golden cross beli, death cross jual.
              </p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-5 py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)] whitespace-nowrap">
            + New Session
          </button>
        </div>
        <StrategyTabs active="trend" />
        <MarketTicker />
        {sessions && <StrategyOverview sessions={sessions} strategy="trend" />}
        <div className="mt-8 space-y-3">
          <InfoStrip
            tone="trend"
            icon={<TrendingUp size={16} />}
            text="Mendeteksi tren dengan SMA crossover: golden cross (SMA pendek naik melewati SMA panjang) memberi sinyal beli, death cross memberi sinyal jual."
            help="Golden cross: SMA pendek naik melewati SMA panjang → sinyal beli. Death cross: sebaliknya → sinyal jual."
          />
          <InfoStrip
            tone="neutral"
            text="Buka sesi untuk melihat sinyal crossover terbaru, status pasar, dan performa."
          />
        </div>
        <SectionLabel>SESSION TREND · {sessions?.length ?? 0}</SectionLabel>
        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : sessions && sessions.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={28} />}
            title="Belum ada session Trend"
            description="Klik “+ New Session” untuk membuat session pertama dan mulai mendeteksi tren."
            actionLabel="New Session"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <SessionList sessions={sessions ?? []} strategy="trend" onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
        )}
      </div>
      <CreateSessionModal strategy="trend" open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  )
}
