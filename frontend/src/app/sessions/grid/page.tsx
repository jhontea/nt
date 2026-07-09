'use client'
import { useEffect, useState, useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { SessionCard } from '@/components/sessions/SessionCard'
import { StrategyOverview } from '@/components/sessions/StrategyOverview'
import { StrategyBanner } from '@/components/sessions/StrategyBanner'
import { CreateSessionModal } from '@/components/sessions/CreateSessionModal'
import { StrategyTabs } from '@/components/sessions/StrategyTabs'
import { SectionLabel } from '@/components/sessions/SectionLabel'
import { InfoStrip } from '@/components/sessions/InfoStrip'
import { EmptyState } from '@/components/sessions/EmptyState'
import type { GridConfig, Session, Order, SignalSummary, Ticker } from '@/types'
import { Grid2x2, Plus, Trophy, RefreshCw, BarChart2, TrendingUp, TrendingDown, DollarSign, Target, Layers } from 'lucide-react'

function parseGridConfig(config: string): GridConfig | null {
  try { return JSON.parse(config) } catch { return null }
}
function formatPrice(p: number) { return p.toLocaleString('en-US', { maximumFractionDigits: 2 }) }

// Merged per-session enrichment data
interface SessionExtra {
  orders: Order[]
  summary: SignalSummary | null
  portfolio: { virtual_balance: number; initial_balance: number | null; holdings: { avg_price: string; qty: string }[]; unrealized_pnl: number } | null
}

// Grid bar: a simple horizontal bar showing lower–current–upper with grid lines
function GridBar({ lower, upper, current, gridCount }: { lower: number; upper: number; current: number; gridCount: number }) {
  const range = upper - lower
  if (range <= 0) return null
  const pct = Math.max(0, Math.min(100, ((current - lower) / range) * 100))
  const mid = (lower + upper) / 2
  const isBuyZone = current < mid

  return (
    <div className="relative w-full h-5 flex items-center">
      {/* Track — left=buy zone (red tint), right=sell zone (green tint) */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full overflow-hidden" style={{
        background: 'linear-gradient(to right, rgba(208,50,56,0.08) 0%, rgba(208,50,56,0.08) 50%, rgba(159,232,112,0.1) 50%, rgba(159,232,112,0.1) 100%)'
      }}>
        <div className={`absolute inset-y-0 left-0 rounded-full ${isBuyZone ? 'bg-gradient-to-r from-[rgba(208,50,56,0.2)] to-[rgba(208,50,56,0.35)]' : 'bg-gradient-to-r from-[rgba(159,232,112,0.2)] to-[rgba(159,232,112,0.45)]'}`} style={{ width: `${pct}%` }} />
      </div>
      {/* Grid lines */}
      {Array.from({ length: gridCount + 1 }, (_, i) => (
        <div key={i} className="absolute top-0 bottom-0 w-px bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)]" style={{ left: `${(i / gridCount) * 100}%` }} />
      ))}
      {/* Midpoint line — more prominent */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-[rgba(14,15,12,0.25)] dark:bg-[rgba(232,235,230,0.25)] rounded-full" style={{ left: '50%' }} />
      {/* Current price marker */}
      <div
        className={`absolute top-0 bottom-0 w-0.5 rounded-full ${isBuyZone ? 'bg-[#d03238] dark:bg-[#ff6b6f]' : 'bg-[#163300] dark:bg-[#9fe870]'}`}
        style={{ left: `${pct}%` }}
        title={`Harga: ${formatPrice(current)} · ${isBuyZone ? 'Buy zone' : 'Sell zone'}`}
      />
      {/* Labels */}
      <span className="absolute -bottom-3.5 left-0 text-[9px] text-[#686868] dark:text-[#898989]">{formatPrice(lower)}</span>
      <span className="absolute -bottom-3.5 text-[9px] text-[#686868] dark:text-[#898989]" style={{ left: '50%', transform: 'translateX(-50%)' }}>Mid</span>
      <span className="absolute -bottom-3.5 right-0 text-[9px] text-[#686868] dark:text-[#898989]">{formatPrice(upper)}</span>
    </div>
  )
}

export default function GridPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [showCreate, setShowCreate] = useState(false)
  const [symbolFilter, setSymbolFilter] = useState('all')
  const [reevalState, setReevalState] = useState<Record<number, { loading: boolean; result: any | null }>>({})

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['grid-sessions'],
    queryFn: api.grid.sessions.list,
    enabled: isAuthenticated,
  })

  const sessionIds = useMemo(() => sessions?.map(s => s.id) ?? [], [sessions])
  const uniqueSymbols = useMemo(() => [...new Set(sessions?.map(s => s.symbol) ?? [])], [sessions])
  const runningIds = useMemo(() => sessions?.filter(s => s.status === 'running').map(s => s.id) ?? [], [sessions])
  const paperIds = useMemo(() => sessions?.filter(s => s.mode === 'paper').map(s => s.id) ?? [], [sessions])

  // === Parallel queries for enrichment data ===

  // PnL for running sessions
  const pnlQueries = useQueries({
    queries: runningIds.map(id => ({
      queryKey: ['pnl', id],
      queryFn: () => api.sessions.getPnL(id),
      enabled: isAuthenticated && runningIds.length > 0,
      staleTime: 30_000,
    })),
  })

  // Orders count per session
  const orderQueries = useQueries({
    queries: sessionIds.map(id => ({
      queryKey: ['orders', id],
      queryFn: () => api.sessions.getOrders(id),
      enabled: isAuthenticated && sessionIds.length > 0,
      staleTime: 30_000,
    })),
  })

  // Signal summary per session
  const summaryQueries = useQueries({
    queries: sessionIds.map(id => ({
      queryKey: ['signal-summary', id],
      queryFn: () => api.sessions.getSignalSummary(id),
      enabled: isAuthenticated && sessionIds.length > 0,
      staleTime: 30_000,
    })),
  })

  // Portfolio for paper sessions
  const portfolioQueries = useQueries({
    queries: paperIds.map(id => ({
      queryKey: ['portfolio', id],
      queryFn: () => api.sessions.getPortfolio(id),
      enabled: isAuthenticated && paperIds.length > 0,
      staleTime: 10_000,
      refetchInterval: 15_000,
    })),
  })

  // Ticker per unique symbol — refetch every 1s so bar moves in real-time
  const tickerQueries = useQueries({
    queries: uniqueSymbols.map(symbol => ({
      queryKey: ['ticker', symbol],
      queryFn: () => api.sessions.getTicker(symbol),
      enabled: isAuthenticated && uniqueSymbols.length > 0,
      staleTime: 5_000,
      refetchInterval: 1_000,
    })),
  })
  const tickerBySymbol = useMemo(() =>
    Object.fromEntries(uniqueSymbols.map((sym, i) => [sym, tickerQueries[i]?.data ?? null])) as Record<string, Ticker | null>,
    [uniqueSymbols, tickerQueries]
  )

  // === Aggregate stats ===
  const aggregatePnL = useMemo(() => {
    const results = pnlQueries.filter(q => q.data).map(q => q.data!)
    const totalRealized = results.reduce((s, r) => s + (parseFloat(r.realized_pnl) || 0), 0)
    const totalTrades = results.reduce((s, r) => s + (r.trade_count || 0), 0)
    const avgWinRate = results.length > 0 ? results.reduce((s, r) => s + (r.win_rate || 0), 0) / results.length : 0
    return { totalRealized, totalTrades, avgWinRate, count: results.length }
  }, [pnlQueries])

  // === Per-session enrichment map ===
  const sessionExtras = useMemo(() => {
    const map: Record<number, SessionExtra> = {}
    sessionIds.forEach((id, i) => {
      const pIdx = paperIds.indexOf(id)
      map[id] = {
        orders: orderQueries[i]?.data ?? [],
        summary: summaryQueries[i]?.data ?? null,
        portfolio: pIdx >= 0 ? (portfolioQueries[pIdx]?.data ?? null) : null,
      }
    })
    return map
  }, [sessionIds, orderQueries, summaryQueries, portfolioQueries, paperIds])

  // === Best performer ===
  const best = useMemo(() => sessions?.filter(s => s.mode === 'paper' && s.virtual_balance != null && (s.initial_balance ?? 0) > 0)
    .reduce<{ session: Session; pct: number } | null>((acc, s) => {
      const pct = ((s.virtual_balance! - s.initial_balance!) / s.initial_balance!) * 100
      return !acc || pct > acc.pct ? { session: s, pct } : acc
    }, null), [sessions])

  const filteredSessions = symbolFilter === 'all' ? (sessions ?? []) : (sessions ?? []).filter(s => s.symbol === symbolFilter)

  async function handleStart(id: number) { await api.sessions.start(id); refetch() }
  async function handleStop(id: number) { await api.sessions.stop(id); refetch() }
  async function handleDelete(id: number) {
    if (!confirm('Hapus session ini? Data sinyal dan order akan hilang permanen.')) return
    await api.sessions.delete(id); refetch()
  }
  async function handleReevaluate(id: number) {
    setReevalState(prev => ({ ...prev, [id]: { loading: true, result: null } }))
    try { const result = await api.sessions.reevaluate(id); setReevalState(prev => ({ ...prev, [id]: { loading: false, result } })) }
    catch { setReevalState(prev => ({ ...prev, [id]: { loading: false, result: null } })) }
  }
  function dismissReeval(id: number) { setReevalState(prev => { const n = { ...prev }; delete n[id]; return n }) }

  const allLoading = isLoading || (sessionIds.length > 0 && orderQueries.some(q => q.isLoading))

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions/grid" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[14px] bg-[rgba(159,232,112,0.12)] text-[#163300] dark:text-[#9fe870] flex items-center justify-center"><Grid2x2 size={20} /></span>
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
        {sessions && <StrategyOverview sessions={sessions} strategy="grid" />}
        <InfoStrip tone="grid" icon={<Grid2x2 size={16} />} text="Bot memasang order beli di harga rendah dan jual di harga tinggi secara berjenjang, lalu mengambil untung dari fluktuasi pasar." help="Grid cocok untuk pasar sideways (naik-turun) di mana harga bergerak dalam rentang tertentu." />
        <StrategyBanner strategy="grid" sessions={sessions ?? []} />

        {/* === AGGREGATE STATS ROW === */}
        {sessions && sessions.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={14} className="text-[#686868] dark:text-[#898989]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Total Realized P&L</span>
              </div>
              <p className={`text-lg font-black ${aggregatePnL.totalRealized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                {aggregatePnL.totalRealized >= 0 ? '+' : ''}${aggregatePnL.totalRealized.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-[#686868] dark:text-[#898989]">{aggregatePnL.count} session aktif</p>
            </div>
            <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
              <div className="flex items-center gap-2 mb-1">
                <Target size={14} className="text-[#686868] dark:text-[#898989]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Win Rate</span>
              </div>
              <p className="text-lg font-black text-[#0e0f0c] dark:text-[#e8ebe6]">{aggregatePnL.avgWinRate.toFixed(1)}%</p>
              <p className="text-[10px] text-[#686868] dark:text-[#898989]">rata-rata aktif</p>
            </div>
            <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
              <div className="flex items-center gap-2 mb-1">
                <Layers size={14} className="text-[#686868] dark:text-[#898989]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Total Trades</span>
              </div>
              <p className="text-lg font-black text-[#0e0f0c] dark:text-[#e8ebe6]">{aggregatePnL.totalTrades}</p>
              <p className="text-[10px] text-[#686868] dark:text-[#898989]">eksekusi selesai</p>
            </div>
          </div>
        )}

        {/* === BEST PERFORMER === */}
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
            <button onClick={() => router.push(`/sessions/${best.session.id}`)} className="flex-shrink-0 text-xs font-semibold text-[#163300] dark:text-[#9fe870] bg-[rgba(159,232,112,0.12)] hover:bg-[rgba(159,232,112,0.2)] px-3 py-1.5 rounded-full transition">Detail</button>
          </div>
        )}

        {/* === SESSION LIST === */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <SectionLabel>SESSION GRID · {filteredSessions.length}{symbolFilter !== 'all' ? ` (${symbolFilter.replace('_', '/')})` : ` / ${sessions?.length ?? 0}`}</SectionLabel>
          {uniqueSymbols.length > 1 && (
            <select value={symbolFilter} onChange={e => setSymbolFilter(e.target.value)} className="text-xs px-3 py-1.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-full text-[#0e0f0c] dark:text-[#e8ebe6] focus:outline-none">
              <option value="all">Semua pair</option>
              {uniqueSymbols.map(s => <option key={s} value={s}>{s.replace('_', '/')}</option>)}
            </select>
          )}
        </div>

        {allLoading ? (
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
              const extra = sessionExtras[s.id]
              const orders = extra?.orders ?? []
              const summary = extra?.summary ?? null
              const ticker = tickerBySymbol[s.symbol] ?? null
              const buyCount = orders.filter(o => o.side === 'buy').length
              const sellCount = orders.filter(o => o.side === 'sell').length
              const currentPrice = ticker ? parseFloat(ticker.lastPrice) : 0

              return (
                <div key={s.id}>
                  <SessionCard session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={id => router.push(`/sessions/${id}`)} />

                  {/* Grid config + enriched info strip */}
                  {cfg && (
                    <div className="mx-1 -mt-1 bg-[rgba(159,232,112,0.04)] dark:bg-[rgba(159,232,112,0.06)] border border-t-0 border-[rgba(159,232,112,0.15)] rounded-b-[16px] px-4 py-2.5">
                      {/* Row 1: config basics + order/signal counts */}
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                        <div className="flex items-center gap-3 text-xs text-[#686868] dark:text-[#898989] flex-wrap">
                          <span>Range <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{formatPrice(cfg.lower_price)} – {formatPrice(cfg.upper_price)}</span></span>
                          <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                          <span><span className="font-semibold text-[#163300] dark:text-[#9fe870]">{cfg.grid_count}</span> grid</span>
                          <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                          <span>Qty <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{cfg.quantity}</span></span>
                          {/* Order counts */}
                          {orders.length > 0 && (
                            <>
                              <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                              <span className="flex items-center gap-1">
                                <TrendingDown size={11} className="text-[#054d28] dark:text-[#9fe870]" /><span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{buyCount}</span>
                                <TrendingUp size={11} className="text-[#d03238] dark:text-[#ff6b6f]" /><span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{sellCount}</span>
                              </span>
                            </>
                          )}
                          {/* Signal summary */}
                          {summary && summary.total_count > 0 && (
                            <>
                              <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                              <span className="flex items-center gap-1">
                                <Target size={11} className="text-[#686868] dark:text-[#898989]" />
                                <span className={`font-semibold ${summary.success_rate >= 60 ? 'text-[#054d28] dark:text-[#9fe870]' : summary.success_rate >= 30 ? 'text-[#7a5f00] dark:text-[#f5c842]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                  {summary.confirmed_count}/{summary.total_count}
                                </span>
                              </span>
                            </>
                          )}
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

                      {/* Row 2: mini grid bar */}
                      {currentPrice > 0 && (
                        <div className="mb-3">
                          <GridBar lower={cfg.lower_price} upper={cfg.upper_price} current={currentPrice} gridCount={cfg.grid_count} />
                        </div>
                      )}

                      {/* Row 3: unrealized P&L for paper sessions */}
                      {s.mode === 'paper' && extra?.portfolio && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className={`font-semibold ${extra.portfolio.unrealized_pnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                            Unrealized {extra.portfolio.unrealized_pnl >= 0 ? '+' : ''}${extra.portfolio.unrealized_pnl.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reevaluate result */}
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
