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
import { StrategyBanner } from '@/components/sessions/StrategyBanner'
import { CreateSessionModal } from '@/components/sessions/CreateSessionModal'
import { StrategyTabs } from '@/components/sessions/StrategyTabs'
import { SectionLabel } from '@/components/sessions/SectionLabel'
import { InfoStrip } from '@/components/sessions/InfoStrip'
import { EmptyState } from '@/components/sessions/EmptyState'
import { Grid2x2, Plus, Trophy } from 'lucide-react'

export default function GridPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [showCreate, setShowCreate] = useState(false)

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['grid-sessions'],
    queryFn: api.grid.sessions.list,
    enabled: isAuthenticated,
  })

  // Best paper performer — computed inline, no extra API call
  const best = sessions?.filter(s => s.mode === 'paper' && s.virtual_balance != null && (s.initial_balance ?? 0) > 0)
    .reduce<{ session: typeof sessions[0]; pct: number } | null>((acc, s) => {
      const pct = ((s.virtual_balance! - s.initial_balance!) / s.initial_balance!) * 100
      return !acc || pct > acc.pct ? { session: s, pct } : acc
    }, null)

  async function handleStart(id: number) { await api.sessions.start(id); refetch() }
  async function handleStop(id: number) { await api.sessions.stop(id); refetch() }
  async function handleDelete(id: number) {
    if (!confirm('Hapus session ini? Data sinyal dan order akan hilang permanen.')) return
    await api.sessions.delete(id); refetch()
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions/grid" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[14px] bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870] flex items-center justify-center"><Grid2x2 size={20} /></span>
            <div>
              <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Grid Trading</h1>
              <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Pasang order beli & jual di level harga yang ditentukan</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-5 py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)] whitespace-nowrap flex items-center gap-1.5">
            <Plus size={16} /> New Session
          </button>
        </div>
        <StrategyTabs active="grid" />
        <MarketTicker />
        {sessions && <StrategyOverview sessions={sessions} strategy="grid" />}
        <InfoStrip tone="grid" icon={<Grid2x2 size={16} />} text="Bot memasang order beli di harga rendah dan jual di harga tinggi secara berjenjang, lalu mengambil untung dari fluktuasi pasar." help="Grid cocok untuk pasar sideways (naik-turun) di mana harga bergerak dalam rentang tertentu." />
        <StrategyBanner strategy="grid" sessions={sessions ?? []} />

        {/* Best performer card — computed inline, zero extra API calls */}
        {best && (
          <div className="mb-6 bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(159,232,112,0.25)] flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870] flex items-center justify-center flex-shrink-0"><Trophy size={16} /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Best Performer · Paper</p>
              <p className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6] truncate">{best.session.name}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-black text-[#0e0f0c] dark:text-[#e8ebe6]">${best.session.virtual_balance!.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
              <p className={`text-xs font-bold ${best.pct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>{best.pct >= 0 ? '+' : ''}{best.pct.toFixed(1)}%</p>
            </div>
            <button onClick={() => router.push(`/sessions/${best.session.id}`)} className="flex-shrink-0 text-xs font-semibold text-[#163300] dark:text-[#9fe870] bg-[rgba(159,232,112,0.12)] hover:bg-[rgba(159,232,112,0.2)] px-3 py-1.5 rounded-full transition">
              Detail
            </button>
          </div>
        )}

        <SectionLabel>SESSION GRID · {sessions?.length ?? 0}</SectionLabel>
        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : (
          (sessions && sessions.length > 0) ? (
            <SessionList sessions={sessions ?? []} strategy="grid" onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
          ) : (
            <EmptyState icon={<Grid2x2 size={28} />} title="Belum ada session Grid" description="Buat session pertama kamu untuk mulai pasang order beli & jual berjenjang secara otomatis." actionLabel="New Session" onAction={() => setShowCreate(true)} />
          )
        )}
      </div>
      <CreateSessionModal strategy="grid" open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  )
}
