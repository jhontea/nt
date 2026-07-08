'use client'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { SessionList } from '@/components/sessions/SessionList'
import { CreateSessionForm } from '@/components/sessions/CreateSessionForm'
import { Grid2x2 } from 'lucide-react'

export default function GridPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

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
        <div className="flex items-center gap-3 mb-6">
          <span className="w-10 h-10 rounded-[14px] bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870] flex items-center justify-center"><Grid2x2 size={20} /></span>
          <div>
            <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Grid Trading</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Pasang order beli & jual di level harga yang ditentukan</p>
          </div>
        </div>
        <MarketTicker />
        <CreateSessionForm strategy="grid" onCreated={() => refetch()} />
        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : (
          <SessionList sessions={sessions ?? []} strategy="grid" onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
        )}
      </div>
    </div>
  )
}
