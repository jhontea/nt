'use client'
import { useEffect, useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { SessionCard } from '@/components/sessions/SessionCard'
import { StrategyOverview } from '@/components/sessions/StrategyOverview'
import { StrategyBanner } from '@/components/sessions/StrategyBanner'
import { CreateSessionModal } from '@/components/sessions/CreateSessionModal'
import { StrategyTabs } from '@/components/sessions/StrategyTabs'
import { SectionLabel } from '@/components/sessions/SectionLabel'
import { InfoStrip } from '@/components/sessions/InfoStrip'
import { EmptyState } from '@/components/sessions/EmptyState'
import type { GridConfig, GridInsight, Session } from '@/types'
import { Grid2x2, Plus, Trophy, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

// ponytail: parse once inline, no abstraction needed
function parseGridConfig(config: string): GridConfig | null {
  try { return JSON.parse(config) } catch { return null }
}

function formatPrice(p: number) {
  return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export default function GridPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [showCreate, setShowCreate] = useState(false)
  const [symbolFilter, setSymbolFilter] = useState('all')
  // ponytail: per-session reevaluate result, keyed by session id
  const [reevalState, setReevalState] = useState<Record<number, { loading: boolean; result: any | null }>>({})

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['grid-sessions'],
    queryFn: api.grid.sessions.list,
    enabled: isAuthenticated,
  })

  // Unique symbols for insights queries
  const uniqueSymbols = [...new Set(sessions?.map(s => s.symbol) ?? [])]

  // Fetch insights for each unique symbol in parallel
  const insightQueries = useQueries({
    queries: uniqueSymbols.map(symbol => ({
      queryKey: ['grid-insights', symbol],
      queryFn: () => api.grid.insights(symbol),
      enabled: isAuthenticated && uniqueSymbols.length > 0,
      staleTime: 60_000,
    })),
  })

  // Map symbol → insights array
  const insightsBySymbol = Object.fromEntries(
    uniqueSymbols.map((sym, i) => [sym, insightQueries[i]?.data ?? []])
  ) as Record<string, GridInsight[]>

  // Best paper performer — zero extra API call
  const best = sessions?.filter(s => s.mode === 'paper' && s.virtual_balance != null && (s.initial_balance ?? 0) > 0)
    .reduce<{ session: Session; pct: number } | null>((acc, s) => {
      const pct = ((s.virtual_balance! - s.initial_balance!) / s.initial_balance!) * 100
      return !acc || pct > acc.pct ? { session: s, pct } : acc
    }, null)

  const filteredSessions = symbolFilter === 'all'
    ? (sessions ?? [])
    : (sessions ?? []).filter(s => s.symbol === symbolFilter)

  async function handleStart(id: number) { await api.sessions.start(id); refetch() }
  async function handleStop(id: number) { await api.sessions.stop(id); refetch() }
  async function handleDelete(id: number) {
    if (!confirm('Hapus session ini? Data sinyal dan order akan hilang permanen.')) return
    await api.sessions.delete(id); refetch()
  }

  async function handleReevaluate(id: number) {
    setReevalState(prev => ({ ...prev, [id]: { loading: true, result: null } }))
    try {
      const result = await api.sessions.reevaluate(id)
      setReevalState(prev => ({ ...prev, [id]: { loading: false, result } }))
    } catch {
      setReevalState(prev => ({ ...prev, [id]: { loading: false, result: null } }))
    }
  }

  function dismissReeval(id: number) {
    setReevalState(prev => { const n = { ...prev }; delete n[id]; return n })
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

        {/* Grid insights per symbol */}
        {uniqueSymbols.length > 0 && (
          <div className="mb-6">
            <SectionLabel>RIWAYAT SINYAL PER PAIR</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {uniqueSymbols.map(sym => {
                const insights: GridInsight[] = insightsBySymbol[sym] ?? []
                const avgSuccess = insights.length > 0
                  ? insights.reduce((s, i) => s + i.success_rate, 0) / insights.length
                  : null
                return (
                  <div key={sym} className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{sym.replace('_', '/')}</span>
                      {avgSuccess !== null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${avgSuccess >= 60 ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : avgSuccess >= 30 ? 'bg-[rgba(255,209,26,0.15)] text-[#7a5f00] dark:text-[#f5c842]' : 'bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                          {avgSuccess.toFixed(0)}% sukses
                        </span>
                      )}
                    </div>
                    {insights.length === 0 ? (
                      <p className="text-xs text-[#686868] dark:text-[#898989]">Belum ada riwayat sinyal</p>
                    ) : (
                      <div className="space-y-1">
                        {insights.slice(0, 3).map(h => {
                          const cfg = parseGridConfig(h.config)
                          return (
                            <div key={h.session_id} className="flex items-center justify-between text-xs">
                              <span className="text-[#686868] dark:text-[#898989] truncate max-w-[140px]">{h.name}</span>
                              <span className="text-[#686868] dark:text-[#898989]">{cfg ? `${cfg.grid_count} grid` : ''}</span>
                              <span className={`font-semibold ${h.success_rate >= 60 ? 'text-[#054d28] dark:text-[#9fe870]' : h.success_rate >= 30 ? 'text-[#7a5f00] dark:text-[#f5c842]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                {h.confirmed}/{h.total}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Best performer */}
        {best && (
          <div className="mb-6 bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(159,232,112,0.25)] flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870] flex items-center justify-center flex-shrink-0"><Trophy size={16} /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Best Performer · Paper</p>
              <p className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6] truncate">{best.session.name}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-black text-[#0e0f0c] dark:text-[#e8ebe6]">${best.session.virtual_balance!.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className={`text-xs font-bold ${best.pct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>{best.pct >= 0 ? '+' : ''}{best.pct.toFixed(1)}%</p>
            </div>
            <button onClick={() => router.push(`/sessions/${best.session.id}`)} className="flex-shrink-0 text-xs font-semibold text-[#163300] dark:text-[#9fe870] bg-[rgba(159,232,112,0.12)] hover:bg-[rgba(159,232,112,0.2)] px-3 py-1.5 rounded-full transition">
              Detail
            </button>
          </div>
        )}

        {/* Symbol filter + section label */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <SectionLabel>SESSION GRID · {filteredSessions.length}{symbolFilter !== 'all' ? ` (${symbolFilter.replace('_', '/')})` : ` / ${sessions?.length ?? 0}`}</SectionLabel>
          {uniqueSymbols.length > 1 && (
            <select
              value={symbolFilter}
              onChange={e => setSymbolFilter(e.target.value)}
              className="text-xs px-3 py-1.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-full text-[#0e0f0c] dark:text-[#e8ebe6] focus:outline-none"
            >
              <option value="all">Semua pair</option>
              {uniqueSymbols.map(s => <option key={s} value={s}>{s.replace('_', '/')}</option>)}
            </select>
          )}
        </div>

        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : filteredSessions.length === 0 ? (
          sessions?.length ? (
            <p className="text-sm text-[#686868] dark:text-[#898989] py-8 text-center">Tidak ada session untuk pair {symbolFilter.replace('_', '/')}.</p>
          ) : (
            <EmptyState icon={<Grid2x2 size={28} />} title="Belum ada session Grid" description="Buat session pertama kamu untuk mulai pasang order beli & jual berjenjang secara otomatis." actionLabel="New Session" onAction={() => setShowCreate(true)} />
          )
        ) : (
          <div className="space-y-3">
            {filteredSessions.map(s => {
              const cfg = parseGridConfig(s.config)
              const reeval = reevalState[s.id]
              return (
                <div key={s.id}>
                  <SessionCard session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={id => router.push(`/sessions/${id}`)} />
                  {/* Grid config strip — parsed inline, no API call */}
                  {cfg && (
                    <div className="mx-1 -mt-1 bg-[rgba(159,232,112,0.04)] dark:bg-[rgba(159,232,112,0.06)] border border-t-0 border-[rgba(159,232,112,0.15)] rounded-b-[16px] px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 text-xs text-[#686868] dark:text-[#898989] flex-wrap">
                        <span>Range <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{formatPrice(cfg.lower_price)} – {formatPrice(cfg.upper_price)}</span></span>
                        <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                        <span><span className="font-semibold text-[#163300] dark:text-[#9fe870]">{cfg.grid_count}</span> grid</span>
                        <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                        <span>Qty <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{cfg.quantity}</span></span>
                      </div>
                      <button
                        onClick={() => reeval ? dismissReeval(s.id) : handleReevaluate(s.id)}
                        disabled={reeval?.loading}
                        className="flex items-center gap-1 text-xs font-semibold text-[#686868] dark:text-[#898989] hover:text-[#163300] dark:hover:text-[#9fe870] transition disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={reeval?.loading ? 'animate-spin' : ''} />
                        {reeval ? (reeval.loading ? 'Memeriksa...' : 'Tutup') : 'Reevaluasi'}
                      </button>
                    </div>
                  )}
                  {/* Reevaluate result strip */}
                  {reeval?.result && (
                    <div className="mx-1 -mt-0.5 bg-white dark:bg-[#1e201c] border border-t-0 border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-b-[12px] px-4 py-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${reeval.result.in_range ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                          {reeval.result.in_range ? 'Harga dalam range ✓' : 'Harga di luar range ✗'}
                        </span>
                        <span className="text-[#686868] dark:text-[#898989]">Posisi {reeval.result.position_pct?.toFixed(1)}% · {reeval.result.levels_triggered}/{reeval.result.total_levels} level terisi</span>
                      </div>
                      <p className="text-[#686868] dark:text-[#898989]">{reeval.result.suggestion}</p>
                      {!reeval.result.in_range && (
                        <p className="text-[#686868] dark:text-[#898989]">
                          Saran range baru: <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{formatPrice(reeval.result.suggested_lower)} – {formatPrice(reeval.result.suggested_upper)}</span> · {reeval.result.suggested_count} grid
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <CreateSessionModal strategy="grid" open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  )
}
