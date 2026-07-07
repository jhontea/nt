'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useSessionWS } from '@/lib/useWS'
import { useEffect, useState } from 'react'
import { HelpIcon } from '@/components/HelpIcon'
import { PriceBadge } from '@/components/PriceBadge'
import { Navbar } from '@/components/Navbar'

const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })

const modeInfo: Record<string, string> = {
  signal: 'Bot hanya mencatat sinyal. Tidak ada eksekusi order.',
  paper: 'Trading simulasi dengan uang virtual $1000.',
  live: 'Trading sungguhan via API TokoCrypto.',
}

const pnlHelp: Record<string, string> = {
  balance: 'Saldo saat ini. Untuk paper trading dimulai dari $1000.',
  realized: 'Keuntungan/kerugian dari posisi yang sudah ditutup (real).',
  winRate: 'Persentase trade yang profit dari total trade.',
}

export default function SessionDetailPage() {
  const { id } = useParams()
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')

  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  // Auto-refresh on page focus
  useEffect(() => {
    const onFocus = () => {
      qc.invalidateQueries({ queryKey: ['session', id] })
      qc.invalidateQueries({ queryKey: ['pnl', id] })
      qc.invalidateQueries({ queryKey: ['orders', id] })
      qc.invalidateQueries({ queryKey: ['signals', id] })
      qc.invalidateQueries({ queryKey: ['signalSummary', id] })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [id, qc])

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.sessions.get(Number(id)),
    enabled: isAuthenticated,
  })

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ['pnl', id],
    queryFn: () => api.sessions.getPnL(Number(id)),
    enabled: isAuthenticated,
  })

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.sessions.getOrders(Number(id)),
    enabled: isAuthenticated,
    refetchInterval: 10000,
  })

  // Grid Signal specific queries
  const isGridSignal = session?.strategy === 'grid' && session?.mode === 'signal'
  const isGridPaper = session?.strategy === 'grid' && session?.mode === 'paper'

  const { data: strategySignals } = useQuery({
    queryKey: ['signals', id],
    queryFn: () => api.sessions.getSignals(Number(id)),
    enabled: isAuthenticated && isGridSignal,
    refetchInterval: 15000,
  })

  const { data: signalSummary } = useQuery({
    queryKey: ['signalSummary', id],
    queryFn: () => api.sessions.getSignalSummary(Number(id)),
    enabled: isAuthenticated && isGridSignal,
    refetchInterval: 15000,
  })

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', id],
    queryFn: () => api.sessions.getPortfolio(Number(id)),
    enabled: isAuthenticated && isGridPaper,
    refetchInterval: 15000,
  })

  useSessionWS(Number(id), (data) => {
    if (data.type === 'signal') {
      qc.invalidateQueries({ queryKey: ['pnl', id] })
      qc.invalidateQueries({ queryKey: ['orders', id] })
      qc.invalidateQueries({ queryKey: ['signals', id] })
      qc.invalidateQueries({ queryKey: ['signalSummary', id] })
    }
    if (data.type === 'paper_alert') {
      qc.invalidateQueries({ queryKey: ['portfolio', id] })
      qc.invalidateQueries({ queryKey: ['pnl', id] })
    }
  })

  async function handleStart() {
    setError('')
    setLoading('start')
    try {
      await api.sessions.start(Number(id))
      qc.invalidateQueries({ queryKey: ['session', id] })
    } catch (e: any) {
      setError(e.message || 'Failed to start')
    }
    setLoading('')
  }

  async function handleStop() {
    setError('')
    setLoading('stop')
    try {
      await api.sessions.stop(Number(id))
      qc.invalidateQueries({ queryKey: ['session', id] })
    } catch (e: any) {
      setError(e.message || 'Failed to stop')
    }
    setLoading('')
  }

  if (sessionLoading) return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-[#686868] dark:text-[#898989] animate-pulse">
          <span className="w-2 h-2 rounded-full bg-[#9fe870]" />
          <span className="text-sm">Memuat session...</span>
        </div>
      </div>
    </div>
  )
  if (!session) return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-sm text-[#686868] dark:text-[#898989]">Session not found</p>
      </div>
    </div>
  )

  let configDisplay: any = {}
  try { configDisplay = JSON.parse(session.config) } catch {}

  const strategyLabel = session.strategy === 'grid' ? 'Grid' : session.strategy === 'trend' ? 'Trend' : 'DCA'

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Back navigation */}
        <button
          onClick={() => router.push('/sessions')}
          className="flex items-center gap-1.5 text-sm text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:underline mb-6 transition-colors w-fit"
        >
          ← Kembali
        </button>

        {/* Hero Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-3xl font-black tracking-tight text-[#0e0f0c] dark:text-[#e8ebe6]">{session.name}</h1>
                {session.mode === 'signal' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(56,200,255,0.1)] dark:bg-[rgba(56,200,255,0.15)] text-[#0994b3] dark:text-[#5dd8f5]">Signal</span>
                )}
                {session.mode === 'paper' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(159,232,112,0.15)] dark:bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870]">Paper</span>
                )}
                {session.mode === 'live' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(255,209,26,0.15)] dark:bg-[rgba(255,209,26,0.2)] text-[#7a5f00] dark:text-[#f5c842]">Live</span>
                )}
                {session.status === 'running' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(5,77,40,0.06)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse inline-block"></span>
                    Running
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#1e201c] text-[#5a5b58] dark:text-[#8a8d88]">Stopped</span>
                )}
              </div>
              <p className="text-sm text-[#686868] dark:text-[#898989]">{session.symbol} · {strategyLabel} · {modeInfo[session.mode]}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <PriceBadge symbol={session.symbol} compact />
              {error && <span className="text-[#d03238] text-sm">{error}</span>}
              {session.status === 'running' ? (
                <button
                  onClick={handleStop}
                  disabled={loading === 'stop'}
                  className="bg-[#d03238] text-white border-2 border-[#d03238] hover:bg-[#d94a4f] dark:hover:bg-[#b22a30] rounded-full px-4 py-2 font-semibold transition-all disabled:opacity-50"
                >
                  {loading === 'stop' ? '...' : 'Stop'}
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={loading === 'start'}
                  className="bg-[#9fe870] text-[#163300] border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full px-5 py-2 font-semibold transition-all disabled:opacity-50 shadow-[0_2px_8px_rgba(159,232,112,0.4)]"
                >
                  {loading === 'start' ? '...' : 'Start'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active Signals — empty state */}
        {isGridSignal && strategySignals && !strategySignals.some(s => s.validation_status === 'pending') && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Sinyal Aktif</h2>
              <span className="text-xs font-bold bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] rounded-full px-2 py-0.5">0</span>
            </div>
            <p className="text-sm text-[#686868] dark:text-[#898989]">Belum ada sinyal aktif. Bot akan memunculkan sinyal saat kondisi pasar sesuai.</p>
          </div>
        )}

        {/* Active Signals */}
        {isGridSignal && strategySignals && strategySignals.some(s => s.validation_status === 'pending') && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Sinyal Aktif</h2>
              <span className="text-xs font-bold bg-[#9fe870] text-[#163300] rounded-full px-2 py-0.5">
                {strategySignals.filter(s => s.validation_status === 'pending').length}
              </span>
            </div>
            <div className="space-y-3">
              {strategySignals.filter(s => s.validation_status === 'pending').map(s => {
                const price = parseFloat(s.grid_level_price)
                const t = s.validation_target_value
                const inv = s.validation_invalid_value
                const isBuy = s.signal_type === 'buy'
                const isPercent = s.validation_mode === 'percent'
                const confirmPrice = isPercent ? (isBuy ? price * (1 + t / 100) : price * (1 - t / 100)) : null
                const invalidPrice = isPercent ? (isBuy ? price * (1 - inv / 100) : price * (1 + inv / 100)) : null
                const border = isBuy 
                  ? 'border-[rgba(5,77,40,0.6)] dark:border-[rgba(159,232,112,0.5)]' 
                  : 'border-[rgba(208,50,56,0.6)] dark:border-[rgba(208,50,56,0.5)]'
                const badge = isBuy
                  ? 'bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]'
                  : 'bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]'
                return (
                  <div key={s.id} className={`bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border-2 ${border} shadow-[0_4px_16px_rgba(14,15,12,0.08)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${badge}`}>{isBuy ? '▲ Beli' : '▼ Jual'}</span>
                        <span className="text-xs text-[#686868] dark:text-[#898989]">Level #{s.grid_level_index} · {fmt(price)}</span>
                      </div>
                      <span className="text-xs font-semibold bg-[rgba(255,209,26,0.15)] dark:bg-[rgba(255,209,26,0.2)] text-[#7a5f00] dark:text-[#f5c842] px-2 py-0.5 rounded-full animate-pulse">⏳ menunggu</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-[rgba(5,77,40,0.06)] dark:bg-[rgba(159,232,112,0.08)] rounded-[12px] p-3">
                        <p className="text-[#686868] dark:text-[#898989] mb-1 font-medium">✓ Target Confirmed</p>
                        <p className="font-bold text-[#054d28] dark:text-[#9fe870]">{confirmPrice ? fmt(confirmPrice) : `+${t} step`}</p>
                        <p className="text-[#686868] dark:text-[#898989] mt-0.5">{isPercent ? `${isBuy ? '+' : '-'}${t}%` : `${t} level`}</p>
                      </div>
                      <div className="bg-[rgba(208,50,56,0.06)] dark:bg-[rgba(208,50,56,0.1)] rounded-[12px] p-3">
                        <p className="text-[#686868] dark:text-[#898989] mb-1 font-medium">✗ Batas Invalid</p>
                         <p className="font-bold text-[#d03238] dark:text-[#ff6b6f]">{invalidPrice ? fmt(invalidPrice) : `-${inv} step`}</p>
                        <p className="text-[#686868] dark:text-[#898989] mt-0.5">{isPercent ? `${isBuy ? '-' : '+'}${inv}%` : `${inv} level`}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-2">Window: {s.validation_window_minutes} menit · Sejak {new Date(s.created_at).toLocaleTimeString('id-ID')}</p>

                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* P&L Cards */}
        {pnl ? (
          <div className="mb-6 border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] pt-8">
            <div className="mb-3">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Performa</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <div className="col-span-2 md:col-span-1 bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Total P&L</p>
                <p className={`text-2xl font-black mt-1 ${parseFloat(pnl.total_pnl) >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238]'}`}>
                  {parseFloat(pnl.total_pnl) >= 0 ? '+' : ''}${pnl.total_pnl}
                </p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider flex items-center gap-1">Balance <HelpIcon text={pnlHelp.balance} /></p>
                <p className="text-xl font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">${pnl.balance?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider flex items-center gap-1">Realized P&L <HelpIcon text={pnlHelp.realized} /></p>
                <p className={`text-xl font-bold mt-1 ${parseFloat(pnl.realized_pnl) >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238]'}`}>
                  {parseFloat(pnl.realized_pnl) >= 0 ? '+' : ''}${pnl.realized_pnl}
                </p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider flex items-center gap-1">Win Rate <HelpIcon text={pnlHelp.winRate} /></p>
                <p className="text-xl font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{pnl.win_rate?.toFixed(1) || '0'}%</p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Trades</p>
                <p className="text-xl font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{pnl.trade_count || 0}</p>
              </div>
            </div>
          </div>
        ) : pnlLoading ? (
          <div className="flex items-center gap-2 text-[#686868] dark:text-[#898989] animate-pulse mb-6">
            <span className="w-2 h-2 rounded-full bg-[#9fe870]" />
            <span className="text-sm">Memuat data P&L...</span>
          </div>
        ) : null}

        {/* Strategy Description */}
        <div className="border-l-4 border-[#9fe870] bg-[rgba(159,232,112,0.06)] dark:bg-[rgba(159,232,112,0.1)] rounded-r-[16px] px-4 py-3 mb-4 text-xs text-[#454745] dark:text-[#8a8d88]">
          {session.strategy === 'grid' ? (
            <p>
              <span className="text-[#163300] dark:text-[#9fe870] font-semibold">Grid Trading</span>: Bot akan memasang order beli dan jual di {configDisplay.grid_count || '?'} level harga antara {configDisplay.lower_price || '?'} dan {configDisplay.upper_price || '?'}.
              Setiap order {configDisplay.quantity || '?'} {session.symbol.split('_')[0]}. Bot mengevaluasi setiap 30 detik.
            </p>
          ) : session.strategy === 'trend' ? (
            <p>
              <span className="text-[#454745] dark:text-[#d0d3ce] font-semibold">Trend Following (SMA)</span>: Bot menghitung SMA {configDisplay.fast_period || '?'} (cepat) dan SMA {configDisplay.slow_period || '?'} (lambat).
              Golden cross = sinyal <span className="text-[#054d28] dark:text-[#9fe870] font-medium">beli</span>. Death cross = sinyal <span className="text-[#d03238] dark:text-[#ff6b6f] font-medium">jual</span>.
            </p>
          ) : (
            <p>
              <span className="text-[#0994b3] dark:text-[#5dd8f5] font-semibold">DCA</span>: Bot membeli <strong>${configDisplay.amount || '?'}</strong> setiap{' '}
              {configDisplay.interval_sec === 3600 ? '1 jam' : configDisplay.interval_sec === 7200 ? '2 jam' : configDisplay.interval_sec === 21600 ? '6 jam' : configDisplay.interval_sec === 43200 ? '12 jam' : configDisplay.interval_sec === 86400 ? '1 hari' : configDisplay.interval_sec === 604800 ? '1 minggu' : `${configDisplay.interval_sec || '?'} detik`}.
              {configDisplay.take_profit_pct > 0 ? ` Take profit ${configDisplay.take_profit_pct}%.` : ' Akumulasi terus.'}
            </p>
          )}
        </div>

        {/* Detail Konfigurasi — collapsible */}
        <details className="mb-4">
          <summary className="text-xs font-semibold text-[#686868] dark:text-[#898989] cursor-pointer hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] transition-colors flex items-center gap-1.5 select-none">
            › Detail Konfigurasi
          </summary>
          <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] mt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div>
                <span className="text-[#686868] dark:text-[#898989] text-xs font-semibold uppercase tracking-wider">Pair</span>
                <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{session.symbol}</p>
              </div>
              <div>
                <span className="text-[#686868] dark:text-[#898989] text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                  Strategi <HelpIcon text={session.strategy === 'grid' ? 'Grid Trading: pasang order di level harga tetap' : session.strategy === 'trend' ? 'Trend Following: deteksi tren pakai SMA' : 'DCA: beli rutin dengan jumlah tetap'} />
                </span>
                <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{strategyLabel}</p>
              </div>
              <div>
                <span className="text-[#686868] dark:text-[#898989] text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                  Mode <HelpIcon text={modeInfo[session.mode] || ''} />
                </span>
                <p className={`font-semibold mt-1 ${session.mode === 'live' ? 'text-[#7a5f00] dark:text-[#f5c842]' : 'text-[#0e0f0c] dark:text-[#e8ebe6]'}`}>
                  {session.mode === 'signal' ? 'Signal' : session.mode === 'paper' ? 'Paper' : 'Live'}
                </p>
              </div>
              <div>
                <span className="text-[#686868] dark:text-[#898989] text-xs font-semibold uppercase tracking-wider">Status</span>
                <p className={`font-semibold mt-1 ${session.status === 'running' ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#5a5b58] dark:text-[#8a8d88]'}`}>{session.status}</p>
              </div>
            </div>
            <pre className="bg-[#f0f1ee] dark:bg-[#252822] p-3 rounded-[16px] text-xs text-[#454745] dark:text-[#8a8d88] overflow-x-auto">{JSON.stringify(configDisplay, null, 2)}</pre>
          </div>
        </details>

        {/* Grid Paper Portfolio */}
        {isGridPaper && portfolio && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Virtual Portfolio</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Saldo Virtual</p>
                <p className="text-xl font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">${fmt(portfolio.virtual_balance)}</p>
                {portfolio.initial_balance != null && (
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">dari ${fmt(portfolio.initial_balance)}</p>
                )}
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Posisi Terbuka</p>
                <p className="text-xl font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{portfolio.holdings.length}</p>
              </div>
              {portfolio.holdings.length > 0 && (
                <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] col-span-2 md:col-span-1">
                  <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-2">Holdings</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {portfolio.holdings.map((h, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-[#054d28] dark:text-[#9fe870] font-semibold">{h.qty}</span>
                        <span className="text-[#686868] dark:text-[#898989]">@ {h.avg_price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Grid Signal Summary */}
        {isGridSignal && signalSummary && signalSummary.total_count > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Ringkasan Sinyal</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Total Sinyal</p>
                <p className="text-lg font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{signalSummary.total_count}</p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Success Rate</p>
                  <p className={`text-lg font-bold mt-1 ${signalSummary.success_rate >= 50 ? 'text-[#054d28] dark:text-[#9fe870]' : signalSummary.success_rate > 0 ? 'text-[#7a5f00] dark:text-[#f5c842]' : 'text-[#686868] dark:text-[#898989]'}`}>
                  {signalSummary.success_rate.toFixed(1)}%
                </p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Confirmed / Invalid / Expired</p>
                <p className="text-lg font-bold mt-1">
                  <span className="text-[#054d28] dark:text-[#9fe870]">{signalSummary.confirmed_count}</span>
                  <span className="text-[#686868] dark:text-[#898989] mx-1">/</span>
                  <span className="text-[#d03238] dark:text-[#ff6b6f]">{signalSummary.invalidated_count}</span>
                  <span className="text-[#686868] dark:text-[#898989] mx-1">/</span>
                  <span className="text-[#686868] dark:text-[#898989]">{signalSummary.expired_count}</span>
                </p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Buy / Sell</p>
                <p className="text-lg font-bold mt-1">
                  <span className="text-[#054d28] dark:text-[#9fe870]">{signalSummary.buy_count}</span>
                  <span className="text-[#686868] dark:text-[#898989] mx-1">/</span>
                  <span className="text-[#d03238] dark:text-[#ff6b6f]">{signalSummary.sell_count}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Grid Signal History */}
        {isGridSignal && strategySignals && strategySignals.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Histori Sinyal Grid</h2>
            <div className="bg-white dark:bg-[#1e201c] rounded-[24px] overflow-hidden border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[#686868] dark:text-[#898989] text-xs font-semibold uppercase tracking-wider bg-[#fafafa] dark:bg-[#252822]">
                    <tr>
                      <th className="px-4 py-3 text-left">Waktu</th>
                      <th className="px-4 py-3 text-left">Sisi</th>
                      <th className="px-4 py-3 text-left">Level</th>
                      <th className="px-4 py-3 text-left">Harga</th>
                      <th className="px-4 py-3 text-left">Qty</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Hasil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(14,15,12,0.08)] dark:divide-[rgba(232,235,230,0.08)]">
                    {strategySignals.slice(0, 30).map(s => (
                      <tr key={s.id} className="hover:bg-[#fafafa] dark:hover:bg-[#141411] transition-colors">
                        <td className="px-4 py-3 text-[#686868] dark:text-[#898989] text-xs">{new Date(s.created_at).toLocaleString('id-ID')}</td>
                        <td className={`px-4 py-3 font-semibold text-xs ${s.signal_type === 'buy' ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>{s.signal_type}</td>
                        <td className="px-4 py-3 text-[#686868] dark:text-[#898989] text-xs">#{s.grid_level_index}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[#0e0f0c] dark:text-[#e8ebe6]">{fmt(parseFloat(s.grid_level_price))}</td>
                        <td className="px-4 py-3 text-xs text-[#454745] dark:text-[#8a8d88]">{s.quantity}</td>
                        <td className={`px-4 py-3 text-xs font-semibold ${
                          s.validation_status === 'confirmed' ? 'text-[#054d28] dark:text-[#9fe870]' :
                          s.validation_status === 'invalidated' ? 'text-[#d03238] dark:text-[#ff6b6f]' :
                          s.validation_status === 'expired' ? 'text-[#5a5b58] dark:text-[#8a8d88]' : 'text-[#7a5f00] dark:text-[#f5c842]'
                        }`}>{s.validation_status}</td>
                        <td className="px-4 py-3 text-xs">
                          {s.validation_status === 'confirmed' && s.result_pct != null && (
                            <span className={`font-semibold ${s.result_pct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                              {s.result_pct >= 0 ? '+' : ''}{s.result_pct.toFixed(2)}%
                            </span>
                          )}
                          {s.validation_status === 'pending' && <span className="text-[#7a5f00] dark:text-[#f5c842]">menunggu</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Orders Table — hidden when grid signal history is shown */}
        {!isGridSignal && (
          <>
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Riwayat Signal & Order</h2>
            {ordersLoading ? (
              <div className="flex items-center gap-2 text-[#686868] dark:text-[#898989] animate-pulse py-4">
                <span className="w-2 h-2 rounded-full bg-[#9fe870]" />
                <span className="text-sm">Memuat orders...</span>
              </div>
            ) : !orders?.length ? (
              <p className="text-[#686868] dark:text-[#898989] mb-6 text-sm">Belum ada order. Mulai session untuk melihat sinyal.</p>
            ) : (
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] overflow-hidden border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[#686868] dark:text-[#898989] text-xs font-semibold uppercase tracking-wider bg-[#fafafa] dark:bg-[#252822]">
                      <tr>
                        <th className="px-4 py-3 text-left">Waktu</th>
                        <th className="px-4 py-3 text-left">Sisi</th>
                        <th className="px-4 py-3 text-left">Harga</th>
                        <th className="px-4 py-3 text-left">Jumlah</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Tipe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(14,15,12,0.08)] dark:divide-[rgba(232,235,230,0.08)]">
                      {orders.slice(0, 20).map(o => (
                        <tr key={o.id} className="hover:bg-[#fafafa] dark:hover:bg-[#141411] transition-colors">
                          <td className="px-4 py-3 text-[#686868] dark:text-[#898989] text-xs">{new Date(o.created_at).toLocaleTimeString('id-ID')}</td>
                          <td className={`px-4 py-3 font-semibold text-xs ${o.side === 'buy' ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>{o.side}</td>
                          <td className="px-4 py-3 text-xs text-[#0e0f0c] dark:text-[#e8ebe6]">{o.price}</td>
                          <td className="px-4 py-3 text-xs text-[#0e0f0c] dark:text-[#e8ebe6]">{o.quantity}</td>
                          <td className="px-4 py-3 text-xs text-[#454745] dark:text-[#8a8d88]">{o.status}</td>
                          <td className="px-4 py-3 text-xs text-[#686868] dark:text-[#898989]">{o.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
