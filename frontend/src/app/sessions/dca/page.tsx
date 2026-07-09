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

function parseDCAConfig(config: string): DCAConfig | null {
  try { return JSON.parse(config) } catch { return null }
}

function formatInterval(sec: number): string {
  if (sec < 60) return `${sec}d`
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

// DCABar: SL (kiri) ←→ Avg (tengah) ←→ TP (kanan), dot = posisi harga saat ini
function DCABar({ avgBuy, current, tpPct, slPct }: { avgBuy: number; current: number; tpPct: number; slPct: number }) {
  if (avgBuy <= 0) return null
  const gainPct = ((current - avgBuy) / avgBuy) * 100

  // Range: dari -slPct (atau -5% min) di kiri, sampai +tpPct (atau +5% min) di kanan
  const leftEdge = slPct > 0 ? -slPct : Math.min(-5, gainPct * 1.2)
  const rightEdge = tpPct > 0 ? tpPct : Math.max(5, gainPct * 1.2)
  const totalRange = rightEdge - leftEdge

  // posisi dot: gainPct dipetakan ke 0-100%
  const dotPct = Math.max(0, Math.min(100, ((gainPct - leftEdge) / totalRange) * 100))
  // posisi garis avg (selalu = titik 0)
  const avgLinePct = Math.max(0, Math.min(100, ((0 - leftEdge) / totalRange) * 100))
  // posisi garis TP
  const tpLinePct = tpPct > 0 ? Math.max(0, Math.min(100, ((tpPct - leftEdge) / totalRange) * 100)) : null
  // posisi garis SL
  const slLinePct = slPct > 0 ? Math.max(0, Math.min(100, ((-slPct - leftEdge) / totalRange) * 100)) : null

  const isProfit = gainPct >= 0
  const nearTP = tpPct > 0 && gainPct >= tpPct * 0.8
  const nearSL = slPct > 0 && gainPct <= -slPct * 0.8

  const dotColor = nearTP ? '#9fe870' : nearSL ? '#ff6b6f' : isProfit ? '#9fe870' : '#ff6b6f'

  return (
    <div className="w-full mt-3 mb-1">
      {/* Top labels */}
      <div className="flex items-center justify-between text-[10px] mb-1.5">
        <span className="text-[#686868] dark:text-[#898989]">
          Avg beli <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${avgBuy.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
        </span>
        <span className={`font-bold ${isProfit ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
          {nearTP && <span className="ml-1 animate-pulse"> · Mendekati TP!</span>}
          {nearSL && <span className="ml-1 animate-pulse text-[#ff6b6f]"> · Mendekati SL!</span>}
        </span>
      </div>

      {/* Bar */}
      <div className="relative w-full h-5 flex items-center">
        {/* Track background: kiri merah (rugi), kanan hijau (untung) */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full overflow-hidden" style={{
          background: `linear-gradient(to right, rgba(208,50,56,0.15) 0%, rgba(208,50,56,0.15) ${avgLinePct}%, rgba(159,232,112,0.15) ${avgLinePct}%, rgba(159,232,112,0.15) 100%)`
        }} />

        {/* SL line (kiri, merah) */}
        {slLinePct !== null && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-[#ff6b6f] opacity-70 rounded-full" style={{ left: `${slLinePct}%` }} />
        )}
        {/* Avg line (tengah, abu) */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-[rgba(140,140,140,0.5)] rounded-full" style={{ left: `${avgLinePct}%` }} />
        {/* TP line (kanan, hijau) */}
        {tpLinePct !== null && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-[#9fe870] opacity-70 rounded-full" style={{ left: `${tpLinePct}%` }} />
        )}

        {/* Dot = posisi harga saat ini */}
        <div className="absolute w-3 h-3 rounded-full border-2 border-white dark:border-[#1e201c] shadow transition-all" style={{
          left: `${dotPct}%`,
          transform: 'translateX(-50%)',
          background: dotColor,
        }} />
      </div>

      {/* Bottom labels: SL · Avg · TP */}
      <div className="relative mt-1" style={{ height: '14px' }}>
        {slLinePct !== null && (
          <span className="absolute text-[9px] text-[#d03238] dark:text-[#ff6b6f]" style={{ left: `${slLinePct}%`, transform: 'translateX(-50%)' }}>
            -{slPct}%
          </span>
        )}
        <span className="absolute text-[9px] text-[#686868] dark:text-[#898989]" style={{ left: `${avgLinePct}%`, transform: 'translateX(-50%)' }}>
          avg
        </span>
        {tpLinePct !== null && (
          <span className="absolute text-[9px] text-[#054d28] dark:text-[#9fe870]" style={{ left: `${tpLinePct}%`, transform: 'translateX(-50%)' }}>
            +{tpPct}%
          </span>
        )}
      </div>

      {/* Status line */}
      <div className="mt-2 flex items-center justify-between text-[10px] flex-wrap gap-1">
        {slPct > 0 && (
          <span className="text-[#686868] dark:text-[#898989]">
            SL <span className="font-semibold text-[#d03238] dark:text-[#ff6b6f]">${(avgBuy * (1 - slPct / 100)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            {' '}({(gainPct - (-slPct)).toFixed(2)}% menuju SL)
          </span>
        )}
        {tpPct > 0 && (
          <span className="text-[#686868] dark:text-[#898989]">
            TP <span className="font-semibold text-[#054d28] dark:text-[#9fe870]">${(avgBuy * (1 + tpPct / 100)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            {' '}({(tpPct - gainPct).toFixed(2)}% lagi)
          </span>
        )}
      </div>
    </div>
  )
}

export default function DcaPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [showCreate, setShowCreate] = useState(false)
  const [symbolFilter, setSymbolFilter] = useState('all')
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

  // Ticker per unique symbol — refetch every 1s for live bar
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

  const liveIds = useMemo(() => sessions?.filter(s => s.mode === 'live').map(s => s.id) ?? [], [sessions])
  const livePnlQueries = useQueries({
    queries: liveIds.map(id => ({
      queryKey: ['pnl', id],
      queryFn: () => api.sessions.getPnL(id),
      enabled: isAuthenticated && liveIds.length > 0,
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
  })
  const livePnlBySession = useMemo(() => {
    const map: Record<number, { realized: number; trades: number } | null> = {}
    liveIds.forEach((id, i) => {
      const d = livePnlQueries[i]?.data
      map[id] = d ? { realized: parseFloat(d.realized_pnl), trades: d.trade_count } : null
    })
    return map
  }, [liveIds, livePnlQueries])

  const filteredSessions = useMemo(() =>
    symbolFilter === 'all' ? (sessions ?? []) : (sessions ?? []).filter(s => s.symbol === symbolFilter),
    [sessions, symbolFilter]
  )

  const { data: liveBalance } = useQuery({
    queryKey: ['account-balance'],
    queryFn: () => api.account.balance(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  const usdtFree = parseFloat(liveBalance?.assets.find(a => a.asset === 'USDT')?.free ?? '0')

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
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 flex-shrink-0 rounded-[14px] bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842] flex items-center justify-center"><Coins size={20} /></span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">DCA</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-xs sm:text-sm text-[#686868] dark:text-[#898989]">Beli aset secara berkala dalam jumlah tetap</p>
                {liveBalance && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${usdtFree < 10 ? 'bg-[rgba(208,50,56,0.1)] text-[#d03238] dark:text-[#ff6b6f]' : 'bg-[rgba(255,209,26,0.1)] text-[#7a5f00] dark:text-[#f5c842]'}`}>
                    <Zap size={9} />USDT {usdtFree.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {usdtFree < 10 && ' ⚠️'}
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
        <InfoStrip tone="dca" icon={<Coins size={16} />} text="Bot membeli aset secara rutin dalam jumlah tetap, meratakan harga beli rata-rata (cost averaging) dari waktu ke waktu." help="DCA cocok untuk investasi jangka panjang — tidak perlu timing pasar, cukup beli rutin." />
        <StrategyBanner strategy="dca" sessions={sessions ?? []} />

        {/* Session list */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest">
            Session DCA · {filteredSessions.length}{symbolFilter !== 'all' ? ` (${symbolFilter.replace('_', '/')})` : ` / ${sessions?.length ?? 0}`}
          </p>
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
                  <SessionCard session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={id => router.push(`/sessions/${id}`)} livePnl={s.mode === 'live' ? (livePnlBySession[s.id] ?? null) : undefined} />

                  {/* DCA config strip */}
                  {cfg && (
                    <div className={`mx-1 -mt-1 border border-t-0 rounded-b-[16px] px-4 py-2.5 ${
                      s.mode === 'live'
                        ? 'bg-[rgba(208,50,56,0.03)] dark:bg-[rgba(208,50,56,0.05)] border-[rgba(208,50,56,0.2)]'
                        : 'bg-[rgba(255,209,26,0.04)] dark:bg-[rgba(255,209,26,0.06)] border-[rgba(255,209,26,0.15)]'
                    }`}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-xs text-[#686868] dark:text-[#898989] flex-wrap">
                          {s.mode === 'live' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.1)] px-1.5 py-0.5 rounded-full">⚡ Live Order</span>
                          )}
                          <span>Beli <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${cfg.amount}</span></span>
                          <span className="opacity-30">·</span>
                          <span>Tiap <span className="font-semibold text-[#7a5f00] dark:text-[#f5c842]">{formatInterval(cfg.interval_sec)}</span></span>
                          {cfg.take_profit_pct && cfg.take_profit_pct > 0 && (<>
                            <span className="opacity-30">·</span>
                            <span className="flex items-center gap-1"><TrendingUp size={11} className="text-[#054d28] dark:text-[#9fe870]" />TP <span className="font-semibold text-[#054d28] dark:text-[#9fe870]">{cfg.take_profit_pct}%</span></span>
                          </>)}
                          {(cfg.stop_loss_pct ?? 0) > 0 && (<>
                            <span className="opacity-30">·</span>
                            <span className="flex items-center gap-1"><span className="text-[#d03238] dark:text-[#ff6b6f]">SL</span> <span className="font-semibold text-[#d03238] dark:text-[#ff6b6f]">{cfg.stop_loss_pct}%</span></span>
                          </>)}
                          {totalBuys > 0 && (<>
                            <span className="opacity-30">·</span>
                            <span><span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{totalBuys}</span> beli · <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${totalInvested.toFixed(2)}</span> invested
                            {s.mode === 'live' && <span className="ml-1 text-[9px] font-bold text-[#d03238] dark:text-[#ff6b6f] bg-[rgba(208,50,56,0.08)] px-1 py-0.5 rounded">real</span>}
                            </span>
                          </>)}
                          {totalQty > 0 && avgBuy > 0 && tickerBySymbol[s.symbol] && (() => {
                            const currentPrice = parseFloat(tickerBySymbol[s.symbol]!.lastPrice)
                            const unrealized = (currentPrice - avgBuy) * totalQty
                            return (<>
                              <span className="opacity-30">·</span>
                              <span className={`font-semibold ${unrealized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                {unrealized >= 0 ? '+' : ''}${unrealized.toFixed(2)} unrealized
                              </span>
                            </>)
                          })()}
                        </div>
                        {/* Next buy countdown */}
                        {nextBuyMs !== null && (
                          <span className="flex items-center gap-1 text-xs text-[#686868] dark:text-[#898989]">
                            <Clock size={11} />
                            {formatCountdown(nextBuyMs)}
                          </span>
                        )}
                      </div>
                      {/* DCA progress bar toward TP / away from SL */}
                      {avgBuy > 0 && tickerBySymbol[s.symbol] && ((cfg.take_profit_pct ?? 0) > 0 || (cfg.stop_loss_pct ?? 0) > 0) && (
                        <DCABar
                          avgBuy={avgBuy}
                          current={parseFloat(tickerBySymbol[s.symbol]!.lastPrice)}
                          tpPct={cfg.take_profit_pct ?? 0}
                          slPct={cfg.stop_loss_pct ?? 0}
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
