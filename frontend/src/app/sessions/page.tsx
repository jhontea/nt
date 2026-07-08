'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { HelpIcon } from '@/components/HelpIcon'
import { PriceBadge } from '@/components/PriceBadge'
import { Navbar } from '@/components/Navbar'

const PAIRS = [
  'BTC_USDT', 'ETH_USDT', 'BNB_USDT', 'SOL_USDT', 'XRP_USDT',
  'ADA_USDT', 'DOGE_USDT', 'DOT_USDT', 'AVAX_USDT', 'MATIC_USDT',
  'LINK_USDT', 'UNI_USDT', 'ATOM_USDT', 'LTC_USDT', 'BCH_USDT',
  'BTC_IDR', 'ETH_IDR', 'BNB_IDR', 'SOL_IDR', 'USDT_IDR',
]

const modeHelp: Record<string, string> = {
  signal: 'Bot hanya menganalisis pasar dan mencatat sinyal beli/jual. Tidak ada order sungguhan. Cocok untuk belajar.',
  paper: 'Bot melakukan trading simulasi dengan uang virtual $1000. Hasil trading dicatat sebagai profit/loss virtual.',
  live: 'Bot melakukan trading sungguhan menggunakan akun TokoCrypto Anda. RISIKO TINGGI — gunakan dengan hati-hati.',
}

const strategyHelp: Record<string, string> = {
  grid: 'Pasang order beli dan jual di level harga yang sudah ditentukan. Bot akan beli di harga rendah dan jual di harga tinggi secara otomatis.',
  trend: 'Bot mendeteksi tren pasar menggunakan SMA (Simple Moving Average). Golden cross = beli, death cross = jual.',
  dca: 'Dollar Cost Averaging — beli aset secara berkala dalam jumlah tetap. Otomatis jual saat harga naik ke target profit.',
}

const fieldHelp: Record<string, { short: string; long: string }> = {
  upper_price: {
    short: 'Batas harga tertinggi. Bot akan jual di level ini.',
    long: 'Harga tertinggi yang ingin Anda jangkau. Bot akan memasang order jual di level-level mendekati harga ini. Makin lebar jarak atas-bawah, makin besar potensi profit tapi order lebih jarang terisi. Disarankan 10-20% di atas harga pasar saat ini.',
  },
  lower_price: {
    short: 'Batas harga terendah. Bot akan beli di level ini.',
    long: 'Harga terendah yang ingin Anda jangkau. Bot akan memasang order beli di level-level mendekati harga ini. Disarankan 10-20% di bawah harga pasar saat ini.',
  },
  grid_count: {
    short: 'Jumlah level harga antara batas atas dan bawah.',
    long: 'Makin banyak grid = makin rapat order = potensi profit lebih sering tapi lebih kecil per order. 5-10 grid cukup untuk pemula.',
  },
  quantity: {
    short: 'Jumlah aset per order.',
    long: 'Untuk grid: jumlah aset yang dibeli/dijual setiap kali order terisi. Contoh: 0.001 BTC. Untuk trend: jumlah per sinyal. Sesuaikan dengan modal Anda.',
  },
  fast_period: {
    short: 'Periode SMA cepat — lebih sensitif terhadap harga terbaru.',
    long: 'SMA Cepat (fast period) bereaksi lebih cepat terhadap perubahan harga. Nilai kecil (5-10) = lebih sering dapat sinyal tapi lebih banyak false signal. Nilai besar (15-20) = lebih selektif.',
  },
  slow_period: {
    short: 'Periode SMA lambat — melihat tren jangka panjang.',
    long: 'SMA Lambat (slow period) lebih stabil dan menunjukkan tren jangka panjang. Harus lebih besar dari SMA cepat. Disarankan 2-3x dari fast period. Contoh: fast=10, slow=30.',
  },
  dca_interval: {
    short: 'Frekuensi pembelian rutin.',
    long: 'Makin sering = harga rata-rata lebih halus, cocok untuk pasar volatile. Makin jarang = lebih cocok untuk tren naik jangka panjang.',
  },
  dca_amount: {
    short: 'Jumlah USDT yang dibelikan setiap interval.',
    long: 'Contoh: 10 berarti bot akan membeli $10 worth of asset setiap interval. Sesuaikan dengan modal. Jangan terlalu besar agar tidak cepat habis.',
  },
  dca_take_profit: {
    short: 'Persentase kenaikan harga untuk menjual.',
    long: '5 = jual otomatis saat harga naik 5% dari rata-rata harga beli. 0 = nonaktifkan take profit (hold terus). Disarankan 3-10%.',
  },
}

const DEFAULT_BOUNDARY_PCT = 15 // ±15% around current price

function calcGridDefaults(price: number) {
  const upper = Math.round(price * (1 + DEFAULT_BOUNDARY_PCT / 100))
  const lower = Math.round(price * (1 - DEFAULT_BOUNDARY_PCT / 100))
  return { upper: String(upper), lower: String(lower) }
}


function OverviewPanel({ sessions, onFilterChange }: {
  sessions: import('@/types').Session[]
  onFilterChange: (f: 'all' | 'grid' | 'trend' | 'dca') => void
}) {
  const strategies = [
    { key: 'grid' as const, label: 'Grid', icon: '📐', color: 'rgba(159,232,112,0.12)', textColor: 'text-[#163300] dark:text-[#9fe870]', borderColor: 'border-[rgba(159,232,112,0.25)]' },
    { key: 'trend' as const, label: 'Trend', icon: '📈', color: 'rgba(56,200,255,0.1)', textColor: 'text-[#0994b3] dark:text-[#5dd8f5]', borderColor: 'border-[rgba(56,200,255,0.2)]' },
    { key: 'dca' as const, label: 'DCA', icon: '🪙', color: 'rgba(255,209,26,0.1)', textColor: 'text-[#7a5f00] dark:text-[#f5c842]', borderColor: 'border-[rgba(255,209,26,0.2)]' },
  ]

  return (
    <div className="mb-6">
      <h2 className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest mb-3">Overview per Strategi</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {strategies.map(strat => {
          const stratSessions = sessions.filter(s => s.strategy === strat.key)
          if (stratSessions.length === 0) return null
          const running = stratSessions.filter(s => s.status === 'running').length
          const paperSessions = stratSessions.filter(s => s.mode === 'paper')
          const signalSessions = stratSessions.filter(s => s.mode === 'signal')
          const bestBalance = paperSessions.reduce((best, s) => {
            const bal = s.virtual_balance ?? 0
            return bal > best ? bal : best
          }, 0)
          const bestInitial = paperSessions.find(s => (s.virtual_balance ?? 0) === bestBalance)?.initial_balance ?? 1000
          const bestPct = bestInitial > 0 ? ((bestBalance - bestInitial) / bestInitial) * 100 : 0

          return (
            <button
              key={strat.key}
              onClick={() => onFilterChange(strat.key)}
              className={`bg-white dark:bg-[#1e201c] rounded-[20px] p-4 text-left border ${strat.borderColor} hover:shadow-[0_4px_16px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center text-base`} style={{ background: strat.color }}>
                    {strat.icon}
                  </span>
                  <span className={`text-sm font-bold ${strat.textColor}`}>{strat.label}</span>
                </div>
                {running > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[#9fe870]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />
                    {running} running
                  </span>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div>
                  <p className="text-[#686868] dark:text-[#898989]">Total</p>
                  <p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{stratSessions.length}</p>
                </div>
                <div>
                  <p className="text-[#686868] dark:text-[#898989]">Paper</p>
                  <p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{paperSessions.length}</p>
                </div>
                <div>
                  <p className="text-[#686868] dark:text-[#898989]">Signal</p>
                  <p className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{signalSessions.length}</p>
                </div>
              </div>

              {/* Best paper balance */}
              {paperSessions.length > 0 && bestBalance > 0 && (
                <div className="border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] pt-2.5">
                  <p className="text-[10px] text-[#686868] dark:text-[#898989] mb-1">Best Paper Balance</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-[#0e0f0c] dark:text-[#e8ebe6]">${bestBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className={`text-[10px] font-bold ${bestPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                      {bestPct >= 0 ? '+' : ''}{bestPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}

              <p className={`text-[10px] font-semibold mt-2.5 ${strat.textColor}`}>Lihat {strat.label} →</p>
            </button>
          )
        }).filter(Boolean)}
      </div>
    </div>
  )
}

function StrategyInsightRow({ sessions, activeFilter }: {
  sessions: import('@/types').Session[]
  activeFilter: 'grid' | 'trend' | 'dca'
}) {
  const stratSessions = sessions.filter(s => s.strategy === activeFilter)
  const paperSessions = stratSessions.filter(s => s.mode === 'paper')
  const signalSessions = stratSessions.filter(s => s.mode === 'signal')
  const running = stratSessions.filter(s => s.status === 'running')
  const paperRunning = paperSessions.filter(s => s.status === 'running')

  const avgBalance = paperSessions.length > 0
    ? paperSessions.reduce((sum, s) => sum + (s.virtual_balance ?? 0), 0) / paperSessions.length
    : null

  const avgInitial = paperSessions.length > 0
    ? paperSessions.reduce((sum, s) => sum + (s.initial_balance ?? 1000), 0) / paperSessions.length
    : 1000

  const avgPct = avgBalance !== null && avgInitial > 0
    ? ((avgBalance - avgInitial) / avgInitial) * 100
    : null

  const strategyName = activeFilter === 'grid' ? 'Grid Trading' : activeFilter === 'trend' ? 'Trend Following' : 'DCA'

  return (
    <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-6 flex flex-wrap items-center gap-4">
      <span className="text-xs font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest">{strategyName}</span>
      <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)]" />
      <div className="flex flex-wrap gap-4 text-xs">
        <span><span className="text-[#686868] dark:text-[#898989]">Total </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{stratSessions.length}</span></span>
        <span><span className="text-[#686868] dark:text-[#898989]">Running </span><span className="font-bold text-[#9fe870]">{running.length}</span></span>
        <span><span className="text-[#686868] dark:text-[#898989]">Paper </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{paperSessions.length}</span>{paperRunning.length > 0 && <span className="text-[#9fe870] ml-1">({paperRunning.length} running)</span>}</span>
        <span><span className="text-[#686868] dark:text-[#898989]">Signal </span><span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{signalSessions.length}</span></span>
        {avgBalance !== null && avgPct !== null && (
          <span>
            <span className="text-[#686868] dark:text-[#898989]">Avg balance </span>
            <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">${avgBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span className={`ml-1 font-semibold ${avgPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
              {avgPct >= 0 ? '+' : ''}{avgPct.toFixed(1)}%
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

function StatsRow({
  stats, activeFilter, onFilterChange
}: {
  stats: { all: { total: number; running: number }; grid: { total: number; running: number }; trend: { total: number; running: number }; dca: { total: number; running: number } }
  activeFilter: 'all' | 'grid' | 'trend' | 'dca'
  onFilterChange: (filter: 'all' | 'grid' | 'trend' | 'dca') => void
}) {
  const filters = [
    { key: 'all' as const, label: 'All', icon: '🤖' },
    { key: 'grid' as const, label: 'Grid', icon: '📐' },
    { key: 'trend' as const, label: 'Trend', icon: '📈' },
    { key: 'dca' as const, label: 'DCA', icon: '🪙' }
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      {filters.map(f => {
        const isActive = activeFilter === f.key
        const stat = stats[f.key]
        const hasRunning = stat.running > 0
        return (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={`relative bg-white dark:bg-[#1e201c] rounded-[16px] p-3 text-left transition-all border-2 ${
              isActive
                ? 'border-[#9fe870] bg-gradient-to-br from-[rgba(159,232,112,0.08)] to-transparent dark:from-[rgba(159,232,112,0.12)] shadow-[0_4px_16px_rgba(159,232,112,0.2)]'
                : hasRunning && f.key !== 'all'
                ? 'border-[rgba(159,232,112,0.35)] dark:border-[rgba(159,232,112,0.3)] hover:border-[rgba(159,232,112,0.5)]'
                : 'border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)]'
            }`}
          >
            {/* Running pulse dot — top right */}
            {hasRunning && (
              <span className="absolute top-3 right-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />
                <span className="text-[10px] font-bold text-[#9fe870] hidden sm:inline">{stat.running}</span>
              </span>
            )}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{f.icon}</span>
              <span className={`text-base font-bold ${isActive ? 'text-[#163300] dark:text-[#9fe870]' : 'text-[#0e0f0c] dark:text-[#e8ebe6]'}`}>
                {f.label}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black ${isActive ? 'text-[#163300] dark:text-[#9fe870]' : 'text-[#0e0f0c] dark:text-[#e8ebe6]'}`}>
                {stat.total}
              </span>
              <span className="text-xs text-[#686868] dark:text-[#898989]">
                total
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function SessionsPage() {
  const { logout, isAuthenticated, initialized } = useAuth()
  const router = useRouter()

  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.sessions.list,
    enabled: isAuthenticated,
  })

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [strategy, setStrategy] = useState<'grid' | 'trend' | 'dca'>('grid')
  const [mode, setMode] = useState<'signal' | 'paper' | 'live'>('signal')
  const [symbol, setSymbol] = useState('BTC_USDT')
  const [upperPrice, setUpperPrice] = useState('')
  const [lowerPrice, setLowerPrice] = useState('')
  const [gridCount, setGridCount] = useState('10')
  const [quantity, setQuantity] = useState('0.001')
const [fastPeriod, setFastPeriod] = useState('10')
const [slowPeriod, setSlowPeriod] = useState('30')
const [trendInterval, setTrendInterval] = useState<'5m' | '15m' | '1h' | '4h'>('5m')
  const [dcaInterval, setDcaInterval] = useState('3600')
  const [dcaAmount, setDcaAmount] = useState('10')
  const [dcaTakeProfit, setDcaTakeProfit] = useState('5')
  const [initialBalance, setInitialBalance] = useState('1000')
  const [stopLossPct, setStopLossPct] = useState('')
  const [takeProfitPct, setTakeProfitPct] = useState('')
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState('')
  const [isBeginner, setIsBeginner] = useState(true)
  const [horizon, setHorizon] = useState<'short' | 'medium' | 'long'>('medium')
  const [capital, setCapital] = useState('100')
  const [validationMode, setValidationMode] = useState<'grid_steps' | 'percent'>('grid_steps')
  const [recommendation, setRecommendation] = useState<any>(null)
  const [insights, setInsights] = useState<any[]>([])
  const [nameEdited, setNameEdited] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'all' | 'grid' | 'trend' | 'dca'>('all')
  const [creating, setCreating] = useState(false)

  const stats = sessions ? {
    all: { total: sessions.length, running: sessions.filter(s => s.status === 'running').length },
    grid: { total: sessions.filter(s => s.strategy === 'grid').length, running: sessions.filter(s => s.strategy === 'grid' && s.status === 'running').length },
    trend: { total: sessions.filter(s => s.strategy === 'trend').length, running: sessions.filter(s => s.strategy === 'trend' && s.status === 'running').length },
    dca: { total: sessions.filter(s => s.strategy === 'dca').length, running: sessions.filter(s => s.strategy === 'dca' && s.status === 'running').length },
  } : { all: { total: 0, running: 0 }, grid: { total: 0, running: 0 }, trend: { total: 0, running: 0 }, dca: { total: 0, running: 0 } }

  const filteredSessions = sessions?.filter(s =>
    activeFilter === 'all' ? true : s.strategy === activeFilter
  )

  // Auto-generate session name when strategy/mode/symbol changes
  useEffect(() => {
    if (nameEdited) return
    const date = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    const stratLabel = strategy === 'grid' ? 'Grid' : strategy === 'trend' ? 'Trend' : 'DCA'
    const modeLabel = mode === 'signal' ? 'Signal' : mode === 'paper' ? 'Paper' : 'Live'
    const sym = symbol.replace('_', '/')
    setName(`${stratLabel} ${modeLabel} ${sym} ${date}`)
  }, [strategy, mode, symbol, nameEdited])

  async function fetchPriceAndApply(sym: string) {
    if (!sym) return
    setPriceLoading(true)
    setPriceError('')
    try {
      const ticker = await api.sessions.getTicker(sym)
      const price = parseFloat(ticker.lastPrice)
      if (!isNaN(price) && price > 0) {
        setCurrentPrice(price)
        // Auto-calculate grid boundaries from live price
        const { upper, lower } = calcGridDefaults(price)
        setUpperPrice(upper)
        setLowerPrice(lower)
        setPriceLoading(false)
        return price
      }
    } catch (e: any) {
      setPriceError('Gagal ambil harga: ' + (e.message || ''))
    }
    setPriceLoading(false)
  }

async function fetchRecommendation(strat?: string) {
	const s = strat ?? strategy
	if (s === 'grid') {
	  try {
		const rec = await api.grid.recommend({ symbol, horizon, capital: parseFloat(capital) || 100, validation_mode: validationMode })
		setRecommendation(rec)
		setUpperPrice(String(rec.UpperPrice))
		setLowerPrice(String(rec.LowerPrice))
		setGridCount(String(rec.GridCount))
		setQuantity(rec.Quantity)
		const hist = await api.grid.insights(symbol)
		setInsights(hist || [])
	  } catch { /* ignore */ }
	} else if (s === 'trend') {
	  try {
		const rec = await api.trend.recommend({ symbol, horizon, capital: parseFloat(capital) || 100 })
		setRecommendation(rec)
		setFastPeriod(String(rec.fast_period))
		setSlowPeriod(String(rec.slow_period))
		setQuantity(rec.quantity)
		setTrendInterval(rec.interval as '5m' | '15m' | '1h' | '4h')
	  } catch { /* ignore */ }
	}
  }

  // Fetch price when form opens or pair changes
  useEffect(() => {
    if (!showCreate) {
      setCurrentPrice(null)
      setPriceError('')
      setRecommendation(null)
      return
    }
fetchPriceAndApply(symbol)
	if (strategy === 'grid' || strategy === 'trend') setTimeout(() => fetchRecommendation(strategy), 300)
  }, [showCreate, symbol, strategy])



  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    try {
      let config: any
      if (strategy === 'grid') {
        config = { upper_price: parseFloat(upperPrice), lower_price: parseFloat(lowerPrice), grid_count: parseInt(gridCount), quantity }
        if (isBeginner) {
          config.validation_mode = validationMode
          config.validation_target_value = recommendation?.ValidationTargetValue || 2
          config.validation_invalid_value = recommendation?.ValidationInvalidValue || 1
          config.validation_window_minutes = recommendation?.ValidationWindowMinutes || 120
        }
      } else if (strategy === 'trend') {
        config = { fast_period: parseInt(fastPeriod), slow_period: parseInt(slowPeriod), interval: trendInterval, quantity }
        if (isBeginner && recommendation) {
          config.validation_mode = 'percent'
          config.validation_target_value = recommendation.validation_target_value || 2
          config.validation_invalid_value = recommendation.validation_invalid_value || 1
          config.validation_window_minutes = recommendation.validation_window_minutes || 120
          config.capital = parseFloat(capital) || 0
          config.horizon = horizon
        }
      } else {
        config = { interval_sec: parseInt(dcaInterval), amount: parseFloat(dcaAmount), take_profit_pct: parseFloat(dcaTakeProfit) || 0 }
      }
      await api.sessions.create({ name: name || `${strategy}-${symbol}`, strategy, mode, symbol, config: JSON.stringify({
        ...config,
        ...(mode === 'paper' && stopLossPct ? { stop_loss_pct: parseFloat(stopLossPct) } : {}),
        ...(mode === 'paper' && takeProfitPct ? { take_profit_pct: parseFloat(takeProfitPct) } : {}),
      }), ...(mode === 'paper' ? { initial_balance: parseFloat(initialBalance) || 1000 } : {}) })
      setShowCreate(false)
      setNameEdited(false)
      refetch()
    } finally {
      setCreating(false)
    }
  }

  async function handleStart(id: number) {
    await api.sessions.start(id)
    refetch()
  }

  async function handleStop(id: number) {
    await api.sessions.stop(id)
    refetch()
  }

  async function handleDelete(id: number) {
    if (!confirm('Hapus session ini? Data sinyal dan order akan hilang permanen.')) return
    await api.sessions.delete(id)
    refetch()
  }

  function renderConfigHelp(key: string) {
    const h = fieldHelp[key]
    if (!h) return null
    return <HelpIcon text={`${h.short}\n\n${h.long}`} />
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Page header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Sessions</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">
              {sessions?.length
                ? <>{stats.all.total} session{stats.all.total !== 1 ? 's' : ''}{stats.all.running > 0 ? <> · <span className="text-[#9fe870] font-semibold">{stats.all.running} running</span></> : ''}</>
                : 'Bot trading otomatis Anda'
              }
            </p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} aria-expanded={showCreate} className="px-5 py-3 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] hover:scale-[1.03] active:scale-[0.97] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)]">
            {showCreate ? '✕ Tutup' : '+ New Session'}
          </button>
        </div>

        {/* Market Ticker */}
        <div className="relative flex items-center gap-3 bg-white dark:bg-[#1e201c] rounded-[24px] px-5 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-8 overflow-x-auto shadow-[0_1px_4px_rgba(14,15,12,0.04)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
          <span className="text-[10px] font-bold text-[#9fe870] tracking-widest uppercase flex-shrink-0 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-[#9fe870] animate-pulse" />
            Live
          </span>
          <div className="w-px h-4 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)] flex-shrink-0" />
          <div className="flex gap-5">
            <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">BTC</span><PriceBadge symbol="BTC_USDT" compact /></div>
            <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
            <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">ETH</span><PriceBadge symbol="ETH_USDT" compact /></div>
            <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
            <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">BNB</span><PriceBadge symbol="BNB_USDT" compact /></div>
            <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
            <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">SOL</span><PriceBadge symbol="SOL_USDT" compact /></div>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-[#1e201c] to-transparent rounded-r-[24px] pointer-events-none" />
        </div>

        {/* Stats Row */}
        <StatsRow stats={stats} activeFilter={activeFilter} onFilterChange={setActiveFilter} />

        {/* Overview Panel — shown when filter is 'all' and sessions exist */}
        {!showCreate && activeFilter === 'all' && sessions && sessions.length > 0 && (
          <OverviewPanel sessions={sessions} onFilterChange={setActiveFilter} />
        )}

        {/* Strategy Insight Row — shown when a specific strategy filter is active */}
        {!showCreate && activeFilter !== 'all' && sessions && sessions.length > 0 && (
          <StrategyInsightRow sessions={sessions} activeFilter={activeFilter} />
        )}

        {/* Form panel — slide-down, full width, max-w-3xl */}
        {showCreate && (
          <div className="mb-8 rounded-[24px] bg-white dark:bg-[#1e201c] shadow-[0_0_0_1px_rgba(14,15,12,0.08),0_8px_32px_rgba(14,15,12,0.06)] dark:shadow-[0_0_0_1px_rgba(232,235,230,0.1),0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden border-t-[3px] border-t-[#9fe870]">
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-black text-xl text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">New Session</h2>
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-0.5">Konfigurasi bot trading baru</p>
                </div>
                <button type="button" onClick={() => { setShowCreate(false); setNameEdited(false) }} className="w-10 h-10 flex items-center justify-center text-[#686868] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.08)] rounded-full transition">✕</button>
              </div>

              {/* Info harga saat ini */}
              {priceLoading && (
                <div className="bg-[#f0f1ee] dark:bg-[#252822] rounded-[10px] px-4 py-3 text-sm flex items-center gap-2.5 animate-pulse">
                  <span className="w-3 h-3 rounded-full bg-[#9fe870] flex-shrink-0" />
                  <span className="text-[#686868] dark:text-[#898989]">Mengambil harga {symbol}...</span>
                </div>
              )}
              {currentPrice && !priceLoading && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-[rgba(159,232,112,0.06)] border border-[rgba(159,232,112,0.2)] rounded-[10px] text-sm flex-wrap">
                  <span className="text-xs font-bold text-[#9fe870] uppercase tracking-widest flex-shrink-0">Live</span>
                  <span className="text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold">{currentPrice.toLocaleString()}</span>
                  <span className="text-xs text-[#5a5b58] dark:text-[#8a8d88]">{symbol}</span>
                  {strategy === 'grid' && lowerPrice && upperPrice && (
                    <span className="text-xs text-[#686868] ml-auto">
                      Grid: <span className="text-[#163300] dark:text-[#9fe870] font-medium">{parseInt(lowerPrice).toLocaleString()}</span>
                      {' — '}
                      <span className="text-[#163300] dark:text-[#9fe870] font-medium">{parseInt(upperPrice).toLocaleString()}</span>
                      <span className="text-[#686868] dark:text-[#898989]"> (±{DEFAULT_BOUNDARY_PCT}%)</span>
                    </span>
                  )}
                </div>
              )}
              {priceError && (
                <div className="bg-[rgba(208,50,56,0.06)] dark:bg-[rgba(208,50,56,0.1)] border border-[rgba(208,50,56,0.15)] dark:border-[rgba(208,50,56,0.2)] rounded-[10px] p-3 text-sm text-[#d03238]">
                  {priceError} <span className="text-[#5a5b58] dark:text-[#8a8d88]">— isi manual atau coba pair lain</span>
                </div>
              )}

              {/* Main fields — 2 column grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="session-name" className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Nama Session <HelpIcon text="Nama bebas untuk membedakan session satu dengan lainnya" /></label>
                  <input id="session-name" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="mis. Grid Signal BTC/USDT 07 Jul" value={name} onChange={e => { setNameEdited(true); setName(e.target.value) }} />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Pair <HelpIcon text="Pilih pair crypto yang akan di-tradingkan" /></label>
                  <select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" value={symbol} onChange={e => setSymbol(e.target.value)}>
                    <optgroup label="USDT Pairs">
                      {PAIRS.filter(p => p.endsWith('_USDT')).map(p => <option key={p} value={p}>{p}</option>)}
                    </optgroup>
                    <optgroup label="IDR Pairs">
                      {PAIRS.filter(p => p.endsWith('_IDR')).map(p => <option key={p} value={p}>{p}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Strategi <HelpIcon text={strategyHelp[strategy]} /></label>
                  <select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" value={strategy} onChange={e => setStrategy(e.target.value as any)}>
                    <option value="grid">📐 Grid Trading — beli & jual di level harga</option>
                    <option value="trend">📈 Trend Following — SMA crossover</option>
                    <option value="dca">🪙 DCA — beli rutin berkala (Dollar Cost Average)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Mode <HelpIcon text={modeHelp[mode]} /></label>
                  <select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" value={mode} onChange={e => setMode(e.target.value as any)}>
                    <option value="signal">📊 Signal — sinyal saja, tanpa eksekusi</option>
                  <option value="paper">📝 Paper — trading simulasi (uang virtual)</option>
                    <option value="live">⚡ Live — trading sungguhan (RISIKO TINGGI)</option>
                  </select>
                </div>
              </div>

              {mode === 'paper' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Modal Virtual (USDT)</label>
                    <input type="number" min="1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="1000" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Stop Loss % <span className="text-[#686868] dark:text-[#898989] font-normal text-xs">(opsional)</span></label>
                      <input type="number" min="0" max="100" step="0.1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(208,50,56,0.4)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="mis. 10" value={stopLossPct} onChange={e => setStopLossPct(e.target.value)} />
                      <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Stop jika total value turun {stopLossPct ? stopLossPct : 'X'}% dari modal</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Take Profit % <span className="text-[#686868] dark:text-[#898989] font-normal text-xs">(opsional)</span></label>
                      <input type="number" min="0" max="1000" step="0.1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="mis. 20" value={takeProfitPct} onChange={e => setTakeProfitPct(e.target.value)} />
                      <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Stop jika total value naik {takeProfitPct ? takeProfitPct : 'Y'}% dari modal</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Strategy-specific config */}
              {strategy === 'grid' ? (
            <>
              {/* Beginner / Advanced Toggle */}

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#686868] dark:text-[#898989] font-medium">Mode:</label>
                <button type="button"
                  onClick={() => { setIsBeginner(true); fetchRecommendation() }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${isBeginner ? 'bg-[#9fe870] text-[#163300]' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                  🎓 Pemula
                </button>
                <button type="button"
                  onClick={() => setIsBeginner(false)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${!isBeginner ? 'bg-[#9fe870] text-[#163300]' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                  ⚙️ Manual
                </button>
              </div>

              {/* Beginner Controls */}
              {isBeginner && (
                <div className="bg-[#f0f1ee] dark:bg-[#252822] rounded-[16px] p-4 space-y-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#686868] dark:text-[#898989] font-medium block mb-1">Horizon</label>
                      <select className="w-full px-2 py-1.5 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-sm text-[#0e0f0c] dark:text-[#e8ebe6]" value={horizon} onChange={e => { setHorizon(e.target.value as any); setTimeout(fetchRecommendation, 0) }}>
                        <option value="short">Pendek (±5-10%)</option>
                        <option value="medium">Menengah (±10-18%)</option>
                        <option value="long">Panjang (±15-25%)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[#686868] dark:text-[#898989] font-medium block mb-1">Modal (USDT)</label>
                      <input className="w-full px-2 py-1.5 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-sm text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="100" value={capital} onChange={e => { setCapital(e.target.value); setTimeout(fetchRecommendation, 0) }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#686868] dark:text-[#898989] font-medium block mb-1">Validasi</label>
                      <select className="w-full px-2 py-1.5 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-sm text-[#0e0f0c] dark:text-[#e8ebe6]" value={validationMode} onChange={e => { setValidationMode(e.target.value as any); setTimeout(fetchRecommendation, 0) }}>
                        <option value="grid_steps">Step Grid</option>
                        <option value="percent">Persentase</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button type="button" onClick={() => fetchRecommendation('grid')} className="w-full px-3 py-1.5 bg-[#9fe870] text-[#163300] font-semibold hover:bg-[#cdffad] rounded-full text-sm transition">
                        Rekomendasi
                      </button>
                    </div>
                  </div>

                  {/* Recommendation Preview */}
                  {recommendation && (
                    <div className="bg-white dark:bg-[#1e201c] border-l-4 border-[#9fe870] rounded-[16px] p-4 text-xs space-y-1.5 shadow-[0_1px_4px_rgba(14,15,12,0.06)] dark:shadow-[0_1px_4px_rgba(232,235,230,0.06)]">
                      <p className="text-[#054d28] dark:text-[#9fe870] font-semibold">Rekomendasi untuk {symbol}</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Range: {recommendation.LowerPrice?.toLocaleString()} — {recommendation.UpperPrice?.toLocaleString()}</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Grid: {recommendation.GridCount} level, step {recommendation.StepSize?.toFixed(8)}</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Qty: {recommendation.Quantity} ({horizon}, modal ${capital})</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Validasi: {recommendation.ValidationTargetValue} ({validationMode === 'grid_steps' ? 'step' : '%'}) dalam {recommendation.ValidationWindowMinutes} menit</p>
                      <p className="text-[#686868] dark:text-[#898989] italic">{recommendation.Reason}</p>
                    </div>
                  )}

                  {/* Historical Insights */}
                  {insights.length > 0 && (
                    <div className="bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-[16px] p-3 text-xs space-y-1">
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold">📈 Hasil Sebelumnya untuk {symbol}</p>
                      {insights.slice(0, 3).map((h: any) => {
                        try {
                          const cfg = JSON.parse(h.config)
                          return (
                            <div key={h.session_id} className="flex justify-between items-center border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] pt-1.5 mt-1.5">
                              <span className="text-[#686868] dark:text-[#898989]">
                                {h.name} · grid {cfg.grid_count || '?'}
                              </span>
                              <span className={`font-semibold ${h.success_rate >= 60 ? 'text-[#054d28] dark:text-[#9fe870]' : h.success_rate >= 30 ? 'text-[#7a5f00] dark:text-[#f5c842]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                {h.success_rate.toFixed(0)}% ({h.confirmed}/{h.total})
                              </span>
                            </div>
                          )
                        } catch { return null }
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Grid Explanation (shown in both modes) */}
              {!isBeginner && (
              <div className="border-l-4 border-[#9fe870] bg-[rgba(159,232,112,0.04)] dark:bg-[rgba(159,232,112,0.08)] rounded-r-[12px] p-4 text-xs text-[#686868] dark:text-[#898989] space-y-1.5">
                  <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Apa itu Grid Trading?</strong> Bot memasang order beli di harga rendah dan order jual di harga tinggi secara berjenjang. Setiap kali harga turun ke level beli, bot akan membeli. Saat harga naik ke level jual, bot akan menjual. Profit diambil dari selisih harga beli dan jual.</p>
                  <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Batas Atas & Bawah:</strong> Menentukan rentang harga yang ingin Anda tradingkan. Bot akan memasang grid secara merata di antara kedua batas ini. Disarankan ±15% dari harga pasar saat ini ({currentPrice ? `~$${(currentPrice * 0.85).toLocaleString()} — $${(currentPrice * 1.15).toLocaleString()}` : 'contoh: BTC 60000-70000'}).</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Konfigurasi Grid</label>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Harga Atas (jual)</span>{renderConfigHelp('upper_price')}</div>
                                         <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="70000" value={upperPrice} onChange={e => setUpperPrice(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Harga Bawah (beli)</span>{renderConfigHelp('lower_price')}</div>
                                         <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="60000" value={lowerPrice} onChange={e => setLowerPrice(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Jumlah Grid</span>{renderConfigHelp('grid_count')}</div>
                                         <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="10" value={gridCount} onChange={e => setGridCount(e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Quantity per Order {renderConfigHelp('quantity')}</label>
                     <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
            </>
          ) : strategy === 'trend' ? (
            <>
              <div className="border-l-4 border-[rgba(56,200,255,0.5)] bg-[rgba(56,200,255,0.03)] dark:bg-[rgba(56,200,255,0.08)] rounded-r-[12px] p-4 text-xs text-[#686868] dark:text-[#898989] space-y-1.5">
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Apa itu Trend Following?</strong> Bot menggunakan 2 SMA (Simple Moving Average) untuk mendeteksi tren. SMA Cepat (fast period) bereaksi lebih cepat ke harga terbaru. SMA Lambat (slow period) lebih stabil.</p>
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Golden Cross (Beli):</strong> Terjadi saat SMA Cepat naik <em>di atas</em> SMA Lambat. Artinya tren naik mulai terbentuk — saat yang tepat untuk beli.</p>
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Death Cross (Jual):</strong> Terjadi saat SMA Cepat turun <em>di bawah</em> SMA Lambat. Artinya tren turun mulai terbentuk — saatnya jual atau hindari beli.</p>
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Saran per Pair:</strong> Pair stabil seperti BTC/ETH bisa pakai (fast=10/20, slow=30/50). Pair volatile seperti SOL/ADA bisa pakai (fast=7, slow=21) agar lebih responsif. Pair yang jarang bergerak seperti USDT/IDR tidak cocok untuk strategi ini.</p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#686868] dark:text-[#898989] font-medium">Mode:</label>
                <button type="button"
                  onClick={() => { setIsBeginner(true); fetchRecommendation('trend') }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${isBeginner ? 'bg-[rgba(56,200,255,0.85)] text-white' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                  🎓 Pemula
                </button>
                <button type="button"
                  onClick={() => { setIsBeginner(false); setRecommendation(null) }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${!isBeginner ? 'bg-[rgba(56,200,255,0.85)] text-white' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                  ⚙️ Manual
                </button>
              </div>

              {isBeginner && (
                <div className="bg-[#f0f1ee] dark:bg-[#252822] rounded-[16px] p-4 space-y-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#686868] dark:text-[#898989] font-medium block mb-1">Horizon</label>
                      <select className="w-full px-2 py-1.5 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-sm text-[#0e0f0c] dark:text-[#e8ebe6]" value={horizon} onChange={e => { setHorizon(e.target.value as any); setTimeout(() => fetchRecommendation('trend'), 0) }}>
                        <option value="short">Pendek (sinyal sering, noise lebih tinggi)</option>
                        <option value="medium">Menengah (seimbang)</option>
                        <option value="long">Panjang (sinyal jarang tapi reliabel)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[#686868] dark:text-[#898989] font-medium block mb-1">Modal (USDT)</label>
                      <input className="w-full px-2 py-1.5 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-sm text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="100" value={capital} onChange={e => { setCapital(e.target.value); setTimeout(() => fetchRecommendation('trend'), 0) }} />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={() => fetchRecommendation('trend')} className="w-full px-3 py-1.5 bg-[rgba(56,200,255,0.85)] text-white font-semibold hover:bg-[rgba(56,200,255,1)] rounded-full text-sm transition">
                      Rekomendasi
                    </button>
                  </div>

                  {recommendation && (
                    <div className="bg-white dark:bg-[#1e201c] border-l-4 border-[rgba(56,200,255,0.85)] rounded-[16px] p-4 text-xs space-y-1.5 shadow-[0_1px_4px_rgba(14,15,12,0.06)] dark:shadow-[0_1px_4px_rgba(232,235,230,0.06)]">
                      <p className="text-[#0994b3] dark:text-[#5dd8f5] font-semibold">Rekomendasi untuk {symbol}</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">SMA: cepat {recommendation.fast_period}, lambat {recommendation.slow_period} pada interval {recommendation.interval}</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Qty: {recommendation.quantity} ({horizon}, modal ${capital})</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Validasi: target +{recommendation.validation_target_value}%, invalid -{recommendation.validation_invalid_value}% dalam {recommendation.validation_window_minutes} menit</p>
                      <p className="text-[#686868] dark:text-[#898989] italic">{recommendation.reason}</p>
                    </div>
                  )}
                </div>
              )}

              {!isBeginner && (
                <div>
                  <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Konfigurasi SMA</label>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">SMA Cepat</span>{renderConfigHelp('fast_period')}</div>
                      <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="10" value={fastPeriod} onChange={e => setFastPeriod(e.target.value)} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">SMA Lambat</span>{renderConfigHelp('slow_period')}</div>
                      <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="30" value={slowPeriod} onChange={e => setSlowPeriod(e.target.value)} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Interval Candle</span></div>
                      <select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" value={trendInterval} onChange={e => setTrendInterval(e.target.value as any)}>
                        <option value="5m">5 menit</option>
                        <option value="15m">15 menit</option>
                        <option value="1h">1 jam</option>
                        <option value="4h">4 jam</option>
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Qty per Sinyal</span>{renderConfigHelp('quantity')}</div>
                      <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="border-l-4 border-[rgba(255,209,26,0.5)] bg-[rgba(255,209,26,0.03)] dark:bg-[rgba(255,209,26,0.08)] rounded-r-[12px] p-4 text-xs text-[#686868] dark:text-[#898989] space-y-1.5">
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Apa itu DCA?</strong> Dollar Cost Averaging — strategi membeli aset dalam jumlah tetap secara rutin, tanpa peduli harga sedang naik atau turun. Tujuannya adalah meratakan harga beli rata-rata.</p>
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Contoh:</strong> Beli $10 BTC setiap 1 jam. Saat harga turun, $10 dapat BTC lebih banyak. Saat harga naik, $10 dapat BTC lebih sedikit. Rata-rata harga beli jadi lebih stabil.</p>
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Take Profit:</strong> Jika diaktifkan, bot akan menjual semua posisi saat harga naik X% dari rata-rata harga beli. Contoh: 5% = jual saat harga naik 5%.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Konfigurasi DCA</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Interval Beli</span>{renderConfigHelp('dca_interval')}</div>
                                         <select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" value={dcaInterval} onChange={e => setDcaInterval(e.target.value)}>
                      <option value="3600">Setiap 1 Jam</option>
                      <option value="7200">Setiap 2 Jam</option>
                      <option value="21600">Setiap 6 Jam</option>
                      <option value="43200">Setiap 12 Jam</option>
                      <option value="86400">Setiap 1 Hari</option>
                      <option value="604800">Setiap 1 Minggu</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Jumlah (USDT)</span>{renderConfigHelp('dca_amount')}</div>
                                         <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="10" value={dcaAmount} onChange={e => setDcaAmount(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Take Profit %</span>{renderConfigHelp('dca_take_profit')}</div>
                                         <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="5" value={dcaTakeProfit} onChange={e => setDcaTakeProfit(e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          )}
              <div className="border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] pt-5 mt-4">
                <button type="submit" className="w-full py-3 bg-[#9fe870] text-[#163300] font-bold text-sm rounded-full hover:bg-[#cdffad] hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[0_2px_12px_rgba(159,232,112,0.35)] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100" disabled={creating}>
                  {creating ? 'Membuat...' : 'Buat Session'}
                </button>
              </div>
            </form>
          </div>
        )}



        {/* Session list or empty state */}
        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" />
            <span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span>
          </div>
        ) : filteredSessions?.length ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">
                Sessions · {filteredSessions?.length || 0}
              </h2>
              {sessions && sessions.filter(s => s.mode === 'paper' && s.status === 'running').length > 0 && (
                <span className="text-xs font-semibold bg-[rgba(159,232,112,0.12)] text-[#163300] dark:text-[#9fe870] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse inline-block" />
                  {sessions.filter(s => s.mode === 'paper' && s.status === 'running').length} paper running
                </span>
              )}
            </div>
            <div className="space-y-3">
              {filteredSessions?.map(s => (
                <SessionCard key={s.id} session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-[24px] bg-[rgba(159,232,112,0.1)] flex items-center justify-center text-2xl mx-auto mb-4">
              {activeFilter === 'all' ? '🤖' : activeFilter === 'grid' ? '📐' : activeFilter === 'trend' ? '📈' : '🪙'}
            </div>
            <p className="text-[#0e0f0c] dark:text-[#e8ebe6] text-lg font-bold">
              {activeFilter === 'all'
                ? 'Belum ada session'
                : `Belum ada session ${activeFilter === 'grid' ? 'Grid' : activeFilter === 'trend' ? 'Trend' : 'DCA'}`
              }
            </p>
            <p className="text-[#686868] dark:text-[#898989] text-sm mt-1">
              {activeFilter === 'all'
                ? 'Klik "+ New Session" untuk membuat session pertama'
                : 'Klik "+ New Session" untuk mulai'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---

function SessionCard({ session, onStart, onStop, onDelete, onDetail }: {
  session: import('@/types').Session
  onStart: (id: number) => void
  onStop: (id: number) => void
  onDelete: (id: number) => void
  onDetail: (id: number) => void
}) {
  const strategyIcon = session.strategy === 'grid' ? '📐' : session.strategy === 'trend' ? '📈' : '🪙'
  const modeIcon = session.mode === 'live' ? '⚡' : session.mode === 'paper' ? '📝' : '📊'
  const modeBg = session.mode === 'live'
    ? 'bg-[rgba(255,209,26,0.9)] dark:bg-[rgba(255,209,26,0.8)]'
    : session.mode === 'paper'
    ? 'bg-[rgba(159,232,112,0.9)] dark:bg-[rgba(159,232,112,0.7)]'
    : 'bg-[rgba(56,200,255,0.9)] dark:bg-[rgba(56,200,255,0.7)]'
  const strategyBg = session.strategy === 'grid'
    ? 'bg-[rgba(159,232,112,0.15)]'
    : session.strategy === 'trend'
    ? 'bg-[rgba(56,200,255,0.1)]'
    : 'bg-[rgba(255,209,26,0.1)]'
  const strategyLabel = session.strategy === 'grid' ? 'Grid Trading' : session.strategy === 'trend' ? 'Trend Following' : 'DCA'

  return (
    <div
      className={`bg-white dark:bg-[#1e201c] rounded-[24px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] hover:shadow-[0_8px_32px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all p-5 cursor-pointer group border-l-4 ${
        session.strategy === 'grid'
          ? 'border-l-[#9fe870]'
          : session.strategy === 'trend'
          ? 'border-l-[#38c8ff]'
          : 'border-l-[#ffd11a]'
      } ${
        session.status === 'running'
          ? 'bg-[rgba(159,232,112,0.015)] dark:bg-[rgba(159,232,112,0.03)]'
          : ''
      }`}
      onClick={() => onDetail(session.id)}
    >
      <div className="flex items-center gap-4">
        {/* Strategy icon utama + mode badge kecil */}
        <div className="relative flex-shrink-0">
          <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center text-2xl ${strategyBg}`}>
            {strategyIcon}
          </div>
          <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${modeBg}`}>
            {modeIcon}
          </span>
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] text-base leading-tight truncate max-w-[200px] sm:max-w-[300px] md:max-w-sm">{session.name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              session.mode === 'live'
                ? 'bg-[rgba(255,209,26,0.15)] text-[#7a5f00] dark:text-[#f5c842]'
                : session.mode === 'paper'
                ? 'bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870]'
                : 'bg-[rgba(56,200,255,0.12)] text-[#0994b3] dark:text-[#5dd8f5]'
            }`}>
              {session.mode === 'signal' ? 'Signal' : session.mode === 'paper' ? 'Paper' : '⚡ Live'}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              session.status === 'running'
                ? 'bg-[rgba(159,232,112,0.15)] dark:bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870]'
                : 'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#5a5b58] dark:text-[#8a8d88]'
            }`}>
              {session.status === 'running' && (
                <span className={`inline-block w-2 h-2 rounded-full ${session.is_alive ? 'bg-[#9fe870] animate-pulse' : 'bg-[#ffd11a]'}`} title={session.is_alive ? 'Goroutine aktif' : 'Status DB running, goroutine belum jalan'} />
              )}
              {session.status === 'running' ? 'Running' : 'Stopped'}
            </span>
          </div>
          <p className="text-xs text-[#686868] dark:text-[#898989] truncate min-w-0">
            <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{session.symbol}</span> · {strategyLabel} · <PriceBadge symbol={session.symbol} compact />
          </p>
          {session.mode === 'paper' && session.virtual_balance != null && (
            <p className="text-xs mt-1 flex items-center gap-2">
              <span className="text-[#686868] dark:text-[#898989]">Saldo virtual</span>
              <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">${session.virtual_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {session.initial_balance != null && (
                <span className={`text-xs font-semibold ${session.virtual_balance >= session.initial_balance ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {session.virtual_balance >= session.initial_balance ? '+' : ''}{(((session.virtual_balance - session.initial_balance) / session.initial_balance) * 100).toFixed(1)}%
                </span>
              )}
            </p>
          )}
        </div>
        {/* Actions — stop propagation agar tidak trigger onDetail */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {session.status === 'running' ? (
            <button className="px-4 py-2 text-xs font-semibold bg-[rgba(208,50,56,0.08)] text-[#d03238] hover:bg-[#d03238] hover:text-white border border-[rgba(208,50,56,0.2)] hover:border-[#d03238] rounded-full transition" onClick={() => onStop(session.id)}>Stop</button>
          ) : (
            <button className="px-4 py-2 text-xs font-semibold bg-[#9fe870] text-[#163300] hover:bg-[#cdffad] rounded-full transition shadow-[0_2px_8px_rgba(159,232,112,0.3)]" onClick={() => onStart(session.id)}>Start</button>
          )}
          <button className="flex items-center gap-1 px-3 py-2 text-[#686868] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.08)] dark:hover:text-[#ff6b6f] dark:hover:bg-[rgba(208,50,56,0.15)] rounded-full text-sm transition" onClick={() => onDelete(session.id)} title="Hapus">
              <span>✕</span>
              <span className="sr-only sm:not-sr-only text-xs font-medium">Hapus</span>
            </button>
        </div>
      </div>
    </div>
  )
}
