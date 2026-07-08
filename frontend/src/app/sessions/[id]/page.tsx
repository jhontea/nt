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
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, PieChart, Pie } from 'recharts'

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

const HOLDING_COLORS = ['#9fe870', '#38c8ff', '#ffd11a', '#c084fc', '#f97316']

export default function SessionDetailPage() {
  const params = useParams()
  const id = params.id // keep for queryKey strings
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [signalView, setSignalView] = useState<'timeline' | 'table'>('timeline')

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
  const isTrendSignal = session?.strategy === 'trend' && session?.mode === 'signal'
  const isStrategySignal = isGridSignal || isTrendSignal
  const isGridPaper = session?.strategy === 'grid' && session?.mode === 'paper'

  const { data: strategySignals } = useQuery({
    queryKey: ['signals', id],
    queryFn: () => api.sessions.getSignals(Number(id)),
    enabled: isAuthenticated && isStrategySignal,
    refetchInterval: 15000,
  })

  const { data: signalSummary } = useQuery({
    queryKey: ['signalSummary', id],
    queryFn: () => api.sessions.getSignalSummary(Number(id)),
    enabled: isAuthenticated && isStrategySignal,
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm text-[#686868] dark:text-[#898989]">Session not found</p>
      </div>
    </div>
  )

  let configDisplay: any = {}
  try { configDisplay = JSON.parse(session.config) } catch {}

  const strategyLabel = session.strategy === 'grid' ? 'Grid' : session.strategy === 'trend' ? 'Trend' : 'DCA'

  const pnlChartData = (isStrategySignal && strategySignals)
    ? strategySignals
        .filter(s => s.validation_status === 'confirmed' && s.result_pct != null)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .reduce((acc, s, i) => {
          const prev = acc[i - 1]?.cumulative ?? 0
          const cumulative = parseFloat((prev + (s.result_pct ?? 0)).toFixed(2))
          acc.push({
            label: `S${i + 1}`,
            result: parseFloat((s.result_pct ?? 0).toFixed(2)),
            cumulative,
            time: new Date(s.created_at).toLocaleDateString('id-ID'),
          })
          return acc
        }, [] as { label: string; result: number; cumulative: number; time: string }[])
    : []

  const signalsByLevel = strategySignals
    ? strategySignals.reduce((acc, s) => {
        if (!acc[s.grid_level_index] || s.id > acc[s.grid_level_index].id) {
          acc[s.grid_level_index] = s
        }
        return acc
      }, {} as Record<number, import('@/types').StrategySignal>)
    : {}

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Back navigation */}
        <button
          onClick={() => router.push('/sessions')}
          className="flex items-center gap-1.5 text-sm text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:underline mb-6 transition-colors w-fit"
        >
          ← Kembali
        </button>

        {/* Hero Header */}
        <div className={`mb-8 rounded-[28px] p-6 border ${
          session.strategy === 'grid'
            ? 'bg-gradient-to-br from-[rgba(159,232,112,0.08)] to-transparent border-[rgba(159,232,112,0.2)] dark:from-[rgba(159,232,112,0.1)] dark:border-[rgba(159,232,112,0.15)]'
            : session.strategy === 'trend'
            ? 'bg-gradient-to-br from-[rgba(56,200,255,0.08)] to-transparent border-[rgba(56,200,255,0.2)] dark:from-[rgba(56,200,255,0.1)] dark:border-[rgba(56,200,255,0.15)]'
            : 'bg-gradient-to-br from-[rgba(255,209,26,0.08)] to-transparent border-[rgba(255,209,26,0.2)] dark:from-[rgba(255,209,26,0.1)] dark:border-[rgba(255,209,26,0.15)]'
        }`}>
          <div className="flex items-start gap-4">
            {/* Strategy icon */}
            <div className={`w-14 h-14 rounded-[18px] flex items-center justify-center text-3xl flex-shrink-0 ${
              session.strategy === 'grid'
                ? 'bg-[rgba(159,232,112,0.15)]'
                : session.strategy === 'trend'
                ? 'bg-[rgba(56,200,255,0.12)]'
                : 'bg-[rgba(255,209,26,0.12)]'
            }`}>
              {session.strategy === 'grid' ? '📐' : session.strategy === 'trend' ? '📈' : '🪙'}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0e0f0c] dark:text-[#e8ebe6] truncate mb-2">{session.name}</h1>

              {/* Chips row */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {/* Mode */}
                {session.mode === 'signal' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(56,200,255,0.1)] dark:bg-[rgba(56,200,255,0.15)] text-[#0994b3] dark:text-[#5dd8f5]">📊 Signal</span>}
                {session.mode === 'paper' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(159,232,112,0.15)] dark:bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870]">📝 Paper</span>}
                {session.mode === 'live' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(255,209,26,0.15)] dark:bg-[rgba(255,209,26,0.2)] text-[#7a5f00] dark:text-[#f5c842]">⚡ Live</span>}
                {/* Status */}
                {session.status === 'running' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(159,232,112,0.12)] dark:bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse inline-block" />
                    Running
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#5a5b58] dark:text-[#8a8d88]">Stopped</span>
                )}
                {/* Symbol + price */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] text-[#0e0f0c] dark:text-[#e8ebe6]">
                  {session.symbol.replace('_', '/')}
                </span>
                <PriceBadge symbol={session.symbol} compact />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {error && <span className="text-[#d03238] dark:text-[#ff6b6f] text-sm truncate">{error}</span>}
                {session.status === 'running' ? (
                  <button
                    onClick={handleStop}
                    disabled={loading === 'stop'}
                    className="px-5 py-2 text-sm font-bold bg-[rgba(208,50,56,0.08)] text-[#d03238] border border-[rgba(208,50,56,0.2)] hover:bg-[#d03238] hover:text-white hover:border-[#d03238] rounded-full transition-all disabled:opacity-50"
                  >
                    {loading === 'stop' ? '...' : 'Stop'}
                  </button>
                ) : (
                  <button
                    onClick={handleStart}
                    disabled={loading === 'start'}
                    className="px-6 py-2 text-sm font-bold bg-[#9fe870] text-[#163300] border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all disabled:opacity-50 shadow-[0_2px_8px_rgba(159,232,112,0.4)]"
                  >
                    {loading === 'start' ? '...' : 'Start Bot'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Signals — empty state */}
        {isStrategySignal && strategySignals && !strategySignals.some(s => s.validation_status === 'pending') && (
          <div className="mb-6">
            <p className="text-sm text-[#686868] dark:text-[#898989]">Belum ada sinyal aktif. Bot akan memunculkan sinyal saat kondisi pasar sesuai.</p>
          </div>
        )}

        {/* Active Signals */}
        {isStrategySignal && strategySignals && strategySignals.some(s => s.validation_status === 'pending') && (
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
                const borderColor = isBuy
                  ? 'border-[rgba(5,77,40,0.6)] dark:border-[rgba(159,232,112,0.5)]'
                  : 'border-[rgba(208,50,56,0.6)] dark:border-[rgba(208,50,56,0.5)]'
                const badge = isBuy
                  ? 'bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]'
                  : 'bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]'
                return (
                  <div key={s.id} className={`bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border-2 ${borderColor} shadow-[0_4px_16px_rgba(14,15,12,0.08)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]`}>

                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-black px-3 py-1 rounded-full uppercase ${badge}`}>
                          {isBuy ? '▲ Beli' : '▼ Jual'}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmt(price)}</p>
                          <p className="text-xs text-[#686868] dark:text-[#898989]">Level #{s.grid_level_index}</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold bg-[rgba(255,209,26,0.15)] dark:bg-[rgba(255,209,26,0.2)] text-[#7a5f00] dark:text-[#f5c842] px-2.5 py-1 rounded-full animate-pulse">⏳ menunggu</span>
                    </div>

                    {/* Progress bar: invalid — entry — target */}
                    {isPercent && confirmPrice && invalidPrice && (
                      <div className="mb-4">
                        <div className="relative h-2 bg-[#f0f1ee] dark:bg-[#252822] rounded-full overflow-hidden">
                          {isBuy ? (
                            <>
                              <div className="absolute left-0 top-0 h-full w-1/2 bg-gradient-to-r from-[rgba(208,50,56,0.3)] to-transparent rounded-full" />
                              <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-[rgba(159,232,112,0.4)] to-transparent rounded-full" />
                            </>
                          ) : (
                            <>
                              <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-[rgba(208,50,56,0.3)] to-transparent rounded-full" />
                              <div className="absolute left-0 top-0 h-full w-1/2 bg-gradient-to-r from-[rgba(159,232,112,0.4)] to-transparent rounded-full" />
                            </>
                          )}
                          {/* Entry dot */}
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#ffd11a] border-2 border-white dark:border-[#1e201c]" />
                        </div>
                        <div className="flex justify-between text-[10px] text-[#686868] dark:text-[#898989] mt-1.5">
                          <span className="text-[#d03238] dark:text-[#ff6b6f]">✗ {fmt(invalidPrice)}</span>
                          <span className="text-[#686868] dark:text-[#898989]">Entry</span>
                          <span className="text-[#054d28] dark:text-[#9fe870]">✓ {fmt(confirmPrice)}</span>
                        </div>
                      </div>
                    )}

                    {/* Target / Invalid boxes */}
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
            
            {/* Total P&L Hero Card */}
            <div className={`rounded-[24px] p-6 mb-3 border-2 ${
              parseFloat(pnl.total_pnl) >= 0
                ? 'bg-gradient-to-br from-[rgba(5,77,40,0.08)] to-transparent border-[rgba(5,77,40,0.3)] dark:from-[rgba(159,232,112,0.1)] dark:border-[rgba(159,232,112,0.2)]'
                : 'bg-gradient-to-br from-[rgba(208,50,56,0.08)] to-transparent border-[rgba(208,50,56,0.3)] dark:from-[rgba(208,50,56,0.1)] dark:border-[rgba(208,50,56,0.2)]'
            }`}>
              <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-2">Total P&L</p>
              <div className="flex items-baseline gap-3">
                <p className={`text-4xl font-black ${parseFloat(pnl.total_pnl) >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {parseFloat(pnl.total_pnl) >= 0 ? '+' : ''}${pnl.total_pnl}
                </p>
                {pnl.balance && (
                  <p className="text-sm text-[#686868] dark:text-[#898989]">
                    {parseFloat(pnl.total_pnl) >= 0 ? '+' : ''}{((parseFloat(pnl.total_pnl) / Number(pnl.balance)) * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider flex items-center gap-1">Balance <HelpIcon text={pnlHelp.balance} /></p>
                <p className="text-lg font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">${pnl.balance?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider flex items-center gap-1">Realized <HelpIcon text={pnlHelp.realized} /></p>
                <p className={`text-lg font-bold mt-1 ${parseFloat(pnl.realized_pnl) >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {parseFloat(pnl.realized_pnl) >= 0 ? '+' : ''}${pnl.realized_pnl}
                </p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider flex items-center gap-1">Win Rate <HelpIcon text={pnlHelp.winRate} /></p>
                <p className="text-lg font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{pnl.win_rate?.toFixed(1) || '0'}%</p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Trades</p>
                <p className="text-lg font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{pnl.trade_count || 0}</p>
              </div>
            </div>
          </div>
        ) : pnlLoading ? (
          <div className="flex items-center gap-2 text-[#686868] dark:text-[#898989] animate-pulse mb-6">
            <span className="w-2 h-2 rounded-full bg-[#9fe870]" />
            <span className="text-sm">Memuat data P&L...</span>
          </div>
        ) : null}

        {isStrategySignal && pnlChartData.length >= 2 && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Performa Sinyal</h2>
            <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div>
                  <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Confirmed</p>
                  <p className="text-xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{pnlChartData.length}</p>
                </div>
                <div>
                  <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Avg Result</p>
                  <p className={`text-xl font-black mt-0.5 ${(pnlChartData.reduce((s, d) => s + d.result, 0) / pnlChartData.length) >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                    {((pnlChartData.reduce((s, d) => s + d.result, 0) / pnlChartData.length) >= 0 ? '+' : '')}{(pnlChartData.reduce((s, d) => s + d.result, 0) / pnlChartData.length).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Kumulatif</p>
                  <p className={`text-xl font-black mt-0.5 ${pnlChartData[pnlChartData.length - 1].cumulative >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                    {pnlChartData[pnlChartData.length - 1].cumulative >= 0 ? '+' : ''}{pnlChartData[pnlChartData.length - 1].cumulative}%
                  </p>
                </div>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-4 text-xs text-[#686868] dark:text-[#898989]">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#9fe870] inline-block rounded-full" />Kumulatif</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[rgba(159,232,112,0.3)] inline-block rounded-sm" />Per Sinyal</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={pnlChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,100,0.15)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(104,104,104,1)' }} tickLine={false} axisLine={false} stroke="none" />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(104,104,104,1)' }} tickLine={false} axisLine={false} stroke="none" tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid rgba(14,15,12,0.08)', borderRadius: 12, fontSize: 11 }}
                    formatter={(value: number, name: string) => [`${value > 0 ? '+' : ''}${value}%`, (name as string) === 'cumulative' ? 'Kumulatif' : 'Sinyal'] as [string, string]}
                    labelFormatter={(label: string, payload: Array<{ payload?: { time?: string } }>) => payload?.[0]?.payload?.time ?? label}
                  />
                  <Bar dataKey="result" fill="rgba(159,232,112,0.3)" radius={[4, 4, 0, 0]}>
                    {pnlChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.result >= 0 ? 'rgba(159,232,112,0.4)' : 'rgba(208,50,56,0.3)'} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="cumulative" stroke="#9fe870" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#9fe870' }} />
                  <ReferenceLine y={0} stroke="rgba(128,128,128,0.3)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Strategy Config Card */}
        <div className="bg-white dark:bg-[#1e201c] rounded-[24px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] p-5 mb-4">
          <p className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wider mb-3">
            {session.strategy === 'grid' ? '📐 Konfigurasi Grid' : session.strategy === 'trend' ? '📈 Konfigurasi Trend' : '🪙 Konfigurasi DCA'}
          </p>
          <div className="flex flex-wrap gap-2">
            {session.strategy === 'grid' && (<>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(159,232,112,0.12)] text-[#163300] dark:text-[#9fe870]">
                {configDisplay.grid_count || '?'} grid level
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#252822] text-[#0e0f0c] dark:text-[#e8ebe6]">
                Bawah {configDisplay.lower_price?.toLocaleString() || '?'}
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#252822] text-[#0e0f0c] dark:text-[#e8ebe6]">
                Atas {configDisplay.upper_price?.toLocaleString() || '?'}
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#252822] text-[#0e0f0c] dark:text-[#e8ebe6]">
                {configDisplay.quantity || '?'} {session.symbol.split('_')[0]} / order
              </span>
            </>)}
            {session.strategy === 'trend' && (<>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(56,200,255,0.12)] text-[#0994b3] dark:text-[#5dd8f5]">
                SMA Cepat {configDisplay.fast_period || 10}
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(56,200,255,0.08)] text-[#0994b3] dark:text-[#5dd8f5]">
                SMA Lambat {configDisplay.slow_period || 30}
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#252822] text-[#0e0f0c] dark:text-[#e8ebe6]">
                {configDisplay.interval || '5m'} candle
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#252822] text-[#0e0f0c] dark:text-[#e8ebe6]">
                {configDisplay.quantity || '?'} {session.symbol.split('_')[0]} / sinyal
              </span>
            </>)}
            {session.strategy === 'dca' && (<>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(255,209,26,0.15)] text-[#7a5f00] dark:text-[#f5c842]">
                ${configDisplay.amount || '?'} / interval
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#252822] text-[#0e0f0c] dark:text-[#e8ebe6]">
                {configDisplay.interval_sec === 3600 ? 'Setiap 1 jam' : configDisplay.interval_sec === 7200 ? 'Setiap 2 jam' : configDisplay.interval_sec === 21600 ? 'Setiap 6 jam' : configDisplay.interval_sec === 43200 ? 'Setiap 12 jam' : configDisplay.interval_sec === 86400 ? 'Setiap 1 hari' : configDisplay.interval_sec === 604800 ? 'Setiap 1 minggu' : `${configDisplay.interval_sec || '?'}s`}
              </span>
              {configDisplay.take_profit_pct > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(159,232,112,0.12)] text-[#163300] dark:text-[#9fe870]">
                  Take profit {configDisplay.take_profit_pct}%
                </span>
              )}
            </>)}
          </div>
        </div>

        {/* Trend Validation Info — only shown when validation_mode exists */}
        {isTrendSignal && configDisplay.validation_mode && (
          <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] mb-4">
            <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-3">Validasi Otomatis</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]">
                Target +{configDisplay.validation_target_value || 2}%
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]">
                Invalid -{configDisplay.validation_invalid_value || 1}%
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#252822] text-[#0e0f0c] dark:text-[#e8ebe6]">
                Window {configDisplay.validation_window_minutes || 120} menit
              </span>
            </div>
          </div>
        )}

        {/* Detail Konfigurasi — collapsible */}
        <details className="mb-4 group">
          <summary className="flex items-center gap-2 px-4 py-2.5 rounded-[12px] bg-[#f0f1ee] dark:bg-[#1e201c] border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] cursor-pointer hover:bg-[rgba(14,15,12,0.04)] dark:hover:bg-[rgba(232,235,230,0.04)] transition-colors select-none w-fit">
            <span className="text-xs transition-transform group-open:rotate-90 inline-block text-[#686868] dark:text-[#898989]">›</span>
            <span className="text-xs font-semibold text-[#686868] dark:text-[#898989]">Detail Konfigurasi</span>
          </summary>
          <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] mt-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
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
            <div className="overflow-x-auto">
              <pre className="bg-[#f0f1ee] dark:bg-[#252822] p-3 rounded-[16px] text-xs text-[#5a5b58] dark:text-[#8a8d88] leading-relaxed">{JSON.stringify(configDisplay, null, 2)}</pre>
            </div>
          </div>
        </details>

        {/* Grid Paper Portfolio */}
        {isGridPaper && portfolio && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Virtual Portfolio</h2>

            {/* Hero row: Saldo + Unrealized side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="rounded-[24px] p-5 border-2 border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] bg-white dark:bg-[#1e201c]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-1">Saldo Virtual</p>
                <p className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6]">${fmt(portfolio.virtual_balance)}</p>
                {portfolio.initial_balance != null && (
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-1.5">Modal awal ${fmt(portfolio.initial_balance)}</p>
                )}
              </div>
              <div className={`rounded-[24px] p-5 border-2 ${
                (portfolio.unrealized_pnl ?? 0) >= 0
                  ? 'border-[rgba(5,77,40,0.3)] dark:border-[rgba(159,232,112,0.2)] bg-gradient-to-br from-[rgba(5,77,40,0.05)] to-transparent dark:from-[rgba(159,232,112,0.08)]'
                  : 'border-[rgba(208,50,56,0.3)] dark:border-[rgba(208,50,56,0.2)] bg-gradient-to-br from-[rgba(208,50,56,0.05)] to-transparent dark:from-[rgba(208,50,56,0.08)]'
              }`}>
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-1">Unrealized P&L</p>
                <p className={`text-3xl font-black ${(portfolio.unrealized_pnl ?? 0) >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {(portfolio.unrealized_pnl ?? 0) >= 0 ? '+' : ''}${((portfolio.unrealized_pnl ?? 0)).toFixed(2)}
                </p>
                <p className="text-xs text-[#686868] dark:text-[#898989] mt-1.5">{portfolio.holdings?.length ?? 0} posisi terbuka</p>
              </div>
            </div>

            {/* Holdings card */}
            {(portfolio.holdings?.length ?? 0) > 0 && (
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Donut chart */}
                  <div className="flex-shrink-0 flex items-center justify-center w-[160px] h-[160px] mx-auto sm:mx-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            ...portfolio.holdings.map((h, i) => ({
                              name: `${session.symbol.split('_')[0]} #${i + 1}`,
                              value: parseFloat(h.qty) * parseFloat(h.avg_price),
                              color: HOLDING_COLORS[i % HOLDING_COLORS.length],
                            })),
                            { name: 'Cash', value: portfolio.virtual_balance, color: 'rgba(140,140,140,0.2)' }
                          ]}
                          cx="50%" cy="50%"
                          innerRadius={48} outerRadius={68}
                          paddingAngle={2} dataKey="value"
                        >
                          {[
                            ...portfolio.holdings.map((_, i) => ({ color: HOLDING_COLORS[i % HOLDING_COLORS.length] })),
                            { color: 'rgba(140,140,140,0.2)' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#fff', border: '1px solid rgba(14,15,12,0.08)', borderRadius: 10, fontSize: 11 }}
                          formatter={(value: number) => [`$${fmt(value)}`, '']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Holdings list */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-3">Holdings</p>
                    <div className="space-y-2">
                      {portfolio.holdings.map((h, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: HOLDING_COLORS[i % HOLDING_COLORS.length] }} />
                            <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{session.symbol.split('_')[0]}</span>
                            <span className="font-semibold text-[#054d28] dark:text-[#9fe870]">{h.qty}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-[#686868] dark:text-[#898989]">@ {fmt(parseFloat(h.avg_price))}</span>
                            <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${fmt(parseFloat(h.qty) * parseFloat(h.avg_price))}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[rgba(14,15,12,0.15)] dark:bg-[rgba(232,235,230,0.15)] flex-shrink-0" />
                          <span className="text-[#686868] dark:text-[#898989]">Cash</span>
                        </div>
                        <span className="font-mono font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${fmt(portfolio.virtual_balance)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grid Level Visual */}
        {(isGridSignal || isGridPaper) && strategySignals && Object.keys(signalsByLevel).length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Grid Levels</h2>
            <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
              <div className="space-y-2">
                {Object.entries(signalsByLevel)
                  .sort((a, b) => Number(b[0]) - Number(a[0]))
                  .map(([levelIndex, signal]) => {
                    const isBuy = signal.signal_type === 'buy'
                    const status = signal.validation_status
                    const barColor = status === 'confirmed' ? 'bg-[#9fe870]'
                      : status === 'invalidated' ? 'bg-[#d03238]'
                      : status === 'pending' ? 'bg-[rgba(255,209,26,0.5)] dark:bg-[rgba(255,209,26,0.7)] animate-pulse'
                      : 'bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]'
                    const statusLabel = status === 'confirmed' ? '✓' : status === 'invalidated' ? '✗' : status === 'pending' ? '○' : '—'
                    const statusColor = status === 'confirmed' ? 'text-[#054d28] dark:text-[#9fe870]'
                      : status === 'invalidated' ? 'text-[#d03238] dark:text-[#ff6b6f]'
                      : status === 'pending' ? 'text-[#7a5f00] dark:text-[#f5c842]'
                      : 'text-[#686868] dark:text-[#898989]'
                    return (
                      <div key={signal.id} className="flex items-center gap-3 text-xs">
                        <span className="w-14 text-right text-[#686868] dark:text-[#898989] flex-shrink-0">L{levelIndex}</span>
                        <span className={`w-12 text-center rounded-full px-1.5 py-0.5 flex-shrink-0 font-semibold text-[10px] ${isBuy ? 'bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                          {isBuy ? '▲ Beli' : '▼ Jual'}
                        </span>
                        <span className="w-24 text-[#686868] dark:text-[#898989] font-mono flex-shrink-0">{fmt(parseFloat(signal.grid_level_price))}</span>
                        <div className="flex-1 h-4 bg-[#f0f1ee] dark:bg-[#252822] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: signal.result_pct != null ? `${Math.min(100, Math.abs(signal.result_pct))}%` : '100%' }} />
                        </div>
                        <span className={`w-4 text-center flex-shrink-0 font-bold ${statusColor}`}>{statusLabel}</span>
                      </div>
                    )
                  })}
              </div>
              <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-3">✓ Confirmed  ✗ Invalidated  ○ Pending  — Expired</p>
            </div>
          </div>
        )}

        {/* Signal Summary (Grid and Trend) */}
        {isStrategySignal && signalSummary && signalSummary.total_count > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Ringkasan Sinyal</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider">Total</p>
                <p className="text-2xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{signalSummary.total_count}</p>
                <p className="text-xs text-[#686868] dark:text-[#898989] mt-0.5">{signalSummary.buy_count}▲ · {signalSummary.sell_count}▼</p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-2">Success Rate</p>
                <p className={`text-2xl font-black mb-2 ${signalSummary.success_rate >= 50 ? 'text-[#054d28] dark:text-[#9fe870]' : signalSummary.success_rate > 0 ? 'text-[#7a5f00] dark:text-[#f5c842]' : 'text-[#686868] dark:text-[#898989]'}`}>
                  {signalSummary.success_rate.toFixed(1)}%
                </p>
                <div className="h-1.5 bg-[#f0f1ee] dark:bg-[#252822] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${signalSummary.success_rate >= 50 ? 'bg-[#9fe870]' : signalSummary.success_rate > 0 ? 'bg-[#ffd11a]' : 'bg-[rgba(14,15,12,0.2)]'}`}
                    style={{ width: `${Math.min(100, signalSummary.success_rate)}%` }} />
                </div>
                <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-1">{signalSummary.confirmed_count} dari {signalSummary.total_count}</p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-2">Confirmed</p>
                <p className="text-2xl font-black text-[#054d28] dark:text-[#9fe870] mt-1">{signalSummary.confirmed_count}</p>
                <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">{signalSummary.invalidated_count} invalidated</p>
              </div>
              <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-2">Expired</p>
                <p className="text-2xl font-black text-[#686868] dark:text-[#898989] mt-1">{signalSummary.expired_count}</p>
                <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">{signalSummary.total_count - signalSummary.confirmed_count - signalSummary.invalidated_count - signalSummary.expired_count} pending</p>
              </div>
            </div>
          </div>
        )}

        {/* Strategy Signal History (Grid and Trend) */}
        {isStrategySignal && strategySignals && strategySignals.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">
                {isTrendSignal ? 'Histori Sinyal Trend' : 'Histori Sinyal Grid'}
              </h2>
              <div className="flex items-center gap-1 bg-[#f0f1ee] dark:bg-[#252822] rounded-full p-0.5">
                <button onClick={() => setSignalView('timeline')} className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${signalView === 'timeline' ? 'bg-white dark:bg-[#1e201c] text-[#0e0f0c] dark:text-[#e8ebe6] shadow-sm' : 'text-[#686868] dark:text-[#898989]'}`}>Timeline</button>
                <button onClick={() => setSignalView('table')} className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${signalView === 'table' ? 'bg-white dark:bg-[#1e201c] text-[#0e0f0c] dark:text-[#e8ebe6] shadow-sm' : 'text-[#686868] dark:text-[#898989]'}`}>Tabel</button>
              </div>
            </div>

            {signalView === 'timeline' ? (
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <div className="space-y-0">
                  {strategySignals.slice(0, 30).map((s, i) => {
                    const isBuy = s.signal_type === 'buy'
                    const isLast = i === Math.min(strategySignals.length, 30) - 1
                    const dotColor = s.validation_status === 'confirmed' ? 'bg-[#9fe870] border-[#9fe870]'
                      : s.validation_status === 'invalidated' ? 'bg-[#d03238] border-[#d03238]'
                      : s.validation_status === 'pending' ? 'bg-[#ffd11a] border-[#ffd11a]'
                      : 'bg-[#f0f1ee] dark:bg-[#252822] border-[rgba(14,15,12,0.2)] dark:border-[rgba(232,235,230,0.2)]'
                    return (
                      <div key={s.id} className="flex gap-3">
                        {/* Timeline line + dot */}
                        <div className="flex flex-col items-center flex-shrink-0 w-4">
                          <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 mt-1 ${dotColor}`} />
                          {!isLast && <div className="w-px flex-1 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] my-1" />}
                        </div>
                        {/* Content */}
                        <div className="flex-1 pb-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isBuy ? 'bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                              {isBuy ? '▲ Beli' : '▼ Jual'}
                            </span>
                            {!isTrendSignal && <span className="text-xs text-[#686868] dark:text-[#898989]">L{s.grid_level_index}</span>}
                            {isTrendSignal && <span className="text-xs text-[#686868] dark:text-[#898989]">{s.reason === 'golden_cross' ? '🌟 Golden Cross' : s.reason === 'death_cross' ? '💀 Death Cross' : s.reason}</span>}
                            <span className="text-xs font-mono text-[#0e0f0c] dark:text-[#e8ebe6]">{fmt(parseFloat(s.grid_level_price))}</span>
                            {s.validation_status === 'confirmed' && s.result_pct != null && (
                              <span className={`text-xs font-semibold ${s.result_pct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                {s.result_pct >= 0 ? '+' : ''}{s.result_pct.toFixed(2)}%
                              </span>
                            )}
                            {s.validation_status === 'pending' && <span className="text-[10px] font-semibold bg-[rgba(255,209,26,0.15)] dark:bg-[rgba(255,209,26,0.2)] text-[#7a5f00] dark:text-[#f5c842] px-1.5 py-0.5 rounded-full animate-pulse">⏳ menunggu</span>}
                          </div>
                          <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-0.5">
                            {new Date(s.created_at).toLocaleDateString('id-ID')} {new Date(s.created_at).toLocaleTimeString('id-ID')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] overflow-hidden border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[#686868] dark:text-[#898989] text-xs font-semibold uppercase tracking-wider bg-[#f0f1ee] dark:bg-[#252822]">
                      <tr>
                        <th className="px-4 py-3 text-left">Waktu</th>
                        <th className="px-4 py-3 text-left">Sisi</th>
                        <th className="px-4 py-3 text-left">{isTrendSignal ? 'Cross' : 'Level'}</th>
                        <th className="px-4 py-3 text-left">Harga</th>
                        <th className="px-4 py-3 text-left">Qty</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-right">Hasil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(14,15,12,0.06)] dark:divide-[rgba(232,235,230,0.06)]">
                      {strategySignals.slice(0, 30).map(s => (
                        <tr key={s.id} className="hover:bg-[#f0f1ee] dark:hover:bg-[#252822] transition-colors">
                          <td className="px-4 py-3 text-[#686868] dark:text-[#898989] text-xs whitespace-nowrap">
                            <span className="block">{new Date(s.created_at).toLocaleDateString('id-ID')}</span>
                            <span className="block text-[10px] opacity-70">{new Date(s.created_at).toLocaleTimeString('id-ID')}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.signal_type === 'buy' ? 'bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                              {s.signal_type === 'buy' ? '▲ Beli' : '▼ Jual'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#686868] dark:text-[#898989] text-xs">
                            {isTrendSignal
                              ? (s.reason === 'golden_cross' ? '🌟 Golden' : s.reason === 'death_cross' ? '💀 Death' : s.reason)
                              : `#${s.grid_level_index}`}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmt(parseFloat(s.grid_level_price))}</td>
                          <td className="px-4 py-3 text-xs text-[#5a5b58] dark:text-[#8a8d88]">{s.quantity}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              s.validation_status === 'confirmed' ? 'bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]' :
                              s.validation_status === 'invalidated' ? 'bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]' :
                              s.validation_status === 'pending' ? 'bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842]' :
                              'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989]'
                            }`}>
                              {s.validation_status === 'confirmed' ? '✓ confirmed' : s.validation_status === 'invalidated' ? '✗ invalid' : s.validation_status === 'pending' ? '⏳ pending' : 'expired'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-right">
                            {s.validation_status === 'confirmed' && s.result_pct != null && (
                              <span className={`font-bold ${s.result_pct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                {s.result_pct >= 0 ? '+' : ''}{s.result_pct.toFixed(2)}%
                              </span>
                            )}
                            {s.validation_status === 'pending' && <span className="text-[#7a5f00] dark:text-[#f5c842] text-[10px]">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Orders Table — hidden when strategy signal history is shown */}
        {!isStrategySignal && (
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
                    <thead className="text-[#686868] dark:text-[#898989] text-xs font-semibold uppercase tracking-wider bg-[#f0f1ee] dark:bg-[#252822]">
                      <tr>
                        <th className="px-4 py-3 text-left">Waktu</th>
                        <th className="px-4 py-3 text-left">Sisi</th>
                        <th className="px-4 py-3 text-left">Harga</th>
                        <th className="px-4 py-3 text-left">Jumlah</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Tipe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(14,15,12,0.06)] dark:divide-[rgba(232,235,230,0.06)]">
                      {orders.slice(0, 20).map(o => (
                        <tr key={o.id} className="hover:bg-[#f0f1ee] dark:hover:bg-[#252822] transition-colors">
                          <td className="px-4 py-3 text-[#686868] dark:text-[#898989] text-xs whitespace-nowrap">
                            <span className="block">{new Date(o.created_at).toLocaleDateString('id-ID')}</span>
                            <span className="block text-[10px] opacity-70">{new Date(o.created_at).toLocaleTimeString('id-ID')}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${o.side === 'buy' ? 'bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                              {o.side === 'buy' ? '▲ Beli' : '▼ Jual'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{o.price}</td>
                          <td className="px-4 py-3 text-xs text-[#0e0f0c] dark:text-[#e8ebe6]">{o.quantity}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              o.status === 'filled' ? 'bg-[rgba(5,77,40,0.08)] dark:bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]' :
                              o.status === 'cancelled' ? 'bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]' :
                              o.status === 'closed' ? 'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989]' :
                              'bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842]'
                            }`}>{o.status}</span>
                          </td>
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
