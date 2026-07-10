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
import type { DCAConfig, Order, Ticker } from '@/types'
import { Coins, Plus, Clock, TrendingUp, Zap } from 'lucide-react'
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

export default function DcaPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
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
    const result = symbolFilter === 'all' ? (sessions ?? []) : (sessions ?? []).filter(s => s.symbol === symbolFilter)
    return [...result].sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (a.status !== 'running' && b.status === 'running') return 1
      return 0
    })
  }, [sessions, symbolFilter])

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
        {sessions && <StrategyOverview sessions={sessions} strategy="dca" />}
        {sessions && sessions.length > 0 && (() => {
          const allStats = Object.values(dcaStatsBySession).filter(Boolean)
          const totalInvestedAll = allStats.reduce((s, st) => s + (st?.total_invested ?? 0), 0)
          const totalQtyBySymbol: Record<string, number> = {}
          const avgPriceBySymbol: Record<string, number> = {}
          Object.entries(dcaStatsBySession).forEach(([id, st]) => {
            if (!st) return
            const session = sessions.find(s => s.id === Number(id))
            if (!session) return
            const sym = session.symbol
            totalQtyBySymbol[sym] = (totalQtyBySymbol[sym] ?? 0) + st.total_qty
            avgPriceBySymbol[sym] = st.avg_buy_price
          })
          let totalUnrealized = 0
          Object.entries(totalQtyBySymbol).forEach(([sym, qty]) => {
            const ticker = tickerBySymbol[sym]
            const avgPrice = avgPriceBySymbol[sym]
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
              const lastBuy = orders.filter(o => o.side === 'buy').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
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
                  <SessionCard session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={id => router.push(`/sessions/${id}`)} livePnl={s.mode === 'live' ? (livePnlBySession[s.id] ?? null) : undefined} confirmDelete={confirmId === s.id} onCancelDelete={() => setConfirmId(null)} onForceSell={() => setForceSellConfirmId(s.id)} forceSellConfirm={forceSellConfirmId === s.id} onCancelForceSell={() => setForceSellConfirmId(null)} />

                  {/* DCA config strip */}
                  {cfg && (
                    <div className={`mx-1 -mt-1 border border-t-0 rounded-b-[16px] px-4 py-2.5 ${
                      s.mode === 'live'
                        ? 'bg-[rgba(208,50,56,0.03)] dark:bg-[rgba(208,50,56,0.05)] border-[rgba(208,50,56,0.2)]'
                        : 'bg-[rgba(255,209,26,0.04)] dark:bg-[rgba(255,209,26,0.06)] border-[rgba(255,209,26,0.15)]'
                    }`}>
                      {/* Row 1: config */}
                      <div className="flex items-center gap-2 text-xs text-[#686868] dark:text-[#898989] flex-wrap">
                        {s.mode === 'live' && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.1)] px-1.5 py-0.5 rounded-full">⚡ Live Order</span>
                        )}
                        <span>Beli <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmtMoney(parseFloat(cfg.amount), s.symbol)}</span></span>
                        <span className="opacity-30">·</span>
                        <span>Tiap <span className="font-semibold text-[#7a5f00] dark:text-[#f5c842]">{formatInterval(cfg.interval_sec)}</span></span>
                        {cfg.drop_pct && cfg.drop_pct > 0 && (<>
                          <span className="opacity-30">·</span>
                          <span>Turun <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{cfg.drop_pct}%</span></span>
                        </>)}
                        {cfg.take_profit_pct && cfg.take_profit_pct > 0 && (<>
                          <span className="opacity-30">·</span>
                          <span className="flex items-center gap-1"><TrendingUp size={11} className="text-[#054d28] dark:text-[#9fe870]" />TP <span className="font-semibold text-[#054d28] dark:text-[#9fe870]">{cfg.take_profit_pct}%</span></span>
                        </>)}
                        {(cfg.stop_loss_pct ?? 0) > 0 && (<>
                          <span className="opacity-30">·</span>
                          <span className="flex items-center gap-1"><span className="text-[#d03238] dark:text-[#ff6b6f]">SL</span> <span className="font-semibold text-[#d03238] dark:text-[#ff6b6f]">{cfg.stop_loss_pct}%</span></span>
                        </>)}
                      </div>

                      <div className="border-t border-[rgba(14,15,12,0.04)] dark:border-[rgba(232,235,230,0.04)] my-2" />

                      {/* Row 2: progress */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-xs text-[#686868] dark:text-[#898989] flex-wrap">
                          {totalBuys > 0 && (<>
                            <span><span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{totalBuys}</span> beli</span>
                            {avgBuy > 0 && (<>
                              <span className="opacity-30">·</span>
                              <span>avg <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmtMoney(avgBuy, s.symbol)}</span></span>
                            </>)}
                            <span className="opacity-30">·</span>
                            <span>
                              <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmtMoney(totalInvested, s.symbol)}</span> invested
                              {s.mode === 'live' && <span className="ml-1 text-[9px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.08)] px-1 py-0.5 rounded">real</span>}
                            </span>
                          </>)}
                          {totalQty > 0 && avgBuy > 0 && tickerBySymbol[s.symbol] && (() => {
                            const currentPrice = parseFloat(tickerBySymbol[s.symbol]!.lastPrice)
                            const unrealized = (currentPrice - avgBuy) * totalQty
                            return (<>
                              <span className="opacity-30">·</span>
                              <span className={`font-semibold ${unrealized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                {unrealized >= 0 ? '+' : '-'}{fmtMoney(Math.abs(unrealized), s.symbol)} unrealized
                              </span>
                            </>)
                          })()}
                        </div>
                        {/* Next buy countdown */}
                        {s.status === 'running' && nextBuyMs !== null && (
                          <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${
                            nextBuyMs <= 0
                              ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870] font-semibold'
                              : 'text-[#686868] dark:text-[#898989]'
                          }`}>
                            <Clock size={11} />
                            {nextBuyMs > 0 ? formatCountdown(nextBuyMs) : 'Siap beli'}
                          </span>
                        )}
                      </div>

                      {totalBuys === 0 && s.status === 'running' && (
                        <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-1.5 italic">Menunggu beli pertama...</p>
                      )}

                      {/* Invested progress bar (paper only) */}
                      {s.mode === 'paper' && s.virtual_balance != null && s.initial_balance != null && totalInvested > 0 && (() => {
                        const usedPct = Math.min(100, (totalInvested / s.initial_balance) * 100)
                        return (
                          <div className="mt-2">
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

                      {/* DCA progress bar toward TP / away from SL */}
                      {avgBuy > 0 && tickerBySymbol[s.symbol] && ((cfg.take_profit_pct ?? 0) > 0 || (cfg.stop_loss_pct ?? 0) > 0) && (
                        <DCABar
                          avgBuy={avgBuy}
                          current={parseFloat(tickerBySymbol[s.symbol]!.lastPrice)}
                          tpPct={cfg.take_profit_pct ?? 0}
                          slPct={cfg.stop_loss_pct ?? 0}
                          cur={s.symbol.split('_')[1] === 'IDR' ? 'Rp' : '$'}
                        />
                      )}
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
