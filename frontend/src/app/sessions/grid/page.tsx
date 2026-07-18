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
import { InfoStrip } from '@/components/sessions/InfoStrip'
import { EmptyState } from '@/components/sessions/EmptyState'
import type { GridConfig, Session, Order, SignalSummary, Ticker } from '@/types'
import { Grid2x2, Plus, Trophy, RefreshCw, BarChart2, TrendingUp, TrendingDown, DollarSign, Target, Layers, Zap } from 'lucide-react'
import { useToast } from '@/lib/useToast'
import { GridBar } from '@/components/sessions/GridBar'
import { useLivePnl } from '@/lib/useLivePnl'

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

export default function GridPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [symbolFilter, setSymbolFilter] = useState('all')
  const [confirmId, setConfirmId] = useState<number | null>(null)
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
  const liveIds = useMemo(() => sessions?.filter(s => s.mode === 'live').map(s => s.id) ?? [], [sessions])

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

  // Ticker per unique symbol — one batched request, refetch every 1s so bar moves in real-time
  const { data: tickerMap } = useQuery({
    queryKey: ['tickers-bulk', uniqueSymbols],
    queryFn: () => api.sessions.getTickersBulk(uniqueSymbols),
    enabled: isAuthenticated && uniqueSymbols.length > 0,
    staleTime: 5_000,
    refetchInterval: 2500,
  })
  const tickerBySymbol = useMemo(() => {
    const map: Record<string, Ticker | null> = {}
    for (const sym of uniqueSymbols) map[sym] = tickerMap?.[sym] ?? null
    return map
  }, [uniqueSymbols, tickerMap])

  // === Aggregate stats ===
  const aggregatePnL = useMemo(() => {
    const results = pnlQueries.filter(q => q.data).map(q => q.data!)
    const totalRealized = results.reduce((s, r) => s + (parseFloat(r.realized_pnl) || 0), 0)
    const totalTrades = results.reduce((s, r) => s + (r.trade_count || 0), 0)
    const avgWinRate = results.length > 0 ? results.reduce((s, r) => s + (r.win_rate || 0), 0) / results.length : 0
    return { totalRealized, totalTrades, avgWinRate, count: results.length }
  }, [pnlQueries])

  const livePnlBySession = useLivePnl(liveIds)

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

  const { data: liveBalance } = useQuery({
    queryKey: ['account-balance'],
    queryFn: () => api.account.balance(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  const usdtFree = parseFloat(liveBalance?.assets.find(a => a.asset === 'USDT')?.free ?? '0')

  async function handleStart(id: number) {
    try { await api.sessions.start(id); refetch(); toast('Session dimulai', 'success') }
    catch (e: any) { toast(e?.message || 'Terjadi kesalahan', 'error') }
  }
  async function handleStop(id: number) {
    try { await api.sessions.stop(id); refetch(); toast('Session dihentikan', 'info') }
    catch (e: any) { toast(e?.message || 'Terjadi kesalahan', 'error') }
  }
  async function handleDelete(id: number) {
    if (confirmId !== id) { setConfirmId(id); return }
    setConfirmId(null)
    try { await api.sessions.delete(id); refetch(); toast('Session dihapus', 'info') }
    catch (e: any) { toast(e?.message || 'Terjadi kesalahan', 'error') }
  }  async function handleReevaluate(id: number) {
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
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 flex-shrink-0 rounded-[14px] bg-[rgba(159,232,112,0.12)] text-[#163300] dark:text-[#9fe870] flex items-center justify-center"><Grid2x2 size={20} /></span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Grid Trading</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-xs sm:text-sm text-[#686868] dark:text-[#898989]">Pasang order beli & jual di level harga yang ditentukan</p>
                {liveBalance && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${usdtFree < 10 ? 'bg-[rgba(208,50,56,0.1)] text-[#d03238] dark:text-[#ff6b6f]' : 'bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]'}`}>
                    <Zap size={9} />USDT {usdtFree.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {usdtFree < 10 && ' ⚠️'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex-shrink-0 px-3 py-2 sm:px-5 sm:py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)] whitespace-nowrap flex items-center gap-1.5">
            <Plus size={16} /> New Session
          </button>
        </div>

        <StrategyTabs active="grid" />
        {sessions && <StrategyOverview sessions={sessions} strategy="grid" />}
        <InfoStrip tone="grid" icon={<Grid2x2 size={16} />} text="Bot memasang order beli di harga rendah dan jual di harga tinggi secara berjenjang, lalu mengambil untung dari fluktuasi pasar." help="Grid cocok untuk pasar sideways (naik-turun) di mana harga bergerak dalam rentang tertentu." />
        <StrategyBanner strategy="grid" sessions={sessions ?? []} />

        {/* === AGGREGATE STATS ROW === */}
        {sessions && sessions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={14} className="text-[#686868] dark:text-[#898989]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Realized P&L (estimasi)</span>
              </div>
              <p className={`text-lg font-black ${aggregatePnL.totalRealized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                {aggregatePnL.totalRealized >= 0 ? '+' : ''}${aggregatePnL.totalRealized.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-[10px] text-[#686868] dark:text-[#898989]">{aggregatePnL.count} session aktif</p>
                {sessions.some(s => s.mode === 'live' && s.status === 'running') && (
                  <span className="text-[9px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.08)] px-1.5 py-0.5 rounded-full">⚡ live</span>
                )}
              </div>
            </div>
            <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
              <div className="flex items-center gap-2 mb-1">
                <Target size={14} className="text-[#686868] dark:text-[#898989]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Win Rate</span>
              </div>
              <p className="text-lg font-black text-[#0e0f0c] dark:text-[#e8ebe6]">{aggregatePnL.totalTrades > 0 ? `${aggregatePnL.avgWinRate.toFixed(1)}%` : '—'}</p>
              <p className="text-[10px] text-[#686868] dark:text-[#898989]">{aggregatePnL.totalTrades > 0 ? 'rata-rata aktif' : 'belum ada trade selesai'}</p>
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

        {/* === SESSION LIST === */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest">
            Session Grid · {filteredSessions.length}{symbolFilter !== 'all' ? ` (${symbolFilter.replace('_', '/')})` : ` / ${sessions?.length ?? 0}`}
          </p>
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
                  <SessionCard session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={id => router.push(`/sessions/${id}`)} livePnl={s.mode === 'live' ? (livePnlBySession[s.id] ?? null) : undefined} confirmDelete={confirmId === s.id} onCancelDelete={() => setConfirmId(null)} />

                  {/* Grid config + enriched info strip */}
                  {cfg && (
                    <div className={`mx-1 -mt-1 border border-t-0 rounded-b-[16px] px-4 py-2.5 ${
                      s.mode === 'live'
                        ? 'bg-[rgba(208,50,56,0.03)] dark:bg-[rgba(208,50,56,0.05)] border-[rgba(208,50,56,0.2)]'
                        : 'bg-[rgba(159,232,112,0.04)] dark:bg-[rgba(159,232,112,0.06)] border-[rgba(159,232,112,0.15)]'
                    }`}>
                      {/* Row 1: config basics + order/signal counts */}
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                        <div className="flex items-center gap-3 text-xs text-[#686868] dark:text-[#898989] flex-wrap">
                          {s.mode === 'live' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.08)] px-1.5 py-0.5 rounded-full">⚡ Live Order</span>
                          )}
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

                      {/* Row 3: unrealized P&L — paper uses portfolio, live uses ticker */}
                      {s.mode === 'paper' && extra?.portfolio && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className={`font-semibold ${extra.portfolio.unrealized_pnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                            Unrealized {extra.portfolio.unrealized_pnl >= 0 ? '+' : ''}${extra.portfolio.unrealized_pnl.toFixed(2)}
                          </span>
                          <span className="text-[#686868] dark:text-[#898989]">virtual balance ${extra.portfolio.virtual_balance.toFixed(2)}</span>
                        </div>
                      )}
                      {s.mode === 'live' && orders.length > 0 && currentPrice > 0 && (() => {
                        const openBuys = orders.filter(o => o.side === 'buy' && o.status === 'filled')
                        if (openBuys.length === 0) return null
                        const totalQty = openBuys.reduce((sum, o) => sum + parseFloat(o.executed_qty || o.quantity), 0)
                        const totalCost = openBuys.reduce((sum, o) => sum + parseFloat(o.executed_qty || o.quantity) * parseFloat(o.executed_price || o.price), 0)
                        const avgBuy = totalCost / totalQty
                        const unrealized = (currentPrice - avgBuy) * totalQty
                        return (
                          <div className="flex items-center gap-3 text-xs flex-wrap">
                            <span className={`font-semibold ${unrealized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                              Unrealized {unrealized >= 0 ? '+' : ''}${unrealized.toFixed(2)}
                            </span>
                            <span className="text-[#686868] dark:text-[#898989]">{totalQty.toFixed(4)} held · avg ${avgBuy.toFixed(4)}</span>
                            <span className="text-[9px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.08)] px-1.5 py-0.5 rounded-full">real</span>
                          </div>
                        )
                      })()}
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
