'use client'
import { useEffect, useState, useMemo, Suspense } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
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
import type { DCAConfig, Order, Ticker } from '@/types'
import { Coins, Plus, Clock, Zap } from 'lucide-react'
import { useToast } from '@/lib/useToast'
import { DCABar } from '@/components/sessions/DCABar'
import { useLivePnl } from '@/lib/useLivePnl'

function parseDCAConfig(config: string): DCAConfig | null {
  try { return JSON.parse(config) } catch { return null }
}

function fmtMoney(value: number, symbol: string): string {
  const quote = symbol.split('_')[1] || 'USDT'
  if (quote === 'IDR') return 'Rp' + value.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function fmtMoneyCompact(value: number, symbol: string): string {
  const quote = symbol.split('_')[1] || 'USDT'
  if (quote === 'IDR') {
    if (value >= 1_000_000_000) return 'Rp' + (value / 1_000_000_000).toFixed(1) + 'M'
    if (value >= 1_000_000) return 'Rp' + (value / 1_000_000).toFixed(1) + 'jt'
    if (value >= 1_000) return 'Rp' + (value / 1_000).toFixed(0) + 'rb'
    return 'Rp' + value.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  }
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(2) + 'M'
  if (value >= 1_000) return '$' + (value / 1_000).toFixed(2) + 'K'
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatInterval(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  if (sec < 86400) return `${Math.round(sec / 3600)}j`
  return `${Math.round(sec / 86400)}h`
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Sekarang'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}d lagi`
  if (s < 3600) return `${Math.floor(s / 60)}m lagi`
  return `${Math.floor(s / 3600)}j ${Math.floor((s % 3600) / 60)}m lagi`
}

function DcaPageInner() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const modeTab = (searchParams.get('mode') ?? 'live') as 'live' | 'paper' | 'signal'
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [symbolFilter, setSymbolFilter] = useState('all')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [forceSellConfirmId, setForceSellConfirmId] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())

  // tick every 10s to update countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['dca-sessions'],
    queryFn: api.dca.sessions.list,
    enabled: isAuthenticated,
  })

  const sessionIds = useMemo(() => sessions?.map(s => s.id) ?? [], [sessions])
  const uniqueSymbols = useMemo(() => [...new Set(sessions?.map(s => s.symbol) ?? [])], [sessions])

  // Orders per session — only for next-buy countdown (last buy time)
  const orderQueries = useQueries({
    queries: sessionIds.map(id => ({
      queryKey: ['orders', id],
      queryFn: () => api.sessions.getOrders(id),
      enabled: isAuthenticated && sessionIds.length > 0,
      staleTime: 30_000,
    })),
  })

  const ordersBySession = useMemo(() =>
    Object.fromEntries(sessionIds.map((id, i) => [id, orderQueries[i]?.data ?? []])) as Record<number, Order[]>,
    [sessionIds, orderQueries]
  )

  // DCA stats per session — aggregated from backend (total buys, avg price, total invested)
  const dcaStatsQueries = useQueries({
    queries: sessionIds.map(id => ({
      queryKey: ['dca-stats', id],
      queryFn: () => api.sessions.getDCAStats(id),
      enabled: isAuthenticated && sessionIds.length > 0,
      staleTime: 30_000,
    })),
  })

  const dcaStatsBySession = useMemo(() => {
    const map: Record<number, { buy_count: number; total_qty: number; total_invested: number; avg_buy_price: number; last_buy_price: number } | null> = {}
    sessionIds.forEach((id, i) => { map[id] = dcaStatsQueries[i]?.data ?? null })
    return map
  }, [sessionIds, dcaStatsQueries])

  // Ticker per unique symbol — one batched request, refetch every 1s for live bar
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

  const liveIds = useMemo(() => sessions?.filter(s => s.mode === 'live').map(s => s.id) ?? [], [sessions])
  const livePnlBySession = useLivePnl(liveIds)

  const filteredSessions = useMemo(() => {
    const result = (sessions ?? [])
      .filter(s => s.mode === modeTab)
      .filter(s => symbolFilter === 'all' || s.symbol === symbolFilter)
    return [...result].sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (a.status !== 'running' && b.status === 'running') return 1
      return 0
    })
  }, [sessions, symbolFilter, modeTab])

  const { data: liveBalance } = useQuery({
    queryKey: ['account-balance'],
    queryFn: () => api.account.balance(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  const idrFree = parseFloat(liveBalance?.assets.find(a => a.asset === 'IDR')?.free ?? '0')

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
  }

  async function handleForceSell(id: number) {
    setForceSellConfirmId(null)
    try {
      await api.dca.sessions.forceSell(id)
      refetch()
      toast('Posisi berhasil dijual', 'success')
    } catch (e: any) { toast(e?.message || 'Gagal force sell', 'error') }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions/dca" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 flex-shrink-0 rounded-[14px] bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842] flex items-center justify-center"><Coins size={20} /></span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">DCA</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-xs sm:text-sm text-[#686868] dark:text-[#898989]">Beli aset secara berkala dalam jumlah tetap</p>
                {liveBalance && (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${idrFree < 50000 ? 'bg-[rgba(208,50,56,0.1)] text-[#d03238] dark:text-[#ff6b6f]' : 'bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842]'}`}>
                    <Zap size={11} />Rp {idrFree.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                    {idrFree < 50000 && ' ⚠️'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex-shrink-0 px-3 py-2 sm:px-5 sm:py-3 bg-[#ffd11a] text-[#3d2f00] font-bold border-2 border-[#ffd11a] hover:bg-[#ffe566] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(255,209,26,0.4)] whitespace-nowrap flex items-center gap-1.5">
            <Plus size={16} /> New Session
          </button>
        </div>

        <StrategyTabs active="dca" />

        {/* Mode sub-tabs: Live | Paper | Signal */}
        <div className="flex gap-1 p-1 bg-[#f0f1ee] dark:bg-[#252822] rounded-full border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-6 w-fit">
          {(['live', 'paper', 'signal'] as const).map(m => {
            const counts = { live: sessions?.filter(s => s.mode === 'live').length ?? 0, paper: sessions?.filter(s => s.mode === 'paper').length ?? 0, signal: sessions?.filter(s => s.mode === 'signal').length ?? 0 }
            const activeStyle = m === 'live'
              ? 'bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f] shadow-[0_1px_4px_rgba(208,50,56,0.2)]'
              : m === 'paper'
              ? 'bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870] shadow-[0_1px_4px_rgba(159,232,112,0.25)]'
              : 'bg-[rgba(56,200,255,0.12)] text-[#0994b3] dark:text-[#5dd8f5] shadow-[0_1px_4px_rgba(56,200,255,0.2)]'
            const label = m === 'live' ? '⚡ Live' : m === 'paper' ? 'Paper' : 'Signal'
            return (
              <button
                key={m}
                onClick={() => router.push(`/sessions/dca${m !== 'live' ? `?mode=${m}` : ''}`)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition whitespace-nowrap ${
                  modeTab === m ? activeStyle : 'text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:bg-white dark:hover:bg-[#1e201c]'
                }`}
              >
                {label}
                {counts[m] > 0 && <span className="text-[10px] font-bold opacity-60">{counts[m]}</span>}
              </button>
            )
          })}
        </div>
        {sessions && <StrategyOverview sessions={sessions.filter(s => s.mode === modeTab)} strategy="dca" />}
        {sessions && sessions.length > 0 && (() => {
          const liveSessions = sessions.filter(s => s.mode === 'live')
          const allStats = liveSessions.map(s => dcaStatsBySession[s.id]).filter(Boolean)
          const totalInvestedAll = allStats.reduce((s, st) => s + (st?.total_invested ?? 0), 0)
          const totalQtyBySymbol: Record<string, number> = {}
          const totalCostBySymbol: Record<string, number> = {}
          liveSessions.forEach(session => {
            const st = dcaStatsBySession[session.id]
            if (!st) return
            const sym = session.symbol
            totalQtyBySymbol[sym] = (totalQtyBySymbol[sym] ?? 0) + st.total_qty
            totalCostBySymbol[sym] = (totalCostBySymbol[sym] ?? 0) + st.avg_buy_price * st.total_qty
          })
          let totalUnrealized = 0
          Object.entries(totalQtyBySymbol).forEach(([sym, qty]) => {
            const ticker = tickerBySymbol[sym]
            const avgPrice = qty > 0 ? (totalCostBySymbol[sym] ?? 0) / qty : 0
            if (ticker && avgPrice > 0 && qty > 0) {
              totalUnrealized += (parseFloat(ticker.lastPrice) - avgPrice) * qty
            }
          })
          if (totalInvestedAll <= 0) return null
          const hasIDR = sessions.some(s => s.symbol.endsWith('_IDR'))
          const quote = hasIDR ? 'IDR' : 'USDT'
          const fmtTotal = (v: number) => quote === 'IDR'
            ? 'Rp' + v.toLocaleString('id-ID', { maximumFractionDigits: 0 })
            : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          return (
            <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="text-[#686868] dark:text-[#898989]">Total invested</span>
              <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmtTotal(totalInvestedAll)}</span>
              {totalUnrealized !== 0 && <>
                <span className="text-[#686868] dark:text-[#898989]">Unrealized</span>
                <span className={`font-bold ${totalUnrealized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {totalUnrealized >= 0 ? '+' : ''}{fmtTotal(totalUnrealized)}
                </span>
              </>}
            </div>
          )
        })()}
        <InfoStrip tone="dca" icon={<Coins size={16} />} text="Bot membeli aset secara rutin dalam jumlah tetap, meratakan harga beli rata-rata (cost averaging) dari waktu ke waktu." help="DCA cocok untuk investasi jangka panjang — tidak perlu timing pasar, cukup beli rutin." />
        <StrategyBanner strategy="dca" sessions={sessions ?? []} />

        {/* Session list */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest">
            Session DCA · {filteredSessions.length}{symbolFilter !== 'all' ? ` (${symbolFilter.replace('_', '/')})` : ` / ${sessions?.length ?? 0}`}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
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
        </div>

        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : filteredSessions.length === 0 ? (
          sessions?.length ? (
            <p className="text-sm text-[#686868] dark:text-[#898989] py-8 text-center">Tidak ada session untuk pair {symbolFilter.replace('_', '/')}.</p>
          ) : (
            <EmptyState icon={<Coins size={28} />} title="Belum ada session DCA" description="Buat session pertama kamu untuk mulai membeli aset secara rutin dan meratakan harga beli rata-rata." actionLabel="New Session" onAction={() => setShowCreate(true)} />
          )
        ) : (
          <div className="space-y-3">
            {filteredSessions.map(s => {
              const cfg = parseDCAConfig(s.config)
              const orders: Order[] = ordersBySession[s.id] ?? []
              const cycleStart = s.started_at ? new Date(s.started_at).getTime() : null
              const cycleOrders = cycleStart ? orders.filter(o => new Date(o.created_at).getTime() >= cycleStart) : orders
              const lastBuy = cycleOrders.filter(o => o.side === 'buy').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
              const nextBuyMs = cfg && lastBuy && s.status === 'running'
                ? new Date(lastBuy.created_at).getTime() + cfg.interval_sec * 1000 - now
                : null
              // Use backend-aggregated stats — accurate regardless of order count
              const stats = dcaStatsBySession[s.id]
              const totalBuys = stats?.buy_count ?? 0
              const totalInvested = stats?.total_invested ?? 0
              const totalQty = stats?.total_qty ?? 0
              const avgBuy = stats?.avg_buy_price ?? 0

              return (
                <div key={s.id}>
                  <SessionCard session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={id => router.push(`/sessions/${id}`)} livePnl={s.mode === 'live' ? (livePnlBySession[s.id] ?? null) : undefined} confirmDelete={confirmId === s.id} onCancelDelete={() => setConfirmId(null)} onForceSell={(id) => forceSellConfirmId === id ? handleForceSell(id) : setForceSellConfirmId(id)} forceSellConfirm={forceSellConfirmId === s.id} onCancelForceSell={() => setForceSellConfirmId(null)} />

                  {/* DCA config strip */}
                  {cfg && (
                    <div className={`mx-1 -mt-1 border border-t-0 rounded-b-[16px] px-4 pt-3 pb-3 ${
                      s.mode === 'live'
                        ? 'bg-[rgba(208,50,56,0.03)] dark:bg-[rgba(208,50,56,0.05)] border-[rgba(208,50,56,0.2)]'
                        : 'bg-[rgba(255,209,26,0.04)] dark:bg-[rgba(255,209,26,0.06)] border-[rgba(255,209,26,0.15)]'
                    }`}>

                      {/* 2-column: P&L kiri, Posisi Beli kanan */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">

                        {/* Kolom kiri: P&L — angka besar, label kecil di bawah */}
                        <div className="space-y-2">
                          {s.mode === 'live' && livePnlBySession[s.id] ? (() => {
                            const pnl = livePnlBySession[s.id]!
                            const realized = pnl.realized ?? 0
                            const currentPrice = tickerBySymbol[s.symbol] ? parseFloat(tickerBySymbol[s.symbol]!.lastPrice) : 0
                            const unrealized = currentPrice > 0 && avgBuy > 0 && totalQty > 0 ? (currentPrice - avgBuy) * totalQty : null
                            const totalPnl = realized + (unrealized ?? 0)
                            const pnlPct = unrealized !== null && totalInvested > 0 ? (unrealized / totalInvested * 100) : null
                            return (<>
                              {/* #1: Total P&L as primary number */}
                              <div>
                                <p className={`font-black text-lg leading-tight ${totalPnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                  {totalPnl >= 0 ? '+' : ''}{fmtMoneyCompact(totalPnl, s.symbol)}
                                </p>
                                <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">Total P&L</p>
                              </div>
                              <div>
                                <p className={`font-bold text-base leading-tight ${realized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                  {realized >= 0 ? '+' : ''}{fmtMoneyCompact(realized, s.symbol)}
                                </p>
                                <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">realized</p>
                              </div>
                              {unrealized !== null && (
                                <div>
                                  <div className="flex items-baseline gap-1">
                                    <p className={`font-semibold text-sm leading-tight ${unrealized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                      {unrealized >= 0 ? '+' : ''}{fmtMoneyCompact(unrealized, s.symbol)}
                                    </p>
                                    {/* #3: % P&L dari modal */}
                                    {pnlPct !== null && (
                                      <span className={`text-[10px] font-semibold ${pnlPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                        ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">unrealized</p>
                                </div>
                              )}
                            </>)
                          })() : totalQty > 0 && avgBuy > 0 && tickerBySymbol[s.symbol] ? (() => {
                            const currentPrice = parseFloat(tickerBySymbol[s.symbol]!.lastPrice)
                            const unrealized = (currentPrice - avgBuy) * totalQty
                            return (
                              <div>
                                <p className={`font-bold text-base leading-tight ${unrealized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                  {unrealized >= 0 ? '+' : ''}{fmtMoneyCompact(unrealized, s.symbol)}
                                </p>
                                <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">unrealized</p>
                              </div>
                            )
                          })() : (
                            <div>
                              <p className="font-bold text-base text-[#686868] dark:text-[#898989]">—</p>
                              <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">P&L</p>
                            </div>
                          )}
                        </div>

                        {/* Kolom kanan: Posisi Beli + % jarak dari avg */}
                        <div className="space-y-2">
                          {totalBuys > 0 ? (() => {
                            const currentPrice = tickerBySymbol[s.symbol] ? parseFloat(tickerBySymbol[s.symbol]!.lastPrice) : 0
                            const distPct = currentPrice > 0 && avgBuy > 0 ? ((currentPrice - avgBuy) / avgBuy * 100) : null
                            return (<>
                              <div>
                                <div className="flex items-baseline gap-1.5">
                                  <p className="font-bold text-base leading-tight text-[#0e0f0c] dark:text-[#e8ebe6]">
                                     {avgBuy > 0 ? fmtMoneyCompact(avgBuy, s.symbol) : '—'}
                                  </p>
                                  {distPct !== null && (
                                    <span className={`text-[10px] font-semibold ${distPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                      {distPct >= 0 ? '+' : ''}{distPct.toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">avg beli · {totalBuys}x</p>
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-[#0e0f0c] dark:text-[#e8ebe6]">
                                   {fmtMoneyCompact(totalInvested, s.symbol)}
                                   {(cfg.max_invested ?? 0) > 0 && (
                                     <span className="text-[#686868] dark:text-[#898989] font-normal text-xs"> / {fmtMoneyCompact(cfg.max_invested!, s.symbol)}</span>
                                  )}
                                </p>
                                <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">invested</p>
                              </div>
                              {/* #2: Qty holding + nilai holding (live only) */}
                              {s.mode === 'live' && (() => {
                                const currentPrice = tickerBySymbol[s.symbol] ? parseFloat(tickerBySymbol[s.symbol]!.lastPrice) : 0
                                const holdingValue = totalQty * currentPrice
                                if (totalQty <= 0 || currentPrice <= 0) return null
                                return (
                                  <div>
                                    <p className="font-semibold text-sm text-[#0e0f0c] dark:text-[#e8ebe6]">
                                      {totalQty.toFixed(6)} {s.symbol.split('_')[0]}
                                    </p>
                                    <p className="text-[10px] text-[#686868] dark:text-[#898989]">≈ {fmtMoneyCompact(holdingValue, s.symbol)}</p>
                                    <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">holding saat ini</p>
                                  </div>
                                )
                              })()}
                              {(cfg.max_buys ?? 0) > 0 && (() => {
                                const pct = Math.min(100, (totalBuys / cfg.max_buys!) * 100)
                                return (
                                  <div>
                                    <div className="flex items-center justify-between text-[10px] text-[#686868] dark:text-[#898989] mb-1">
                                      <span>{totalBuys}/{cfg.max_buys} beli</span>
                                      <span>{pct.toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full h-1 rounded-full bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] overflow-hidden">
                                      <div className="h-full rounded-full bg-[rgba(255,209,26,0.7)]" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                )
                              })()}
                            </>)
                          })() : s.status === 'running' ? (
                            <div>
                              <p className="font-bold text-base text-[#686868] dark:text-[#898989]">—</p>
                              <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5 italic">menunggu beli pertama</p>
                            </div>
                          ) : (
                            <div>
                              <p className="font-bold text-base text-[#686868] dark:text-[#898989]">—</p>
                              <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">posisi</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* DCABar — dipindah ke atas config pills */}
                      {avgBuy > 0 && tickerBySymbol[s.symbol] && ((cfg.take_profit_pct ?? 0) > 0 || (cfg.stop_loss_pct ?? 0) > 0) && (
                        <div className="mb-2.5">
                          <DCABar
                            avgBuy={avgBuy}
                            current={parseFloat(tickerBySymbol[s.symbol]!.lastPrice)}
                            tpPct={cfg.take_profit_pct ?? 0}
                            slPct={cfg.stop_loss_pct ?? 0}
                            cur={s.symbol.split('_')[1] === 'IDR' ? 'Rp' : '$'}
                          />
                        </div>
                      )}

                      {/* Divider */}
                      <div className="border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-2.5" />

                      {/* Config pills + countdown */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989] font-medium">
                            {fmtMoney(parseFloat(cfg.amount), s.symbol)} / {formatInterval(cfg.interval_sec)}
                          </span>
                          {(cfg.drop_pct ?? 0) > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989] font-medium">
                              Turun {cfg.drop_pct}%
                            </span>
                          )}
                          {(cfg.take_profit_pct ?? 0) > 0 && (
                            <span className="hidden sm:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870] font-semibold">
                              TP {cfg.take_profit_pct}%
                            </span>
                          )}
                          {(cfg.stop_loss_pct ?? 0) > 0 && (
                            <span className="hidden sm:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f] font-semibold">
                              SL {cfg.stop_loss_pct}%
                            </span>
                          )}
                        </div>
                        {s.status === 'running' && nextBuyMs !== null && (
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                            nextBuyMs <= 0
                              ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]'
                              : nextBuyMs <= 5 * 60 * 1000
                              ? 'bg-[rgba(255,209,26,0.15)] text-[#7a5f00] dark:text-[#f5c842]'
                              : 'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989]'
                          }`}>
                            <Clock size={10} />
                            {nextBuyMs > 0 ? formatCountdown(nextBuyMs) : 'Siap beli'}
                            {/* #5: Estimasi jam beli berikutnya */}
                            {(() => {
                              const nextBuyTime = nextBuyMs !== null && nextBuyMs > 0 ? new Date(Date.now() + nextBuyMs) : null
                              return nextBuyTime ? (
                                <span className="opacity-70">• ~{nextBuyTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                              ) : null
                            })()}
                          </span>
                        )}
                      </div>

                      {/* #4: Trigger price beli berikutnya (live only) */}
                      {s.mode === 'live' && (cfg.drop_pct ?? 0) > 0 && (stats?.last_buy_price ?? 0) > 0 && (() => {
                        const triggerPrice = stats!.last_buy_price * (1 - cfg.drop_pct! / 100)
                        return (
                          <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-1">
                            Trigger: <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmtMoney(triggerPrice, s.symbol)}</span>
                          </p>
                        )
                      })()}

                      {/* #6: Warning saldo tidak cukup (live + IDR only) */}
                      {s.mode === 'live' && s.status === 'running' && s.symbol.endsWith('_IDR') && idrFree > 0 && parseFloat(cfg.amount) > idrFree && (
                        <p className="text-[10px] text-[#d03238] dark:text-[#ff6b6f] font-semibold mt-1">
                          ⚠ Saldo tidak cukup untuk beli berikutnya ({fmtMoneyCompact(idrFree, s.symbol)} tersedia)
                        </p>
                      )}

                      {/* Paper: modal progress bar */}
                      {s.mode === 'paper' && s.virtual_balance != null && s.initial_balance != null && totalInvested > 0 && (() => {
                        const usedPct = Math.min(100, (totalInvested / s.initial_balance) * 100)
                        return (
                          <div className="mt-2.5">
                            <div className="flex items-center justify-between text-[10px] text-[#686868] dark:text-[#898989] mb-1">
                              <span>Modal terpakai</span>
                              <span>{usedPct.toFixed(1)}% dari {fmtMoney(s.initial_balance, s.symbol)}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] overflow-hidden">
                              <div className="h-full rounded-full bg-[rgba(255,209,26,0.6)]" style={{ width: `${usedPct}%` }} />
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <CreateSessionModal strategy="dca" open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  )
}

export default function DcaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]" />}>
      <DcaPageInner />
    </Suspense>
  )
}
