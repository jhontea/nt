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
import { Grid2x2, Plus } from 'lucide-react'
import { HelpIcon } from '@/components/HelpIcon'

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
        <div className="mb-6 flex items-start gap-2 rounded-[16px] bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] px-4 py-3">
          <span className="mt-0.5 text-[#163300] dark:text-[#9fe870]"><Grid2x2 size={16} /></span>
          <p className="text-sm text-[#686868] dark:text-[#898989]">Bot memasang order beli di harga rendah dan jual di harga tinggi secara berjenjang, lalu mengambil untung dari fluktuasi pasar.<HelpIcon text="Grid cocok untuk pasar sideways (naik-turun) di mana harga bergerak dalam rentang tertentu." /></p>
        </div>
        <StrategyTabs active="grid" />
        <MarketTicker />
        {sessions && <StrategyOverview sessions={sessions} strategy="grid" />}
        <div className="mt-8 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Session Grid</h2>
            {sessions && sessions.length > 0 && (
              <span className="text-xs font-bold text-[#163300] dark:text-[#9fe870] bg-[rgba(159,232,112,0.15)] rounded-full px-2 py-0.5">{sessions.length}</span>
            )}
          </div>
          {!isLoading && (!sessions || sessions.length === 0) && (
            <button onClick={() => setShowCreate(true)} className="text-xs font-bold text-[#163300] dark:text-[#9fe870] hover:underline">+ Buat session</button>
          )}
        </div>
        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : (
          (sessions && sessions.length > 0) ? (
            <SessionList sessions={sessions ?? []} strategy="grid" onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center rounded-[20px] bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] border-dashed">
              <span className="w-12 h-12 rounded-[16px] bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870] flex items-center justify-center mb-3"><Grid2x2 size={22} /></span>
              <p className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">Belum ada session Grid</p>
              <p className="text-sm text-[#686868] dark:text-[#898989] mt-1 max-w-sm">Buat session pertama kamu untuk mulai pasang order beli & jual berjenjang. Klik tombol <span className="font-bold text-[#163300] dark:text-[#9fe870]">+ New Session</span> di atas untuk memulai.</p>
            </div>
          )
        )}
      </div>
      <CreateSessionModal strategy="grid" open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  )
}
