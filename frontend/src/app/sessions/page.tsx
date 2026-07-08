'use client'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { StrategyCards } from '@/components/sessions/StrategyCard'
import { PerformanceSummary } from '@/components/sessions/PerformanceSummary'

export default function SessionsOverviewPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.sessions.list,
    enabled: isAuthenticated,
  })

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Dashboard</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1 max-w-md">Pantau semua sesi trading, lihat performa, dan mulai strategi baru dari satu tempat.</p>
          </div>
          <button onClick={() => router.push('/sessions/grid')} className="px-5 py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)]">
            + New Session
          </button>
        </div>

        <MarketTicker />

        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" />
            <span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span>
          </div>
        ) : sessions && sessions.length > 0 ? (
          <>
            <section className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989] mb-3">Performa</h2>
              <PerformanceSummary sessions={sessions} />
            </section>
            <section className="mt-8">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989] mb-3">Strategi</h2>
              <StrategyCards sessions={sessions} onOpen={(s) => router.push(`/sessions/${s}`)} />
            </section>
          </>
        ) : (
          sessions && (
            <>
            <section className="mt-6 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-[24px] p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#9fe870] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-[#163300]" />
              </div>
              <h2 className="text-lg font-black text-[#0e0f0c] dark:text-[#e8ebe6]">Belum ada sesi trading</h2>
              <p className="text-sm text-[#686868] dark:text-[#898989] mt-2 max-w-sm mx-auto">Mulai dengan membuat sesi baru, atau pilih salah satu strategi di bawah untuk menjalankan bot pertama Anda.</p>
              <div className="mt-5 flex items-center justify-center">
                <button onClick={() => router.push('/sessions/grid')} className="px-5 py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)]">
                  + New Session
                </button>
              </div>
            </section>
            <section className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989] mb-3">Strategi</h2>
              <StrategyCards sessions={sessions} onOpen={(s) => router.push(`/sessions/${s}`)} />
            </section>
            </>
          )
        )}
      </div>
    </div>
  )
}
