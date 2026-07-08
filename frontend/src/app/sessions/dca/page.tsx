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
import { HelpIcon } from '@/components/HelpIcon'
import { Coins, Info, Plus } from 'lucide-react'

export default function DcaPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [showCreate, setShowCreate] = useState(false)

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['dca-sessions'],
    queryFn: api.dca.sessions.list,
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
      <Navbar active="sessions/dca" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[14px] bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842] flex items-center justify-center"><Coins size={20} /></span>
            <div>
              <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">DCA</h1>
              <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Beli aset secara berkala dalam jumlah tetap</p>
            </div>
            <HelpIcon text="Bot membeli aset secara rutin dalam jumlah tetap untuk meratakan harga beli rata-rata, sehingga tidak perlu menebak waktu terbaik." />
          </div>
          <button onClick={() => setShowCreate(true)} className="px-5 py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)] whitespace-nowrap">
            + New Session
          </button>
        </div>

        <div className="mb-6 flex items-start gap-2 rounded-[16px] bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] px-4 py-3">
          <span className="mt-0.5 text-[#7a5f00] dark:text-[#f5c842]"><Info size={16} /></span>
          <p className="text-sm text-[#686868] dark:text-[#898989]">Bot membeli aset secara rutin dalam jumlah tetap untuk meratakan harga beli rata-rata — cocok untuk menabung aset tanpa menebak pasar.</p>
        </div>

        <StrategyTabs active="dca" />
        <MarketTicker />
        {sessions && <StrategyOverview sessions={sessions} strategy="dca" />}

        <div className="flex items-center justify-between mb-3 mt-7">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Daftar Session DCA{sessions ? ` (${sessions.length})` : ''}</h2>
        </div>

        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : (
          sessions && sessions.length === 0 ? (
            <div className="rounded-[20px] bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] px-6 py-10 text-center">
              <span className="mx-auto mb-3 w-11 h-11 rounded-[14px] bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842] flex items-center justify-center"><Coins size={22} /></span>
              <p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">Belum ada session DCA</p>
              <p className="text-sm text-[#686868] dark:text-[#898989] mt-1 max-w-sm mx-auto">Buat session pertama kamu untuk mulai membeli aset secara rutin dan meratakan harga beli rata-rata.</p>
              <button onClick={() => setShowCreate(true)} className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)]">
                <Plus size={16} /> New Session
              </button>
            </div>
          ) : (
            <SessionList sessions={sessions ?? []} strategy="dca" onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
          )
        )}
      </div>
      <CreateSessionModal strategy="dca" open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  )
}
