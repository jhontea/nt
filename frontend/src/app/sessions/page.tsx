'use client'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
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
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Ringkasan performa & strategi trading Anda</p>
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
        ) : (
          sessions && (
            <>
              <PerformanceSummary sessions={sessions} />
              <StrategyCards sessions={sessions} onOpen={(s) => router.push(`/sessions/${s}`)} />
            </>
          )
        )}
      </div>
    </div>
  )
}
