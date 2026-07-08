'use client'
import { useEffect, useState, useMemo } from 'react'
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
import type { DCAConfig, Order, Ticker } from '@/types'
import { Coins, Plus, Clock, TrendingUp } from 'lucide-react'

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

// Progress bar: Avg (left=0%) → current gain → TP (right edge)
function DCABar({ avgBuy, current, tpPct }: { avgBuy: number; current: number; tpPct: number }) {
  if (avgBuy <= 0 || tpPct <= 0) return null
  const gainPct = ((current - avgBuy) / avgBuy) * 100
  // range: 0 (avg) → tpPct*1.1 so TP sits near right, not clipped
  const rangeMax = tpPct * 1.1
  const markerPct = Math.max(0, Math.min(100, (gainPct / rangeMax) * 100))
  const tpLinePos = Math.round((tpPct / rangeMax) * 100)
  const isProfit = gainPct >= 0
  const nearTP = gainPct >= tpPct * 0.8

  return (
    <div className="w-full mt-2 mb-1">
      {/* Avg price info */}
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-[#686868] dark:text-[#898989]">Avg beli <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${avgBuy.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></span>
        <span className={`font-semibold ${isProfit ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
          {nearTP && <span className="ml-1 animate-pulse">· Mendekati TP!</span>}
        </span>
      </div>
      <div className="relative w-full h-4 flex items-center">
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all ${isProfit ? 'bg-gradient-to-r from-[rgba(159,232,112,0.3)] to-[rgba(159,232,112,0.6)]' : 'bg-gradient-to-r from-[rgba(208,50,56,0.3)] to-[rgba(208,50,56,0.5)]'}`}
            style={{ width: `${markerPct}%` }}
          />
        </div>
        {/* TP target line */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-[rgba(159,232,112,0.7)] dark:bg-[rgba(159,232,112,0.6)] rounded-full" style={{ left: `${tpLinePos}%` }} title={`TP: +${tpPct}%`} />
        {/* Current price marker */}
        <div
          className={`absolute top-0 bottom-0 w-0.5 rounded-full transition-all ${nearTP ? 'bg-[#9fe870]' : isProfit ? 'bg-[#163300] dark:bg-[#9fe870]' : 'bg-[#d03238] dark:bg-[#ff6b6f]'}`}
          style={{ left: `${markerPct}%` }}
        />
        {/* Labels */}
        <span className="absolute -bottom-3.5 left-0 text-[9px] text-[#686868] dark:text-[#898989]">Avg</span>
        <span className="absolute -bottom-3.5 text-[9px] text-[#054d28] dark:text-[#9fe870]" style={{ left: `${tpLinePos}%`, transform: 'translateX(-50%)' }}>+{tpPct}%</span>
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

  // Orders per session for next-buy countdown
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

  const filteredSessions = useMemo(() =>
    symbolFilter === 'all' ? (sessions ?? []) : (sessions ?? []).filter(s => s.symbol === symbolFilter),
    [sessions, symbolFilter]
  )

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
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[14px] bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842] flex items-center justify-center"><Coins size={20} /></span>
            <div>
              <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">DCA</h1>
              <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Beli aset secara berkala dalam jumlah tetap</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-5 py-3 bg-[#ffd11a] text-[#3d2f00] font-bold border-2 border-[#ffd11a] hover:bg-[#ffe566] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(255,209,26,0.4)] whitespace-nowrap flex items-center gap-1.5">
            <Plus size={16} /> New Session
          </button>
        </div>

        <StrategyTabs active="dca" />
        <MarketTicker />
        {sessions && <StrategyOverview sessions={sessions} strategy="dca" />}
        <InfoStrip tone="dca" icon={<Coins size={16} />} text="Bot membeli aset secara rutin dalam jumlah tetap, meratakan harga beli rata-rata (cost averaging) dari waktu ke waktu." help="DCA cocok untuk investasi jangka panjang — tidak perlu timing pasar, cukup beli rutin." />
        <StrategyBanner strategy="dca" sessions={sessions ?? []} />

        {/* Session list */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <SectionLabel>SESSION DCA · {filteredSessions.length}{symbolFilter !== 'all' ? ` (${symbolFilter.replace('_', '/')})` : ` / ${sessions?.length ?? 0}`}</SectionLabel>
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
              const totalBuys = orders.filter(o => o.side === 'buy' && (o.status === 'filled' || o.status === 'signal')).length
              const filledBuys = orders.filter(o => o.side === 'buy' && (o.status === 'filled' || o.status === 'signal'))
              const totalInvested = filledBuys.reduce((sum, o) => sum + parseFloat(o.quantity) * parseFloat(o.price || '0'), 0)
              const totalQty = filledBuys.reduce((sum, o) => sum + parseFloat(o.quantity), 0)
              const avgBuy = totalQty > 0 ? filledBuys.reduce((sum, o) => sum + parseFloat(o.executed_price || o.price) * parseFloat(o.quantity), 0) / totalQty : 0

              return (
                <div key={s.id}>
                  <SessionCard session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={id => router.push(`/sessions/${id}`)} />

                  {/* DCA config strip */}
                  {cfg && (
                    <div className="mx-1 -mt-1 bg-[rgba(255,209,26,0.04)] dark:bg-[rgba(255,209,26,0.06)] border border-t-0 border-[rgba(255,209,26,0.15)] rounded-b-[16px] px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 text-xs text-[#686868] dark:text-[#898989] flex-wrap">
                          <span>Beli <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${cfg.amount}</span></span>
                          <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                          <span>Tiap <span className="font-semibold text-[#7a5f00] dark:text-[#f5c842]">{formatInterval(cfg.interval_sec)}</span></span>
                          {cfg.take_profit_pct && cfg.take_profit_pct > 0 && (<>
                            <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                            <span className="flex items-center gap-1"><TrendingUp size={11} className="text-[#054d28] dark:text-[#9fe870]" />TP <span className="font-semibold text-[#054d28] dark:text-[#9fe870]">{cfg.take_profit_pct}%</span></span>
                          </>)}
                          {totalBuys > 0 && (<>
                            <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                            <span><span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{totalBuys}</span> beli · <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${totalInvested.toFixed(2)}</span> invested</span>
                          </>)}
                        </div>
                        {/* Next buy countdown */}
                        {nextBuyMs !== null && (
                          <span className="flex items-center gap-1 text-xs text-[#686868] dark:text-[#898989]">
                            <Clock size={11} />
                            {formatCountdown(nextBuyMs)}
                          </span>
                        )}
                      </div>
                      {/* DCA progress bar toward TP */}
                      {cfg.take_profit_pct && cfg.take_profit_pct > 0 && avgBuy > 0 && tickerBySymbol[s.symbol] && (
                        <DCABar
                          avgBuy={avgBuy}
                          current={parseFloat(tickerBySymbol[s.symbol]!.lastPrice)}
                          tpPct={cfg.take_profit_pct}
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
