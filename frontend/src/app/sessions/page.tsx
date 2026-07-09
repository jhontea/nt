'use client'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Bot, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { MarketTicker } from '@/components/sessions/MarketTicker'
import { StrategyCards } from '@/components/sessions/StrategyCard'
import { PerformanceSummary } from '@/components/sessions/PerformanceSummary'
import { SectionLabel } from '@/components/sessions/SectionLabel'
import { EmptyState } from '@/components/sessions/EmptyState'
import { CreateSessionModal } from '@/components/sessions/CreateSessionModal'

const STABLE_ASSETS = new Set(['USDT', 'FDUSD', 'USDC', 'BUSD', 'IDR'])
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

  const { data: liveBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ['account-balance'],
    queryFn: () => api.account.balance(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  // Fetch tickers for portfolio assets (non-stablecoin, non-IDR)
  const portfolioAssets = liveBalance?.assets.filter(a => !STABLE_ASSETS.has(a.asset) && parseFloat(a.free) > 0) ?? []
  const portfolioSymbols = portfolioAssets.map(a => `${a.asset}_USDT`)

  const { data: portfolioTickers } = useQuery({
    queryKey: ['portfolio-tickers', portfolioSymbols.join(',')],
    queryFn: () => api.sessions.getTickersBulk(portfolioSymbols),
    enabled: isAuthenticated && portfolioSymbols.length > 0,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  // Fetch USDT_IDR rate for rupiah conversion
  const { data: usdtIdrTicker } = useQuery({
    queryKey: ['ticker-usdt-idr'],
    queryFn: () => api.sessions.getTicker('USDT_IDR'),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    staleTime: 30_000,
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

        {/* TokoCrypto balance panel */}
        {(liveBalance || balanceLoading) && (
          <div className="mt-4 mb-2 bg-white dark:bg-[#1e201c] rounded-[20px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-[#d03238] dark:text-[#ff6b6f]" />
                <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6] uppercase tracking-wider">Akun TokoCrypto</span>
              </div>
              {liveBalance && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${liveBalance.can_trade === 1 ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.1)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {liveBalance.can_trade === 1 ? '✓ Bisa Trading' : '✗ Trading Diblokir'}
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
              const fdusdAsset = liveBalance.assets.find(a => a.asset === 'FDUSD')
              const idrAsset = liveBalance.assets.find(a => a.asset === 'IDR')
              const otherAssets = liveBalance.assets.filter(a => !STABLE_ASSETS.has(a.asset))
              const idrRate = usdtIdrTicker ? parseFloat(usdtIdrTicker.lastPrice ?? '0') : 0

              const fmtIdr = (usd: number) => idrRate > 0
                ? `Rp${(usd * idrRate).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
                : null

              // Compute total portfolio value in USDT
              let totalUSDT = parseFloat(usdtAsset?.free ?? '0') + parseFloat(fdusdAsset?.free ?? '0')
              const portfolioRows = otherAssets.map(a => {
                const sym = `${a.asset}_USDT`
                const ticker = portfolioTickers?.[sym]
                const price = ticker ? parseFloat((ticker as any).lastPrice ?? '0') : null
                const free = parseFloat(a.free)
                const locked = parseFloat(a.locked)
                const usdVal = price != null ? free * price : null
                if (usdVal) totalUSDT += usdVal
                return { ...a, price, free, locked, usdVal, sym }
              }).filter(a => a.free > 0 || a.locked > 0)
                .sort((a, b) => (b.usdVal ?? 0) - (a.usdVal ?? 0))

              const usdtFree = parseFloat(usdtAsset?.free ?? '0')

              return (
                <div className="p-4 space-y-4">
                  {/* Top row: USDT card + FDUSD + IDR + total */}
                  <div className="flex gap-3 flex-wrap">
                    {/* USDT — primary card */}
                    <div className="bg-[rgba(159,232,112,0.08)] dark:bg-[rgba(159,232,112,0.06)] border border-[rgba(159,232,112,0.2)] rounded-[16px] px-4 py-3 min-w-[140px]">
                      <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide mb-1">USDT</p>
                      <p className="text-2xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tabular-nums">
                        {usdtFree.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {fmtIdr(usdtFree) && (
                        <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5 tabular-nums">{fmtIdr(usdtFree)}</p>
                      )}
                      {parseFloat(usdtAsset?.locked ?? '0') > 0 && (
                        <p className="text-[9px] text-[#686868] dark:text-[#898989] mt-0.5">+{parseFloat(usdtAsset!.locked).toFixed(2)} locked</p>
                      )}
                      {usdtFree < 10 && (
                        <p className="text-[9px] text-[#d03238] dark:text-[#ff6b6f] mt-1">⚠️ Saldo rendah</p>
                      )}
                    </div>
                    {/* FDUSD */}
                    {fdusdAsset && parseFloat(fdusdAsset.free) > 0 && (
                      <div className="bg-[#f8f9f6] dark:bg-[#252822] rounded-[16px] px-4 py-3 min-w-[110px]">
                        <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide mb-1">FDUSD</p>
                        <p className="text-2xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tabular-nums">{parseFloat(fdusdAsset.free).toFixed(2)}</p>
                        {fmtIdr(parseFloat(fdusdAsset.free)) && (
                          <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">{fmtIdr(parseFloat(fdusdAsset.free))}</p>
                        )}
                      </div>
                    )}
                    {/* IDR */}
                    {idrAsset && parseFloat(idrAsset.free) > 0 && (
                      <div className="bg-[#f8f9f6] dark:bg-[#252822] rounded-[16px] px-4 py-3 min-w-[110px]">
                        <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide mb-1">IDR</p>
                        <p className="text-2xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tabular-nums">{parseFloat(idrAsset.free).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</p>
                      </div>
                    )}
                    {/* Est. Total */}
                    {portfolioRows.some(r => r.usdVal != null) && (
                      <div className="bg-[#f8f9f6] dark:bg-[#252822] rounded-[16px] px-4 py-3 min-w-[140px] ml-auto">
                        <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide mb-1">Est. Total</p>
                        <p className="text-2xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tabular-nums">${totalUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {fmtIdr(totalUSDT) && (
                          <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5 tabular-nums">{fmtIdr(totalUSDT)}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Portfolio table — scrollable max 260px */}
                  {portfolioRows.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wider mb-2">Portfolio</p>
                      <div className="rounded-[14px] border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] overflow-hidden">
                        <div className="overflow-x-auto">
                          <div className="overflow-y-auto max-h-[260px]">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-white dark:bg-[#1e201c] z-10">
                                <tr className="border-b border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                                  <th className="text-left px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Aset</th>
                                  <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Jumlah</th>
                                  <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Harga</th>
                                  <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">USDT</th>
                                  <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">IDR</th>
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
                                    <td className="px-3 py-2 text-right tabular-nums text-[#686868] dark:text-[#898989]">
                                      {a.price != null ? `$${a.price.toLocaleString(undefined, { maximumFractionDigits: a.price < 1 ? 6 : 4 })}` : <span className="opacity-40">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                      {a.usdVal != null
                                        ? <span className={a.usdVal >= 1 ? 'text-[#0e0f0c] dark:text-[#e8ebe6]' : 'text-[#686868] dark:text-[#898989]'}>
                                            ${a.usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </span>
                                        : <span className="opacity-40">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-[#686868] dark:text-[#898989]">
                                      {a.usdVal != null && idrRate > 0
                                        ? `Rp${(a.usdVal * idrRate).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
                                        : <span className="opacity-40">—</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })() : null}
          </div>
        )}

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
