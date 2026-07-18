'use client'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Bot, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLivePnl } from '@/lib/useLivePnl'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { MarketMovers } from '@/components/sessions/MarketMovers'
import { StrategyCards } from '@/components/sessions/StrategyCard'
import { PerformanceSummary } from '@/components/sessions/PerformanceSummary'
import { EmptyState } from '@/components/sessions/EmptyState'
import type { DCAConfig } from '@/types'

const STABLE_ASSETS = new Set(['USDT', 'FDUSD', 'USDC', 'BUSD', 'IDR'])

export default function SessionsOverviewPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [portfolioOpen, setPortfolioOpen] = useState(true)

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.sessions.list,
    enabled: isAuthenticated,
  })

  const { data: liveBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ['account-balance'],
    queryFn: () => api.account.balance(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const portfolioAssets = liveBalance?.assets.filter(a => !STABLE_ASSETS.has(a.asset) && parseFloat(a.free) > 0) ?? []
  const portfolioSymbols = portfolioAssets.map(a => `${a.asset}_USDT`)

  const { data: portfolioTickers } = useQuery({
    queryKey: ['portfolio-tickers', portfolioSymbols.join(',')],
    queryFn: () => api.sessions.getTickersBulk(portfolioSymbols),
    enabled: isAuthenticated && portfolioSymbols.length > 0,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  const { data: usdtIdrTicker } = useQuery({
    queryKey: ['ticker-usdt-idr'],
    queryFn: () => api.sessions.getTicker('USDT_IDR'),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const running = sessions?.filter(s => s.status === 'running') ?? []
  const liveRunning = running.filter(s => s.mode === 'live')
  const paperRunning = running.filter(s => s.mode === 'paper')
  const paperPnl = sessions?.filter(s => s.mode === 'paper' && s.virtual_balance != null)
    .reduce((sum, s) => sum + ((s.virtual_balance ?? 0) - (s.initial_balance ?? 0)), 0) ?? 0

  const usdtIdrRate = (() => {
    const value = parseFloat(usdtIdrTicker?.lastPrice ?? '')
    return Number.isFinite(value) && value > 0 ? value : null
  })()

  // This is the configured budget ceiling, not capital already invested.
  const dcaBudgetCapIDR = liveRunning
    .filter(s => s.strategy === 'dca')
    .reduce((sum, s) => {
      try {
        const cfg = JSON.parse(s.config) as DCAConfig
        return sum + (cfg.max_invested ?? 0)
      } catch { return sum }
    }, 0)

  // Live P&L from useLivePnl hook
  const liveRunningIds = liveRunning.map(s => s.id)
  const livePnlBySession = useLivePnl(liveRunningIds)
  const liveRealizedPnlIDR = liveRunning.reduce((sum, session) => {
    const value = livePnlBySession[session.id]?.realized
    if (value == null) return sum
    return sum + (session.symbol.endsWith('_IDR') ? value : value * (usdtIdrRate ?? 0))
  }, 0)
  const hasLivePnl = liveRunningIds.some(id => livePnlBySession[id] != null)
  const pnlNeedsRate = liveRunning.some(s => !s.symbol.endsWith('_IDR') && livePnlBySession[s.id] != null)
  const canShowNormalizedPnl = hasLivePnl && (!pnlNeedsRate || usdtIdrRate != null)
  const idrFree = parseFloat(liveBalance?.assets.find(a => a.asset === 'IDR')?.free ?? '0')
  const blockedDca = liveBalance ? liveRunning.filter(session => {
    if (session.strategy !== 'dca' || !session.symbol.endsWith('_IDR')) return false
    try {
      const cfg = JSON.parse(session.config) as DCAConfig
      return Number(cfg.amount ?? 0) > idrFree
    } catch { return false }
  }) : []

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Dashboard</h1>
          <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Sesi trading, saldo akun, dan performa strategi.</p>
        </div>

        {/* Status mini cards */}
        {sessions && sessions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
            {/* Card 1: Live Running */}
            <div className={`rounded-[14px] px-3 py-2.5 border ${liveRunning.length > 0 ? 'border-[rgba(208,50,56,0.2)] bg-[rgba(208,50,56,0.04)] dark:bg-[rgba(208,50,56,0.08)]' : 'border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] bg-white dark:bg-[#1e201c]'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {liveRunning.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#d03238] animate-pulse" />}
                <span className="text-[9px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Live Running</span>
              </div>
              <p className={`text-lg font-black ${liveRunning.length > 0 ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#0e0f0c] dark:text-[#e8ebe6]'}`}>{liveRunning.length}</p>
            </div>
            {/* Card 2: Total Invested DCA */}
            <div className="rounded-[14px] px-3 py-2.5 border border-[rgba(255,209,26,0.2)] bg-[rgba(255,209,26,0.04)] dark:bg-[rgba(255,209,26,0.06)] dark:border-[rgba(255,209,26,0.15)]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide truncate">Batas Modal DCA</span>
              </div>
              <p className="text-lg font-black text-[#7a5f00] dark:text-[#f5c842] tabular-nums">
                {dcaBudgetCapIDR > 0 ? `Rp${dcaBudgetCapIDR.toLocaleString('id-ID', { maximumFractionDigits: 0 })}` : '—'}
              </p>
            </div>
            {/* Card 3: Realized P&L Live */}
            <div className="col-span-2 sm:col-span-1 rounded-[14px] px-3 py-2.5 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] bg-white dark:bg-[#1e201c]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide truncate">P&L Live (estimasi)</span>
              </div>
              <p className={`text-lg font-black tabular-nums ${!canShowNormalizedPnl ? 'text-[#686868] dark:text-[#898989]' : liveRealizedPnlIDR >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                {!canShowNormalizedPnl ? '—' : `${liveRealizedPnlIDR >= 0 ? '+' : ''}Rp${liveRealizedPnlIDR.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`}
              </p>
            </div>
          </div>
        )}

        {blockedDca.length > 0 && (
          <div className="mb-6 rounded-[16px] border border-[rgba(208,50,56,0.25)] bg-[rgba(208,50,56,0.06)] px-4 py-3 text-sm text-[#d03238] dark:text-[#ff6b6f]">
            <p className="font-bold">{blockedDca.length} DCA aktif tetapi tertahan saldo</p>
            <p className="text-xs mt-1 text-[#686868] dark:text-[#a5a8a2]">
              Saldo Rp{idrFree.toLocaleString('id-ID', { maximumFractionDigits: 0 })} belum cukup untuk nominal beli berikutnya. Worker tetap aktif, tetapi order beli tidak dapat dieksekusi.
            </p>
          </div>
        )}

        {/* Live sessions panel — compact per-session cards, only when live+running */}
        {liveRunning.length > 0 && (
          <div className="mb-6 rounded-[20px] border border-[rgba(208,50,56,0.25)] bg-[rgba(208,50,56,0.03)] dark:bg-[rgba(208,50,56,0.06)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d03238] animate-pulse" />
              <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6] uppercase tracking-widest">Live Sessions</span>
              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]">{liveRunning.length} running</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {liveRunning.map(s => {
                const pnl = livePnlBySession[s.id]
                const isIDR = s.symbol.endsWith('_IDR')
                return (
                  <button key={s.id} onClick={() => router.push(`/sessions/${s.id}`)}
                    className="text-left px-3 py-2.5 rounded-[14px] border border-[rgba(208,50,56,0.2)] bg-white dark:bg-[#1e201c] hover:border-[rgba(208,50,56,0.4)] transition-colors">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#d03238] animate-pulse flex-shrink-0" />
                      <span className="text-[10px] font-bold text-[#0e0f0c] dark:text-[#e8ebe6] truncate">{s.name}</span>
                    </div>
                    <p className="text-[9px] text-[#686868] dark:text-[#898989] truncate mb-1">
                      {s.symbol.replace('_', '/')} · <span className="capitalize">{s.strategy}</span>
                    </p>
                    {pnl != null ? (
                      <p className={`text-[10px] font-bold tabular-nums ${pnl.realized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                        {pnl.realized >= 0 ? '+' : ''}{isIDR ? 'Rp' : '$'}{pnl.realized.toLocaleString(isIDR ? 'id-ID' : 'en-US', isIDR ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ) : (
                      <p className="text-[9px] text-[#686868] dark:text-[#898989]">P&L —</p>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Strategy cards — top */}
        <StrategyCards sessions={sessions ?? []} />

        {/* Balance panel */}
        {(liveBalance || balanceLoading) && (
          <div className="mb-6 bg-white dark:bg-[#1e201c] rounded-[20px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
              <div className="flex items-center gap-2 min-w-0">
                <Zap size={14} className="text-[#d03238] dark:text-[#ff6b6f] flex-shrink-0" />
                <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6] uppercase tracking-wider">Akun TokoCrypto</span>
                {liveBalance && (() => {
                  const usdtFree = parseFloat(liveBalance.assets.find(a => a.asset === 'USDT')?.free ?? '0')
                  const idrFree = parseFloat(liveBalance.assets.find(a => a.asset === 'IDR')?.free ?? '0')
                  const idrRate = usdtIdrTicker ? parseFloat(usdtIdrTicker.lastPrice ?? '0') : 0
                  const portfolioUSDT = liveBalance.assets
                    .filter(a => !STABLE_ASSETS.has(a.asset))
                    .reduce((sum, a) => {
                      const sym = `${a.asset}_USDT`
                      const price = portfolioTickers?.[sym] ? parseFloat(portfolioTickers[sym].lastPrice ?? '0') : 0
                      return sum + parseFloat(a.free) * price
                    }, 0)
                  const totalIDR = (usdtFree + portfolioUSDT) * idrRate + idrFree
                  if (totalIDR <= 0 || idrRate <= 0) return null
                  return (
                    <span className="text-[10px] text-[#686868] dark:text-[#898989] truncate">
                      · Rp{totalIDR.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                    </span>
                  )
                })()}
              </div>
              {liveBalance && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${liveBalance.can_trade === 1 ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.1)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {liveBalance.can_trade === 1 ? '✓ Bisa Trading' : '✗ Diblokir'}
                </span>
              )}
            </div>

            {balanceLoading && !liveBalance ? (
              <div className="p-4 flex gap-3 animate-pulse">
                <div className="w-32 h-16 rounded-[14px] bg-[#f0f1ee] dark:bg-[#252822]" />
                <div className="flex-1 space-y-2">
                  <div className="w-full h-7 rounded-[8px] bg-[#f0f1ee] dark:bg-[#252822]" />
                  <div className="w-3/4 h-7 rounded-[8px] bg-[#f0f1ee] dark:bg-[#252822]" />
                </div>
              </div>
            ) : liveBalance ? (() => {
              const usdtAsset = liveBalance.assets.find(a => a.asset === 'USDT')
              const idrAsset = liveBalance.assets.find(a => a.asset === 'IDR')
              const otherAssets = liveBalance.assets.filter(a => !STABLE_ASSETS.has(a.asset))
              const idrRate = usdtIdrTicker ? parseFloat(usdtIdrTicker.lastPrice ?? '0') : 0

              const fmtIdr = (usd: number) => idrRate > 0
                ? `Rp${(usd * idrRate).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
                : null

              let totalUSDT = parseFloat(usdtAsset?.free ?? '0')
              const portfolioRows = otherAssets.map(a => {
                const sym = `${a.asset}_USDT`
                const ticker = portfolioTickers?.[sym]
                const price = ticker ? parseFloat(ticker.lastPrice ?? '0') : null
                const free = parseFloat(a.free)
                const locked = parseFloat(a.locked)
                const usdVal = price != null ? free * price : null
                if (usdVal) totalUSDT += usdVal
                return { ...a, price, free, locked, usdVal, sym }
              }).filter(a => a.free > 0 || a.locked > 0)
                .sort((a, b) => (b.usdVal ?? 0) - (a.usdVal ?? 0))

              const usdtFree = parseFloat(usdtAsset?.free ?? '0')
              const idrFree = parseFloat(idrAsset?.free ?? '0')
              const hasPortfolio = portfolioRows.length > 0

              return (
                <div className="p-4">
                  {/* Balance cards — USDT + IDR only */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[rgba(159,232,112,0.08)] dark:bg-[rgba(159,232,112,0.06)] border border-[rgba(159,232,112,0.2)] rounded-[16px] px-4 py-3">
                      <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide mb-1">USDT</p>
                      <p className="text-2xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tabular-nums">
                        {usdtFree.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {fmtIdr(usdtFree) && (
                        <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5 tabular-nums">{fmtIdr(usdtFree)}</p>
                      )}
                      {usdtFree < 10 && (
                        <p className="text-[9px] text-[#d03238] dark:text-[#ff6b6f] mt-1">⚠️ Saldo rendah</p>
                      )}
                    </div>
                    <div className="bg-[#f8f9f6] dark:bg-[#252822] rounded-[16px] px-4 py-3">
                      <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide mb-1">IDR</p>
                      <p className="text-2xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tabular-nums">
                        {idrFree.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>

                  {/* Portfolio — collapsible */}
                  {hasPortfolio && (
                    <div className="mt-4">
                      <button onClick={() => setPortfolioOpen(!portfolioOpen)}
                        className="flex items-center justify-between w-full text-left mb-2 group">
                        <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wider">Portfolio ({portfolioRows.length})</p>
                        <span className="text-[#686868] dark:text-[#898989] group-hover:text-[#0e0f0c] dark:group-hover:text-[#e8ebe6] transition">
                          {portfolioOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </button>
                      {portfolioOpen && (
                        <div className="rounded-[14px] border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] overflow-x-auto max-h-[300px] overflow-y-auto">
                          <table className="w-full text-xs min-w-[320px]">
                            <thead className="sticky top-0 bg-white dark:bg-[#1e201c] z-10 shadow-[0_1px_0_rgba(14,15,12,0.06)] dark:shadow-[0_1px_0_rgba(232,235,230,0.06)]">
                              <tr className="border-b border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                                <th className="text-left px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Aset</th>
                                <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Jumlah</th>
                                <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide hidden sm:table-cell">Harga</th>
                                <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">USDT</th>
                                <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide hidden sm:table-cell">IDR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {portfolioRows.map((a, i) => (
                                <tr key={a.asset} className={`${i < portfolioRows.length - 1 ? 'border-b border-[rgba(14,15,12,0.04)] dark:border-[rgba(232,235,230,0.04)]' : ''} hover:bg-[rgba(14,15,12,0.02)] dark:hover:bg-[rgba(232,235,230,0.02)]`}>
                                  <td className="px-3 py-2 font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{a.asset}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-[#0e0f0c] dark:text-[#e8ebe6]">
                                    {a.free.toLocaleString(undefined, { maximumFractionDigits: a.free < 1 ? 6 : 2 })}
                                    {a.locked > 0 && <span className="text-[#686868] dark:text-[#898989] ml-1 text-[9px]">+{a.locked.toFixed(2)}🔒</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-[#686868] dark:text-[#898989] hidden sm:table-cell">
                                    {a.price != null ? `$${a.price.toLocaleString(undefined, { maximumFractionDigits: a.price < 1 ? 6 : 4 })}` : <span className="opacity-40">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                    {a.usdVal != null
                                      ? <span className={a.usdVal >= 1 ? 'text-[#0e0f0c] dark:text-[#e8ebe6]' : 'text-[#686868] dark:text-[#898989]'}>
                                          ${a.usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      : <span className="opacity-40">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-[#686868] dark:text-[#898989] hidden sm:table-cell">
                                    {a.usdVal != null && idrRate > 0
                                      ? `Rp${(a.usdVal * idrRate).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
                                      : <span className="opacity-40">—</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })() : null}
          </div>
        )}

        {/* Live sessions */}
        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" />
            <span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span>
          </div>
        ) : sessions && sessions.length > 0 ? (
          <PerformanceSummary sessions={sessions} />
        ) : (
          sessions && (
            <div className="mt-6">
              <EmptyState
                icon={<Bot size={28} />}
                title="Belum ada sesi trading"
                description="Pilih salah satu strategi di atas untuk mulai trading."
              />
            </div>
          )
        )}

        {/* Market ticker + gainers — bottom */}
        <div className="mt-6 space-y-4">
          <MarketTicker symbols={sessions ? [...new Set(sessions.map(s => s.symbol))] : undefined} />
          <MarketMovers />
        </div>
      </div>
    </div>
  )
}
