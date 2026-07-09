'use client'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Bot, Grid2x2, TrendingUp, Coins, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { StrategyCards } from '@/components/sessions/StrategyCard'
import { PerformanceSummary } from '@/components/sessions/PerformanceSummary'
import { SectionLabel } from '@/components/sessions/SectionLabel'
import { EmptyState } from '@/components/sessions/EmptyState'
import { RunningSessionsPanel } from '@/components/sessions/RunningSessionsPanel'
import { CreateSessionModal } from '@/components/sessions/CreateSessionModal'

export default function SessionsOverviewPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [showCreate, setShowCreate] = useState(false)

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.sessions.list,
    enabled: isAuthenticated,
  })

  const { data: liveBalance } = useQuery({
    queryKey: ['account-balance'],
    queryFn: () => api.account.balance(),
    enabled: isAuthenticated && (sessions?.some(s => s.mode === 'live') ?? false),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex justify-between items-start gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Dashboard</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1 max-w-md">Pantau semua sesi trading, lihat performa, dan mulai strategi baru dari satu tempat.</p>
            {sessions && sessions.length > 0 && (() => {
              const r = sessions.filter(s => s.status === 'running').length
              const liveRunning = sessions.filter(s => s.status === 'running' && s.mode === 'live').length
              const paperPnl = sessions.filter(s => s.mode === 'paper' && s.virtual_balance != null)
                .reduce((sum, s) => sum + ((s.virtual_balance ?? 0) - (s.initial_balance ?? 0)), 0)
              return (
                <p className="text-xs text-[#686868] dark:text-[#898989] mt-2 flex items-center gap-2 flex-wrap">
                  {liveRunning > 0 && (
                    <span className="flex items-center gap-1 text-[#d03238] dark:text-[#ff6b6f] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#d03238] animate-pulse" />
                      ⚡ {liveRunning} live running
                    </span>
                  )}
                  {r > liveRunning && (
                    <span className={`flex items-center gap-1 ${r > 0 ? 'text-[#9fe870]' : ''}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />
                      {r - liveRunning} paper running
                    </span>
                  )}
                  {r === 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[rgba(14,15,12,0.15)] dark:bg-[rgba(232,235,230,0.15)]" />none running</span>}
                  {paperPnl !== 0 && (
                    <>
                      <span className="text-[rgba(14,15,12,0.2)] dark:text-[rgba(232,235,230,0.2)]">·</span>
                      <span className={paperPnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}>
                        {paperPnl >= 0 ? '+' : ''}${paperPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} paper P&L
                      </span>
                    </>
                  )}
                </p>
              )
            })()}
          </div>
          <button onClick={() => setShowCreate(true)} className="flex-shrink-0 px-3 py-2 sm:px-5 sm:py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)] whitespace-nowrap flex items-center gap-1.5">
            + New Session
          </button>
        </div>

        <MarketTicker symbols={sessions ? [...new Set(sessions.map(s => s.symbol))] : undefined} />

        {/* Live account balance panel — only when live sessions exist */}
        {liveBalance && sessions?.some(s => s.mode === 'live') && (
          <div className="mt-4 mb-2 bg-white dark:bg-[#1e201c] rounded-[20px] border border-[rgba(208,50,56,0.2)] p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-[#d03238] dark:text-[#ff6b6f]" />
                <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6] uppercase tracking-wider">Saldo TokoCrypto</span>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${liveBalance.can_trade === 1 ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.1)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                {liveBalance.can_trade === 1 ? '✓ Bisa Trading' : '✗ Trading Diblokir'}
              </span>
            </div>
            {liveBalance.assets.length === 0 ? (
              <p className="text-xs text-[#686868] dark:text-[#898989]">Tidak ada aset dengan saldo &gt; 0</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {liveBalance.assets.map(a => (
                  <div key={a.asset} className="bg-[#f8f9f6] dark:bg-[#252822] rounded-[12px] px-3 py-2 min-w-[80px]">
                    <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase">{a.asset}</p>
                    <p className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{parseFloat(a.free).toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                    {parseFloat(a.locked) > 0 && (
                      <p className="text-[9px] text-[#686868] dark:text-[#898989]">+{parseFloat(a.locked).toLocaleString(undefined, { maximumFractionDigits: 4 })} locked</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sessions && <RunningSessionsPanel sessions={sessions} router={router} />}

        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" />
            <span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span>
          </div>
        ) : sessions && sessions.length > 0 ? (
          <>
            <section className="mt-6">
              <SectionLabel>Performa</SectionLabel>
              <PerformanceSummary sessions={sessions} />
            </section>
            <section className="mt-8">
              <StrategyCards sessions={sessions} onOpen={(s) => router.push(`/sessions/${s}`)} />
            </section>

            {/* Recent sessions */}
            {(() => {
              const recent = [...sessions].sort((a, b) => b.id - a.id).slice(0, 5)
              return (
                <section className="mt-6">
                  <SectionLabel>Session Terbaru</SectionLabel>
                  <div className="bg-white dark:bg-[#1e201c] rounded-[20px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] overflow-hidden">
                    {recent.map((s, i) => (
                      <button key={s.id} onClick={() => router.push(`/sessions/${s.id}`)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors${i < recent.length - 1 ? ' border-b border-[rgba(14,15,12,0.04)] dark:border-[rgba(232,235,230,0.04)]' : ''} ${
                          s.mode === 'live' && s.status === 'running'
                            ? 'bg-[rgba(208,50,56,0.03)] dark:bg-[rgba(208,50,56,0.05)] hover:bg-[rgba(208,50,56,0.06)] dark:hover:bg-[rgba(208,50,56,0.08)]'
                            : 'hover:bg-[rgba(14,15,12,0.03)] dark:hover:bg-[rgba(232,235,230,0.03)]'
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          s.status === 'running' && s.mode === 'live' ? 'bg-[#d03238] animate-pulse' :
                          s.status === 'running' ? 'bg-[#9fe870] animate-pulse' :
                          'bg-[rgba(14,15,12,0.15)] dark:bg-[rgba(232,235,230,0.15)]'
                        }`} />
                        <span className={`shrink-0 ${s.strategy === 'grid' ? 'text-[#163300] dark:text-[#9fe870]' : s.strategy === 'trend' ? 'text-[#0994b3] dark:text-[#5dd8f5]' : 'text-[#7a5f00] dark:text-[#f5c842]'}`}>
                          {s.strategy === 'grid' ? <Grid2x2 size={14} /> : s.strategy === 'trend' ? <TrendingUp size={14} /> : <Coins size={14} />}
                        </span>
                        <span className="flex-1 min-w-0 text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] truncate">{s.name}</span>
                        <span className="shrink-0 text-[11px] text-[#686868] dark:text-[#898989] font-mono">{s.symbol.replace('_', '/')}</span>
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          s.mode === 'paper' ? 'bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870]' :
                          s.mode === 'live' ? 'bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]' :
                          'bg-[rgba(56,200,255,0.15)] text-[#0994b3] dark:text-[#5dd8f5]'
                        }`}>
                          {s.mode === 'paper' ? 'Paper' : s.mode === 'live' ? '⚡ Live' : 'Signal'}
                        </span>
                        {s.mode === 'paper' && s.virtual_balance != null && s.initial_balance != null && (
                          <span className={`shrink-0 text-[11px] font-bold tabular-nums ${s.virtual_balance >= s.initial_balance ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                            {s.virtual_balance >= s.initial_balance ? '+' : ''}{(((s.virtual_balance - s.initial_balance) / s.initial_balance) * 100).toFixed(1)}%
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )
            })()}
          </>
        ) : (
          sessions && (
            <>
            <div className="mt-6">
              <EmptyState
                icon={<Bot size={28} />}
                title="Belum ada sesi trading"
                description="Mulai dengan membuat sesi baru, atau pilih salah satu strategi di bawah untuk menjalankan bot pertama Anda."
                actionLabel="New Session"
                onAction={() => setShowCreate(true)}
              />
            </div>
            <section className="mt-2">
              <StrategyCards sessions={sessions} onOpen={(s) => router.push(`/sessions/${s}`)} />
            </section>
            </>
          )
        )}
      </div>
      <CreateSessionModal strategy="grid" open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  )
}
