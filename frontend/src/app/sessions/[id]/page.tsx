'use client'
import { Grid2x2, TrendingUp, Coins, BarChart2, FileText, Zap, Clipboard, Search, Lock, Star, Skull, Loader, Target, OctagonX, Clock, Wallet, History } from 'lucide-react'
import { TrendSparkline } from '@/components/sessions/TrendSparkline'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useSessionWS } from '@/lib/useWS'
import { useEffect, useState, useCallback } from 'react'
import { useTheme } from '@/lib/theme'
import { HelpIcon } from '@/components/HelpIcon'
import { PriceBadge } from '@/components/PriceBadge'
import { Navbar } from '@/components/Navbar'
import { StrategyTabs } from '@/components/sessions/StrategyTabs'
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

function GridBar({ lower, upper, current, gridCount }: { lower: number; upper: number; current: number; gridCount: number }) {
  const range = upper - lower
  if (range <= 0) return null
  const pct = Math.max(0, Math.min(100, ((current - lower) / range) * 100))
  return (
    <div className="relative w-full h-5 flex items-center">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[rgba(159,232,112,0.25)] to-[rgba(159,232,112,0.4)]" style={{ width: `${pct}%` }} />
      </div>
      {Array.from({ length: gridCount + 1 }, (_, i) => (
        <div key={i} className="absolute top-0 bottom-0 w-px bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" style={{ left: `${(i / gridCount) * 100}%` }} />
      ))}
      <div className="absolute top-0 bottom-0 w-0.5 bg-[#163300] dark:bg-[#9fe870] rounded-full" style={{ left: `${pct}%` }} title={`Harga: ${current}`} />
      <span className="absolute -bottom-3.5 left-0 text-[9px] text-[#686868] dark:text-[#898989]">{lower.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
      <span className="absolute -bottom-3.5 right-0 text-[9px] text-[#686868] dark:text-[#898989]">{upper.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
    </div>
  )
}

// DCABar: SL (kiri) ←→ Avg (tengah) ←→ TP (kanan), dot = posisi harga saat ini
function DCABar({ avgBuy, current, tpPct, slPct }: { avgBuy: number; current: number; tpPct: number; slPct: number }) {
  if (avgBuy <= 0) return null
  const gainPct = ((current - avgBuy) / avgBuy) * 100
  const leftEdge = slPct > 0 ? -slPct : Math.min(-5, gainPct * 1.2)
  const rightEdge = tpPct > 0 ? tpPct : Math.max(5, gainPct * 1.2)
  const totalRange = rightEdge - leftEdge
  const dotPct = Math.max(0, Math.min(100, ((gainPct - leftEdge) / totalRange) * 100))
  const avgLinePct = Math.max(0, Math.min(100, ((0 - leftEdge) / totalRange) * 100))
  const tpLinePct = tpPct > 0 ? Math.max(0, Math.min(100, ((tpPct - leftEdge) / totalRange) * 100)) : null
  const slLinePct = slPct > 0 ? Math.max(0, Math.min(100, ((-slPct - leftEdge) / totalRange) * 100)) : null
  const isProfit = gainPct >= 0
  const nearTP = tpPct > 0 && gainPct >= tpPct * 0.8
  const nearSL = slPct > 0 && gainPct <= -slPct * 0.8
  const dotColor = nearTP ? '#9fe870' : nearSL ? '#ff6b6f' : isProfit ? '#9fe870' : '#ff6b6f'
  return (
    <div className="w-full mt-3 mb-1">
      <div className="flex items-center justify-between text-[10px] mb-1.5">
        <span className="text-[#686868] dark:text-[#898989]">Avg beli <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${avgBuy.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></span>
        <span className={`font-bold ${isProfit ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
          {nearTP && <span className="ml-1 animate-pulse"> · Mendekati TP!</span>}
          {nearSL && <span className="ml-1 animate-pulse text-[#ff6b6f]"> · Mendekati SL!</span>}
        </span>
      </div>
      <div className="relative w-full h-5 flex items-center">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full overflow-hidden" style={{ background: `linear-gradient(to right, rgba(208,50,56,0.15) 0%, rgba(208,50,56,0.15) ${avgLinePct}%, rgba(159,232,112,0.15) ${avgLinePct}%, rgba(159,232,112,0.15) 100%)` }} />
        {slLinePct !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-[#ff6b6f] opacity-70 rounded-full" style={{ left: `${slLinePct}%` }} />}
        <div className="absolute top-0 bottom-0 w-0.5 bg-[rgba(140,140,140,0.5)] rounded-full" style={{ left: `${avgLinePct}%` }} />
        {tpLinePct !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-[#9fe870] opacity-70 rounded-full" style={{ left: `${tpLinePct}%` }} />}
        <div className="absolute w-3 h-3 rounded-full border-2 border-white dark:border-[#1e201c] shadow transition-all" style={{ left: `${dotPct}%`, transform: 'translateX(-50%)', background: dotColor }} />
      </div>
      <div className="relative mt-1" style={{ height: '14px' }}>
        {slLinePct !== null && <span className="absolute text-[9px] text-[#d03238] dark:text-[#ff6b6f]" style={{ left: `${slLinePct}%`, transform: 'translateX(-50%)' }}>-{slPct}%</span>}
        <span className="absolute text-[9px] text-[#686868] dark:text-[#898989]" style={{ left: `${avgLinePct}%`, transform: 'translateX(-50%)' }}>avg</span>
        {tpLinePct !== null && <span className="absolute text-[9px] text-[#054d28] dark:text-[#9fe870]" style={{ left: `${tpLinePct}%`, transform: 'translateX(-50%)' }}>+{tpPct}%</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] flex-wrap gap-1">
        {slPct > 0 && <span className="text-[#686868] dark:text-[#898989]">SL <span className="font-semibold text-[#d03238] dark:text-[#ff6b6f]">${(avgBuy * (1 - slPct / 100)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span> ({(gainPct - (-slPct)).toFixed(2)}% menuju SL)</span>}
        {tpPct > 0 && <span className="text-[#686868] dark:text-[#898989]">TP <span className="font-semibold text-[#054d28] dark:text-[#9fe870]">${(avgBuy * (1 + tpPct / 100)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span> ({(tpPct - gainPct).toFixed(2)}% lagi)</span>}
      </div>
    </div>
  )
}

export default function SessionDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id // keep for queryKey strings
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [copied, setCopied] = useState(false)
  const [signalView, setSignalView] = useState<'timeline' | 'table' | 'summary'>('timeline')
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [reevalResult, setReevalResult] = useState<any>(null)
  const [reevalLoading, setReevalLoading] = useState(false)
  const [editingConfig, setEditingConfig] = useState(false)
  const [editConfigValue, setEditConfigValue] = useState('')
  const [editConfigSaving, setEditConfigSaving] = useState(false)
  const [editConfigError, setEditConfigError] = useState('')
  const [editRec, setEditRec] = useState<any>(null)
  const [editRecLoading, setEditRecLoading] = useState(false)
  const [editRecHorizon, setEditRecHorizon] = useState<'short'|'medium'|'long'>('medium')
  const [editRecCapital, setEditRecCapital] = useState('100')
  const { theme } = useTheme()
  const tooltipStyle = { background: theme === 'dark' ? '#1e201c' : '#fff', border: '1px solid ' + (theme === 'dark' ? 'rgba(232,235,230,0.12)' : 'rgba(14,15,12,0.08)'), borderRadius: 12, fontSize: 11, color: theme === 'dark' ? '#e8ebe6' : '#0e0f0c' }

  // Fetch all sessions for navigation
  const { data: allSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.sessions.list,
    enabled: isAuthenticated,
  })

  // Auth guard
  useEffect(() => {
    if (initialized && !isAuthenticated) router.push('/login')
  }, [initialized, isAuthenticated, router])

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

  const [allOrders, setAllOrders] = useState<import('@/types').Order[]>([])
  const [orderCursor, setOrderCursor] = useState<number | undefined>(undefined)
  const [hasMoreOrders, setHasMoreOrders] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersFetched, setOrdersFetched] = useState(false)

  const fetchOrders = useCallback(async (cursor?: number) => {
    if (!isAuthenticated) return
    setOrdersLoading(true)
    try {
      const data = await api.sessions.getOrders(Number(id), cursor)
      if (cursor) {
        setAllOrders(prev => [...prev, ...data])
      } else {
        setAllOrders(data)
      }
      setHasMoreOrders(data.length === 50)
      if (data.length > 0) setOrderCursor(data[data.length - 1].id)
    } finally {
      setOrdersLoading(false)
      setOrdersFetched(true)
    }
  }, [id, isAuthenticated])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    if (!isAuthenticated) return
    const t = setInterval(() => fetchOrders(), 10000)
    return () => clearInterval(t)
  }, [fetchOrders])

  // Grid Signal specific queries
  const isGridSignal = session?.strategy === 'grid' && session?.mode === 'signal'
  const isTrendSignal = session?.strategy === 'trend' && session?.mode === 'signal'
  const isStrategySignal = isGridSignal || isTrendSignal
  const isGridPaper = session?.strategy === 'grid' && session?.mode === 'paper'
  const isTrendPaper = session?.strategy === 'trend' && session?.mode === 'paper'
  const isDCAPaper = session?.strategy === 'dca' && session?.mode === 'paper'
  const isPaperMode = session?.mode === 'paper'

  const { data: strategySignals } = useQuery({
    queryKey: ['signals', id],
    queryFn: () => api.sessions.getSignals(Number(id)),
    enabled: isAuthenticated && (isStrategySignal || isGridPaper),
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
    enabled: isAuthenticated && (isGridPaper || isDCAPaper),
    refetchInterval: 15000,
  })

  const { data: dcaTicker } = useQuery({
    queryKey: ['ticker', session?.symbol],
    queryFn: () => api.sessions.getTicker(session!.symbol),
    enabled: isAuthenticated && isDCAPaper && !!session?.symbol,
    refetchInterval: 1_000,
    staleTime: 5_000,
  })

  const { data: trendStatus } = useQuery({
    queryKey: ['trend-status-detail', id],
    queryFn: async () => {
      const statuses = await api.trend.sessions.status()
      return statuses.find(s => s.session_id === Number(id)) ?? null
    },
    enabled: isAuthenticated && (isTrendSignal || isTrendPaper) && !!session,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  const { data: gridTicker } = useQuery({
    queryKey: ['ticker', session?.symbol],
    queryFn: () => api.sessions.getTicker(session!.symbol),
    enabled: isAuthenticated && (isGridSignal || isGridPaper) && !!session?.symbol,
    refetchInterval: 1_000,
    staleTime: 5_000,
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

  async function handleCopySummary() {
    if (!session) return
    let configDisplay: any = {}
    try { configDisplay = JSON.parse(session.config) } catch {}

    // Fetch live price
    let currentPriceStr = '-'
    try {
      const ticker = await api.sessions.getTicker(session.symbol)
      currentPriceStr = parseFloat(ticker.lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })
    } catch { /* ignore */ }

    const lines: string[] = []
    const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

    lines.push(`## Session: ${session.name}`)
    lines.push(`Tanggal: ${dateStr} | Status: ${session.status} | Mode: ${session.mode}`)
    lines.push(`Harga ${session.symbol} saat ini: ${currentPriceStr}`)
    lines.push('')

    // Config
    lines.push('### Konfigurasi')
    lines.push(`- Pair: ${session.symbol}`)
    lines.push(`- Strategi: ${session.strategy}`)
    if (session.strategy === 'grid') {
      lines.push(`- Range: ${configDisplay.lower_price} — ${configDisplay.upper_price}`)
      lines.push(`- Grid: ${configDisplay.grid_count} level`)
      lines.push(`- Qty per order: ${configDisplay.quantity}`)
    } else if (session.strategy === 'trend') {
      lines.push(`- SMA Cepat: ${configDisplay.fast_period}`)
      lines.push(`- SMA Lambat: ${configDisplay.slow_period}`)
      lines.push(`- Qty: ${configDisplay.quantity}`)
    } else if (session.strategy === 'dca') {
      lines.push(`- Interval: ${configDisplay.interval_sec}s`)
      lines.push(`- Amount: $${configDisplay.amount}`)
      lines.push(`- Take Profit: ${configDisplay.take_profit_pct}%`)
      if (configDisplay.stop_loss_pct > 0) lines.push(`- Stop Loss: ${configDisplay.stop_loss_pct}%`)
    }
    lines.push('')

    // Portfolio (paper only)
    if (session.mode === 'paper' && portfolio) {
      lines.push('### Portfolio Virtual')
      if (portfolio.initial_balance != null) lines.push(`- Modal awal: $${portfolio.initial_balance.toFixed(2)}`)
      lines.push(`- Saldo saat ini: $${portfolio.virtual_balance.toFixed(2)}`)
      const used = (portfolio.initial_balance ?? portfolio.virtual_balance) - portfolio.virtual_balance
      if (used > 0) lines.push(`- Modal terpakai: $${used.toFixed(2)}`)
      lines.push(`- Unrealized P&L: ${(portfolio.unrealized_pnl ?? 0) >= 0 ? '+' : ''}$${(portfolio.unrealized_pnl ?? 0).toFixed(2)}`)
      lines.push('')

      if ((portfolio.holdings?.length ?? 0) > 0) {
        lines.push(`### Posisi Terbuka (${portfolio.holdings.length})`)
        portfolio.holdings.forEach((h, i) => {
          lines.push(`${i + 1}. Beli ${h.qty} @ ${h.avg_price}`)
        })
        lines.push('')
      }
    }

    // P&L
    if (pnl) {
      lines.push('### Performa')
      lines.push(`- Realized P&L: $${pnl.realized_pnl}`)
      lines.push(`- Total P&L: $${pnl.total_pnl}`)
      lines.push(`- Win Rate: ${pnl.win_rate?.toFixed(1) ?? 0}%`)
      lines.push(`- Total Trades: ${pnl.trade_count ?? 0}`)
      if (session.mode === 'paper' && pnl.balance) lines.push(`- Balance: $${pnl.balance.toFixed(2)}`)
      lines.push('')
    }

    // Orders (last 5)
    if (allOrders && allOrders.length > 0) {
      lines.push(`### Order Terakhir (${Math.min(allOrders.length, 5)} dari ${allOrders.length})`)
      allOrders.slice(0, 5).forEach(o => {
        const t = new Date(o.created_at).toLocaleString('id-ID')
        lines.push(`- ${o.side.toUpperCase()} ${o.executed_qty || o.quantity} @ ${o.executed_price || o.price} | ${o.status} | ${t}`)
      })
      lines.push('')
    }

    // Reevaluation result (if available)
    if (reevalResult && session.strategy === 'grid') {
      lines.push('### Reevaluasi Grid')
      lines.push(`- Harga saat ini: ${reevalResult.current_price.toLocaleString(undefined, { maximumFractionDigits: 8 })}`)
      lines.push(`- Status: ${reevalResult.in_range ? 'Dalam range' : 'KELUAR RANGE'}`)
      lines.push(`- Posisi: ${reevalResult.position_pct.toFixed(1)}% dalam range`)
      lines.push(`- Level aktif: ${reevalResult.levels_triggered}/${reevalResult.total_levels} (${reevalResult.coverage_pct.toFixed(1)}%)`)
      lines.push(`- Range saat ini: ${reevalResult.current_lower.toLocaleString()} — ${reevalResult.current_upper.toLocaleString()}`)
      if (!reevalResult.in_range) lines.push(`- Saran range baru: ${reevalResult.suggested_lower.toLocaleString()} — ${reevalResult.suggested_upper.toLocaleString()}`)
      lines.push(`- Analisis: ${reevalResult.suggestion}`)
    }

    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Sync notes from session data
  useEffect(() => {
    if (session?.notes !== undefined) setNotes(session.notes ?? '')
  }, [session?.notes])

  async function handleSaveNotes(value: string) {
    setNotes(value)
    try {
      await api.sessions.updateNotes(Number(id), value)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } catch { /* ignore */ }
  }

  async function handleReevaluate() {
    setReevalLoading(true)
    try {
      const result = await api.sessions.reevaluate(Number(id))
      setReevalResult(result)
    } catch (e: any) {
      setError(e.message || 'Reevaluate failed')
    }
    setReevalLoading(false)
  }

  async function handleApplyConfig(config: string) {
    try {
      await api.sessions.applyConfig(Number(id), config)
      qc.invalidateQueries({ queryKey: ['session', id] })
      setReevalResult(null)
    } catch (e: any) {
      setError(e.message || 'Apply config failed')
    }
  }

  async function handleSaveEditConfig() {
    setEditConfigError('')
    // Validate JSON
    try { JSON.parse(editConfigValue) } catch {
      setEditConfigError('JSON tidak valid')
      return
    }
    setEditConfigSaving(true)
    try {
      await api.sessions.applyConfig(Number(id), editConfigValue)
      qc.invalidateQueries({ queryKey: ['session', id] })
      setEditingConfig(false)
      setEditRec(null)
    } catch (e: any) {
      setEditConfigError(e.message || 'Gagal simpan config')
    }
    setEditConfigSaving(false)
  }

  async function fetchEditRec() {
    setEditRecLoading(true)
    try {
      const rec = await api.grid.recommend({ symbol: session?.symbol ?? '', horizon: editRecHorizon, capital: parseFloat(editRecCapital) || 100 })
      setEditRec(rec)
      // Apply recommendation to editor
      const current = (() => { try { return JSON.parse(editConfigValue) } catch { return {} } })()
      setEditConfigValue(JSON.stringify({
        ...current,
        upper_price: rec.UpperPrice,
        lower_price: rec.LowerPrice,
        grid_count: rec.GridCount,
        quantity: rec.Quantity,
      }, null, 2))
    } catch { /* ignore */ }
    setEditRecLoading(false)
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

  // Navigation helpers
  const currentIndex = allSessions ? allSessions.findIndex(s => s.id === session.id) : -1
  const prevSession = allSessions && currentIndex > 0 ? allSessions[currentIndex - 1] : null
  const nextSession = allSessions && currentIndex >= 0 && currentIndex < allSessions.length - 1 ? allSessions[currentIndex + 1] : null

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

        {/* Navigation: StrategyTabs + back + prev/next */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <button
              onClick={() => router.push(`/sessions/${session.strategy}`)}
              className="flex items-center gap-1.5 text-sm text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] transition-colors"
            >
              ← Kembali ke {strategyLabel}
            </button>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => prevSession && router.push(`/sessions/${prevSession.id}`)}
                disabled={!prevSession}
                title={prevSession ? prevSession.name : ''}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#1e201c] text-[#686868] dark:text-[#898989] hover:bg-white dark:hover:bg-[#252822] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]"
              >
                ← {prevSession ? <span className="hidden sm:inline truncate max-w-[100px] sm:max-w-[140px] overflow-hidden">{prevSession.name}</span> : <span>Prev</span>}
              </button>
              <button
                onClick={() => nextSession && router.push(`/sessions/${nextSession.id}`)}
                disabled={!nextSession}
                title={nextSession ? nextSession.name : ''}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f1ee] dark:bg-[#1e201c] text-[#686868] dark:text-[#898989] hover:bg-white dark:hover:bg-[#252822] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]"
              >
                {nextSession ? <span className="hidden sm:inline truncate max-w-[100px] sm:max-w-[140px] overflow-hidden">{nextSession.name}</span> : <span>Next</span>} →
              </button>
            </div>
          </div>
          <StrategyTabs active={session.strategy} />
        </div>

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
                ? 'bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870]'
                : session.strategy === 'trend'
                ? 'bg-[rgba(56,200,255,0.12)] text-[#0994b3] dark:text-[#5dd8f5]'
                : 'bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842]'
            }`}>
              {session.strategy === 'grid' ? <Grid2x2 size={28} /> : session.strategy === 'trend' ? <TrendingUp size={28} /> : <Coins size={28} />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0e0f0c] dark:text-[#e8ebe6] truncate mb-2 w-full">{session.name}</h1>

              {/* Chips row */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {/* Mode */}
                {session.mode === 'signal' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(56,200,255,0.1)] dark:bg-[rgba(56,200,255,0.15)] text-[#0994b3] dark:text-[#5dd8f5]">Signal</span>}
                {session.mode === 'paper' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(159,232,112,0.15)] dark:bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870]">Paper</span>}
                {session.mode === 'live' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(255,209,26,0.15)] dark:bg-[rgba(255,209,26,0.2)] text-[#7a5f00] dark:text-[#f5c842]">Live</span>}
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
                {session.strategy === 'trend' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(56,200,255,0.1)] dark:bg-[rgba(56,200,255,0.15)] text-[#0994b3] dark:text-[#5dd8f5]">
                    SMA {configDisplay.fast_period || 10}/{configDisplay.slow_period || 30}
                  </span>
                )}
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
                    {loading === 'stop' ? 'Stopping...' : 'Stop'}
                  </button>
                ) : (
                  <button
                    onClick={handleStart}
                    disabled={loading === 'start'}
                    className="px-6 py-2 text-sm font-bold bg-[#9fe870] text-[#163300] border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full transition-all disabled:opacity-50 shadow-[0_2px_8px_rgba(159,232,112,0.4)]"
                  >
                    {loading === 'start' ? 'Starting...' : 'Start Bot'}
                  </button>
                )}
                <button
                  onClick={handleCopySummary}
                  className="px-4 py-2 text-sm font-semibold bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:border-[rgba(14,15,12,0.3)] dark:hover:border-[rgba(232,235,230,0.3)] rounded-full transition-all"
                >
                  {copied ? '✓ Copied!' : <><Clipboard size={14} className="inline mr-1" />Copy Summary</>}
                </button>
                {session.strategy === 'grid' && (
                  <button
                    onClick={handleReevaluate}
                    disabled={reevalLoading}
                    className="px-4 py-2 text-sm font-semibold bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:border-[rgba(14,15,12,0.3)] dark:hover:border-[rgba(232,235,230,0.3)] rounded-full transition-all disabled:opacity-50"
                  >
                    {reevalLoading ? '...' : <><Search size={14} className="inline mr-1" />Reevaluate</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Signals — empty state */}
        {isStrategySignal && strategySignals && !strategySignals.some(s => s.validation_status === 'pending') && (
          <div className="mb-6">
            <p className="text-sm text-[#686868] dark:text-[#898989]">
              {session.status === 'running'
                ? 'Belum ada sinyal aktif. Bot sedang memantau pasar...'
                : 'Belum ada sinyal aktif. Klik "Start Bot" untuk memulai analisis pasar.'}
            </p>
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
                      <span className="text-xs font-semibold bg-[rgba(255,209,26,0.15)] dark:bg-[rgba(255,209,26,0.2)] text-[#7a5f00] dark:text-[#f5c842] px-2.5 py-1 rounded-full animate-pulse"><Loader size={10} className="inline mr-1 animate-spin" />menunggu</span>
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Performa</h2>
              <span className="text-xs text-[#686868] dark:text-[#898989]">
                {session.mode === 'signal' ? 'P&L teoritis (Signal)' : session.mode === 'paper' ? 'P&L virtual (Paper)' : 'P&L real (Live)'}
              </span>
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
                    {parseFloat(pnl.total_pnl) >= 0 ? '+' : ''}{((parseFloat(pnl.total_pnl) / (Number(pnl.balance) - parseFloat(pnl.total_pnl))) * 100).toFixed(1)}%
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

        {/* DCA cost basis strip — computed from orders, no extra API call */}
        {session.strategy === 'dca' && allOrders && allOrders.length > 0 && (() => {
          const buys = allOrders.filter((o: import('@/types').Order) => o.side === 'buy' && (o.status === 'filled' || o.status === 'signal'))
          if (buys.length === 0) return null
          const totalQty = buys.reduce((s: number, o: import('@/types').Order) => s + parseFloat(o.quantity), 0)
          const totalCost = buys.reduce((s: number, o: import('@/types').Order) => s + parseFloat(o.quantity) * parseFloat(o.executed_price || o.price), 0)
          const avgPrice = totalQty > 0 ? totalCost / totalQty : 0
          const totalInvested = buys.reduce((s: number, o: import('@/types').Order) => s + parseFloat(o.quantity) * parseFloat(o.price), 0)
          return (
            <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(255,209,26,0.2)] mb-6">
              <p className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wider mb-3">Cost Basis DCA</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-[#686868] dark:text-[#898989] uppercase tracking-wider">Total Beli</p>
                  <p className="text-lg font-black text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{buys.length}x</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#686868] dark:text-[#898989] uppercase tracking-wider">Avg Harga Beli</p>
                  <p className="text-lg font-black text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">${avgPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#686868] dark:text-[#898989] uppercase tracking-wider">Total Invested</p>
                  <p className="text-lg font-black text-[#7a5f00] dark:text-[#f5c842] mt-0.5">${totalInvested.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                </div>
              </div>
              {(configDisplay.take_profit_pct > 0 || configDisplay.stop_loss_pct > 0) && avgPrice > 0 && dcaTicker && (
                <div className="mt-4 pt-3 border-t border-[rgba(255,209,26,0.15)]">
                  <DCABar
                    avgBuy={avgPrice}
                    current={parseFloat(dcaTicker.lastPrice)}
                    tpPct={configDisplay.take_profit_pct ?? 0}
                    slPct={configDisplay.stop_loss_pct ?? 0}
                  />
                </div>
              )}
            </div>
          )
        })()}

        {/* Session Notes */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Catatan</h2>
            {notesSaved && <span className="text-xs text-[#054d28] dark:text-[#9fe870]">✓ Tersimpan</span>}
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={e => handleSaveNotes(e.target.value)}
            placeholder="Tulis catatan, reasoning, atau evaluasi untuk session ini..."
            rows={4}
            className="w-full px-4 py-3 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-[16px] text-sm text-[#0e0f0c] dark:text-[#e8ebe6] placeholder-[#686868] dark:placeholder-[#898989] focus:outline-none focus:ring-2 focus:ring-[rgba(159,232,112,0.4)] resize-none"
          />
        </div>

        {/* Grid Reevaluation Panel */}
        {reevalResult && session.strategy === 'grid' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Hasil Reevaluasi Grid</h2>
              <button onClick={() => setReevalResult(null)} className="text-xs text-[#686868] dark:text-[#898989] hover:text-[#d03238] transition-colors">✕ Tutup</button>
            </div>
            <div className={`rounded-[24px] p-5 border-2 mb-4 ${reevalResult.in_range ? 'border-[rgba(159,232,112,0.4)] bg-[rgba(159,232,112,0.04)]' : 'border-[rgba(208,50,56,0.4)] bg-[rgba(208,50,56,0.04)]'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${reevalResult.in_range ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {reevalResult.in_range ? '✓ Dalam Range' : '✗ Keluar Range'}
                </span>
                <span className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{reevalResult.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
                <span className="text-xs text-[#686868] dark:text-[#898989]">posisi {reevalResult.position_pct.toFixed(1)}% dalam range</span>
              </div>
              <p className="text-sm text-[#5a5b58] dark:text-[#8a8d88] mb-4">{reevalResult.suggestion}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
                <div className="bg-white dark:bg-[#1e201c] rounded-[16px] p-3">
                  <p className="text-[#686868] dark:text-[#898989] mb-1">Range Saat Ini</p>
                  <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{reevalResult.current_lower.toLocaleString()} — {reevalResult.current_upper.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-[#1e201c] rounded-[16px] p-3">
                  <p className="text-[#686868] dark:text-[#898989] mb-1">Step Size</p>
                  <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{reevalResult.step_size.toLocaleString(undefined, { maximumFractionDigits: 8 })}</p>
                </div>
                <div className="bg-white dark:bg-[#1e201c] rounded-[16px] p-3">
                  <p className="text-[#686868] dark:text-[#898989] mb-1">Level Aktif</p>
                  <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{reevalResult.levels_triggered} / {reevalResult.total_levels}</p>
                </div>
                <div className="bg-white dark:bg-[#1e201c] rounded-[16px] p-3">
                  <p className="text-[#686868] dark:text-[#898989] mb-1">Coverage</p>
                  <p className={`font-semibold ${reevalResult.coverage_pct >= 50 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#686868] dark:text-[#898989]'}`}>{reevalResult.coverage_pct.toFixed(1)}%</p>
                </div>
              </div>
              {!reevalResult.in_range && (
                <div className="border-t border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] pt-4">
                  <p className="text-xs text-[#686868] dark:text-[#898989] mb-2">Saran range baru (±15% dari harga saat ini):</p>
                  <p className="text-sm font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mb-3">{reevalResult.suggested_lower.toLocaleString()} — {reevalResult.suggested_upper.toLocaleString()} · {reevalResult.suggested_count} level</p>
                  <button
                    disabled={session.status === 'running'}
                    onClick={() => {
                      let cfg: any = {}
                      try { cfg = JSON.parse(session.config) } catch {}
                      cfg.lower_price = reevalResult.suggested_lower
                      cfg.upper_price = reevalResult.suggested_upper
                      handleApplyConfig(JSON.stringify(cfg))
                    }}
                    className="px-4 py-2 text-sm font-semibold bg-[#9fe870] text-[#163300] rounded-full hover:bg-[#cdffad] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    title={session.status === 'running' ? 'Stop session dulu sebelum apply' : ''}
                  >
                    {session.status === 'running' ? <><Lock size={14} className="inline mr-1" />Stop Dulu untuk Apply</> : '✓ Terapkan Saran'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

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
                          contentStyle={{ ...tooltipStyle, borderRadius: 10 }}
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
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: theme === 'dark' ? '#898989' : '#686868' }} tickLine={false} axisLine={false} stroke="none" />
                  <YAxis tick={{ fontSize: 10, fill: theme === 'dark' ? '#898989' : '#686868' }} tickLine={false} axisLine={false} stroke="none" tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`} />
                  <Tooltip
                    contentStyle={tooltipStyle}
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
          <p className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            {session.strategy === 'grid' ? <Grid2x2 size={12} /> : session.strategy === 'trend' ? <TrendingUp size={12} /> : <Coins size={12} />}
            {session.strategy === 'grid' ? 'Konfigurasi Grid' : session.strategy === 'trend' ? 'Konfigurasi Trend' : 'Konfigurasi DCA'}
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
              {configDisplay.stop_loss_pct > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]">
                  <OctagonX size={12} className="inline mr-1" />SL {configDisplay.stop_loss_pct}%
                </span>
              )}
            </>)}
          </div>
        </div>

        {/* GridBar — price position within grid range */}
        {session.strategy === 'grid' && configDisplay.lower_price && configDisplay.upper_price && gridTicker && (
          <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(159,232,112,0.15)] mb-4">
            <p className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wider mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Grid2x2 size={12} />Posisi Harga dalam Grid</span>
              <span className="font-normal text-[#0e0f0c] dark:text-[#e8ebe6]">{parseFloat(gridTicker.lastPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            </p>
            <GridBar
              lower={configDisplay.lower_price}
              upper={configDisplay.upper_price}
              current={parseFloat(gridTicker.lastPrice)}
              gridCount={configDisplay.grid_count}
            />
          </div>
        )}

        {/* Trend Validation Info — only shown when validation_mode exists */}
        {isTrendSignal && configDisplay.validation_mode && (
          <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] mb-4">
            <p className="text-xs text-[#686868] dark:text-[#898989] font-semibold uppercase tracking-wider mb-3">Validasi Otomatis</p>
          <div className="flex flex-wrap gap-2 max-w-full">
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

            {/* Config editor */}
            {editingConfig ? (
              <div className="space-y-3">
                {/* Recommendation panel for grid */}
                {session.strategy === 'grid' && (
                  <div className="bg-[#fafafa] dark:bg-[#141411] rounded-[16px] p-4 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] space-y-3">
                    <p className="text-xs font-semibold text-[#686868] dark:text-[#898989]">Rekomendasi otomatis</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-[#686868] dark:text-[#898989] block mb-1">Horizon</label>
                        <select className="w-full px-2 py-1.5 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-xs text-[#0e0f0c] dark:text-[#e8ebe6]" value={editRecHorizon} onChange={e => setEditRecHorizon(e.target.value as any)}>
                          <option value="short">Pendek (±5-10%)</option>
                          <option value="medium">Menengah (±10-18%)</option>
                          <option value="long">Panjang (±15-25%)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-[#686868] dark:text-[#898989] block mb-1">Modal (USDT)</label>
                        <input type="number" className="w-full px-2 py-1.5 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-xs text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="100" value={editRecCapital} onChange={e => setEditRecCapital(e.target.value)} />
                      </div>
                      <div className="flex items-end">
                        <button type="button" onClick={fetchEditRec} disabled={editRecLoading} className="w-full px-3 py-1.5 bg-[#9fe870] text-[#163300] font-semibold hover:bg-[#cdffad] rounded-full text-xs transition disabled:opacity-50">
                          {editRecLoading ? '...' : 'Rekomendasikan'}
                        </button>
                      </div>
                    </div>
                    {editRec && (
                      <div className="bg-white dark:bg-[#1e201c] border-l-4 border-[#9fe870] rounded-[12px] p-3 text-xs space-y-1">
                        <p className="text-[#054d28] dark:text-[#9fe870] font-semibold">Diterapkan ke editor ↓</p>
                        <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Range: {editRec.LowerPrice?.toLocaleString()} — {editRec.UpperPrice?.toLocaleString()}</p>
                        <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Grid: {editRec.GridCount} level · Qty: {editRec.Quantity}</p>
                        <p className="text-[#686868] dark:text-[#898989] italic">{editRec.Reason}</p>
                      </div>
                    )}
                  </div>
                )}
                <textarea
                  value={editConfigValue}
                  onChange={e => setEditConfigValue(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-3 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[16px] text-xs font-mono text-[#0e0f0c] dark:text-[#e8ebe6] focus:outline-none focus:ring-2 focus:ring-[rgba(159,232,112,0.4)] resize-none"
                />
                {editConfigError && <p className="text-xs text-[#d03238]">{editConfigError}</p>}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEditConfig}
                    disabled={editConfigSaving || session.status === 'running'}
                    className="px-4 py-2 text-sm font-semibold bg-[#9fe870] text-[#163300] rounded-full hover:bg-[#cdffad] transition-all disabled:opacity-40"
                  >
                    {editConfigSaving ? 'Menyimpan...' : '✓ Simpan'}
                  </button>
                  <button
                    onClick={() => { setEditingConfig(false); setEditConfigError(''); setEditRec(null) }}
                    className="px-4 py-2 text-sm font-semibold bg-white dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] text-[#686868] dark:text-[#898989] rounded-full hover:text-[#d03238] transition-all"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#686868] dark:text-[#898989]">JSON Config</span>
                  <button
                    onClick={() => { setEditConfigValue(JSON.stringify(configDisplay, null, 2)); setEditingConfig(true); setEditConfigError('') }}
                    disabled={session.status === 'running'}
                    className="text-xs font-semibold text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] px-3 py-1 rounded-full border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] hover:border-[rgba(14,15,12,0.3)] transition-all disabled:opacity-0 disabled:pointer-events-none"
                  >
                    ✏️ Edit
                  </button>
                </div>
                <pre className="bg-[#f0f1ee] dark:bg-[#252822] p-3 rounded-[16px] text-xs text-[#5a5b58] dark:text-[#8a8d88] leading-relaxed">{JSON.stringify(configDisplay, null, 2)}</pre>
              </div>
            )}
          </div>
        </details>

        {/* Trend Status Card */}
        {(isTrendSignal || isTrendPaper) && trendStatus && trendStatus.cross_status !== 'unknown' && trendStatus.fast_sma != null && trendStatus.slow_sma != null && (() => {
          const st = trendStatus
          const isGolden = st.cross_status === 'golden'
          const barColor = isGolden ? 'bg-[#9fe870]' : st.cross_status === 'death' ? 'bg-[#ff6b6f]' : 'bg-[rgba(140,140,140,0.3)]'
          const labelColor = isGolden ? 'text-[#054d28] dark:text-[#9fe870]' : st.cross_status === 'death' ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#686868] dark:text-[#898989]'
          const crossLabel = isGolden ? '↑ Golden Cross' : st.cross_status === 'death' ? '↓ Death Cross' : '— Neutral'
          const smaGapPct = st.slow_sma !== 0 ? Math.abs((st.fast_sma! - st.slow_sma!) / st.slow_sma!) * 100 : null
          const hasPosition = st.holding_qty != null && st.holding_qty > 0
          const nextActionLabel = isGolden
            ? hasPosition ? '⏳ Menunggu Death Cross untuk JUAL' : '✓ Golden Cross — bot sudah BUY'
            : st.cross_status === 'death'
              ? !hasPosition ? '⏳ Menunggu Golden Cross untuk BELI' : '✓ Death Cross — bot sudah SELL'
              : '⏳ Menunggu crossover SMA'
          let cfg: any = {}
          try { cfg = JSON.parse(session!.config) } catch {}
          return (
            <div className="bg-white dark:bg-[#1e201c] rounded-[20px] p-4 border border-[rgba(56,200,255,0.15)] mb-4">
              <p className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wider mb-3">Status Tren Saat Ini</p>
              {/* Row 1: Sparkline + Price + Cross Status */}
              <div className="flex items-center gap-4 mb-2">
                {st.recent_prices && st.recent_prices.length > 0 && (
                  <div className="flex-shrink-0">
                    <TrendSparkline
                      prices={st.recent_prices}
                      fastSMA={st.recent_fast_sma || []}
                      slowSMA={st.recent_slow_sma || []}
                      width={100}
                      height={32}
                    />
                    <div className="flex justify-between text-[9px] mt-0.5 gap-2">
                      <span className="text-[#9fe870]">— SMA{cfg.fast_period || 10}</span>
                      <span className="text-[#ff6b6f]">— SMA{cfg.slow_period || 30}</span>
                    </div>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">
                      {st.current_price != null ? st.current_price.toFixed(st.current_price < 1 ? 8 : 2) : '-'}
                    </span>
                    <span className={`text-[10px] font-bold ${labelColor}`}>{crossLabel}</span>
                    {smaGapPct != null && (
                      <span className="text-[10px] text-[#686868] dark:text-[#898989]">gap {smaGapPct.toFixed(3)}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-[#9fe870] opacity-80">SMA{cfg.fast_period || 10} {st.fast_sma?.toFixed(8)}</span>
                    <span className="text-[10px] text-[#ff6b6f] opacity-80">SMA{cfg.slow_period || 30} {st.slow_sma?.toFixed(8)}</span>
                  </div>
                </div>
                {st.next_candle_eta && (
                  <div className="flex-shrink-0 flex items-center gap-1 text-[10px] text-[#686868] dark:text-[#898989]">
                    <Clock size={10} />
                    <span>{st.next_candle_eta}</span>
                  </div>
                )}
              </div>
              {/* Row 2: Next action */}
              <div className={`text-[10px] font-semibold px-2 py-1 rounded-lg mb-2 ${
                isGolden && hasPosition ? 'bg-[rgba(255,107,111,0.08)] text-[#d03238] dark:text-[#ff6b6f]' :
                isGolden ? 'bg-[rgba(159,232,112,0.08)] text-[#054d28] dark:text-[#9fe870]' :
                st.cross_status === 'death' && !hasPosition ? 'bg-[rgba(56,200,255,0.08)] text-[#0994b3] dark:text-[#5dd8f5]' :
                'bg-[rgba(140,140,140,0.08)] text-[#686868] dark:text-[#898989]'
              }`}>
                {nextActionLabel}
              </div>
              {/* Row 3: Price position bar */}
              <div className="mb-2">
                <div className="flex justify-between text-[9px] text-[#686868] dark:text-[#898989] mb-1">
                  <span>SMA cepat {'<'} lambat</span>
                  <span>posisi harga</span>
                  <span>SMA cepat {'>'} lambat</span>
                </div>
                <div className="relative h-2 bg-[#f0f1ee] dark:bg-[#252822] rounded-full overflow-hidden">
                  <div className={`absolute inset-0 rounded-full ${barColor} opacity-20`} />
                  <div className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-[#1e201c] shadow-sm transition-all" style={{
                    left: `${Math.min(100, Math.max(0, st.price_position_pct ?? 0))}%`,
                    background: isGolden ? '#9fe870' : st.cross_status === 'death' ? '#ff6b6f' : 'rgba(140,140,140,0.5)',
                    transform: 'translate(-50%, -50%)',
                  }} />
                </div>
              </div>
              {/* Row 4: Holding + signals */}
              <div className="flex items-center gap-3 text-[10px] flex-wrap">
                {hasPosition ? (
                  <span className="flex items-center gap-1 text-[#686868] dark:text-[#898989]">
                    <Wallet size={10} />
                    Hold {st.holding_qty!.toFixed(4)} (${st.holding_value?.toFixed(2)})
                    {st.unrealized_pnl != null && (
                      <span className={`font-semibold ${st.unrealized_pnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                        {st.unrealized_pnl >= 0 ? '+' : ''}{st.unrealized_pnl_pct?.toFixed(2)}%
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[#686868] dark:text-[#898989]">
                    <Wallet size={10} /> Cash — menunggu sinyal beli
                  </span>
                )}
                {st.last_signal_type && (
                  <span className={`font-semibold ${st.last_signal_result != null && st.last_signal_result >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                    Last {st.last_signal_type === 'buy' ? '▲ Buy' : '▼ Sell'}{st.last_signal_result != null ? ` ${st.last_signal_result >= 0 ? '+' : ''}${st.last_signal_result.toFixed(2)}%` : ''}
                  </span>
                )}
                {st.signal_history && st.signal_history.length > 1 && (
                  <span className="flex items-center gap-1 text-[#686868] dark:text-[#898989]">
                    <History size={10} />
                    {st.signal_history.slice(1, 5).map((sig, i) => (
                      <span key={i} className={sig.result_pct != null && sig.result_pct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}>
                        {sig.side === 'buy' ? '▲' : '▼'}{sig.result_pct != null ? `${sig.result_pct >= 0 ? '+' : ''}${sig.result_pct.toFixed(1)}%` : '?'}
                        {i < Math.min(st.signal_history!.length - 2, 3) ? ' ' : ''}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          )
        })()}

        {/* Grid Level Visual */}
        {(isGridSignal || isGridPaper) && strategySignals && Object.keys(signalsByLevel).length > 0 && (
          <details className="mb-8 group">
            <summary className="flex items-center gap-2 mb-3 cursor-pointer select-none">
              <span className="text-xs transition-transform group-open:rotate-90 inline-block text-[#686868] dark:text-[#898989]">›</span>
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Grid Levels</h2>
            </summary>
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
          </details>
        )}

        {(isStrategySignal && signalSummary && signalSummary.total_count > 0) || (isStrategySignal && strategySignals && strategySignals.length > 0) ? (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">
                {isTrendSignal ? 'Sinyal Trend' : 'Sinyal Grid'}
              </h2>
              <div className="flex items-center gap-1 bg-[#f0f1ee] dark:bg-[#252822] rounded-full p-0.5">
                {signalSummary && signalSummary.total_count > 0 && (
                  <button onClick={() => setSignalView('summary')} className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${signalView === 'summary' ? 'bg-white dark:bg-[#1e201c] text-[#0e0f0c] dark:text-[#e8ebe6] shadow-sm' : 'text-[#686868] dark:text-[#898989]'}`}>Summary</button>
                )}
                <button onClick={() => setSignalView('timeline')} className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${signalView === 'timeline' ? 'bg-white dark:bg-[#1e201c] text-[#0e0f0c] dark:text-[#e8ebe6] shadow-sm' : 'text-[#686868] dark:text-[#898989]'}`}>Timeline</button>
                <button onClick={() => setSignalView('table')} className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${signalView === 'table' ? 'bg-white dark:bg-[#1e201c] text-[#0e0f0c] dark:text-[#e8ebe6] shadow-sm' : 'text-[#686868] dark:text-[#898989]'}`}>Tabel</button>
              </div>
            </div>

            {signalView === 'summary' && signalSummary && signalSummary.total_count > 0 && (
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
            )}

            {signalView === 'timeline' && strategySignals && (
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
                            {isTrendSignal && <span className="text-xs text-[#686868] dark:text-[#898989]">{s.reason === 'golden_cross' ? <><Star size={12} className="inline mr-1 text-[#ffd11a]" />Golden Cross</> : s.reason === 'death_cross' ? <><Skull size={12} className="inline mr-1 text-[#d03238] dark:text-[#ff6b6f]" />Death Cross</> : s.reason}</span>}
                            <span className="text-xs font-mono text-[#0e0f0c] dark:text-[#e8ebe6]">{fmt(parseFloat(s.grid_level_price))}</span>
                            {s.validation_status === 'confirmed' && s.result_pct != null && (
                              <span className={`text-xs font-semibold ${s.result_pct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                {s.result_pct >= 0 ? '+' : ''}{s.result_pct.toFixed(2)}%
                              </span>
                            )}
                            {s.validation_status === 'pending' && <span className="text-[10px] font-semibold bg-[rgba(255,209,26,0.15)] dark:bg-[rgba(255,209,26,0.2)] text-[#7a5f00] dark:text-[#f5c842] px-1.5 py-0.5 rounded-full animate-pulse"><Loader size={10} className="inline mr-1 animate-spin" />menunggu</span>}
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
            )}

            {signalView === 'table' && strategySignals && (
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] overflow-hidden border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] relative">
                <div className="overflow-x-auto relative">
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
                              ? (s.reason === 'golden_cross' ? <><Star size={12} className="inline mr-1 text-[#ffd11a]" />Golden</> : s.reason === 'death_cross' ? <><Skull size={12} className="inline mr-1 text-[#d03238] dark:text-[#ff6b6f]" />Death</> : s.reason)
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
                              {s.validation_status === 'confirmed' ? '✓ confirmed' : s.validation_status === 'invalidated' ? '✗ invalid' : s.validation_status === 'pending' ? <><Loader size={10} className="inline mr-1 animate-spin" />pending</> : 'expired'}
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
                <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white dark:from-[#1e201c] to-transparent pointer-events-none rounded-r-[24px]" />
              </div>
            )}
          </div>
        ) : null}

        {/* Orders Table — hidden when strategy signal history is shown */}
        {!isStrategySignal && (
          <>
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">
              {isPaperMode ? 'Riwayat Order Virtual' : 'Riwayat Order'}
            </h2>
            {ordersLoading ? (
              <div className="flex items-center gap-2 text-[#686868] dark:text-[#898989] animate-pulse py-4">
                <span className="w-2 h-2 rounded-full bg-[#9fe870]" />
                <span className="text-sm">Memuat orders...</span>
              </div>
            ) : !ordersFetched || !allOrders.length ? (
              <div className="flex flex-col items-center gap-3 py-8 text-sm">
                <p className="text-[#686868] dark:text-[#898989]">Belum ada order.</p>
                {session.status !== 'running' && (
                  <button onClick={handleStart} className="px-5 py-2 text-sm font-bold bg-[#9fe870] text-[#163300] rounded-full hover:bg-[#cdffad] transition-all">
                    Mulai Bot Sekarang
                  </button>
                )}
                {session.status === 'running' && (
                  <p className="text-[#686868] dark:text-[#898989]">Bot sedang berjalan. Order akan muncul saat sinyal tereksekusi.</p>
                )}
              </div>
            ) : (
              <>
              <div className="bg-white dark:bg-[#1e201c] rounded-[24px] overflow-hidden border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] mb-6 relative">
                <div className="overflow-x-auto relative">
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
                      {allOrders.map(o => (
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
                <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white dark:from-[#1e201c] to-transparent pointer-events-none rounded-r-[24px]" />
              </div>
              {hasMoreOrders && (
                <div className="flex justify-center mt-3 mb-6">
                  <button
                    onClick={() => fetchOrders(orderCursor)}
                    disabled={ordersLoading}
                    className="px-5 py-2 text-sm font-semibold bg-[#f0f1ee] dark:bg-[#252822] text-[#0e0f0c] dark:text-[#e8ebe6] rounded-full hover:bg-[#e0e2de] dark:hover:bg-[#2a2c27] transition-all disabled:opacity-50"
                  >
                    {ordersLoading ? 'Memuat...' : 'Muat lebih banyak'}
                  </button>
                </div>
              )}
              </>
            )}
          </>
        )}

      </div>
    </div>
  )
}
