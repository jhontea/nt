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

type Preset = {
  label: string
  desc: string
  strategy: 'grid' | 'trend' | 'dca'
  mode: 'signal' | 'paper' | 'live'
  symbol: string
  config: Record<string, any>
}

const presets: Preset[] = [
  { label: '🚀 Grid Signal', desc: 'Pasang grid di sekitar harga pasar. Bot akan beli murah jual mahal secara otomatis.', strategy: 'grid', mode: 'signal', symbol: 'BTC_USDT', config: { grid_count: 10, quantity: '0.001' } },
  { label: '📈 Trend Signal', desc: 'Deteksi golden cross & death cross dengan SMA. Ikuti arah tren pasar.', strategy: 'trend', mode: 'signal', symbol: 'BTC_USDT', config: { fast_period: 10, slow_period: 30, quantity: '0.001' } },
  { label: '🪙 DCA Paper', desc: 'Simulasi DCA dengan uang virtual $1000. Beli rutin, jual otomatis saat profit.', strategy: 'dca', mode: 'paper', symbol: 'BTC_USDT', config: { interval_sec: 3600, amount: '10', take_profit_pct: 5 } },
  { label: '📊 Grid Paper', desc: 'Simulasi Grid Trading dengan uang virtual $1000.', strategy: 'grid', mode: 'paper', symbol: 'ETH_USDT', config: { grid_count: 8, quantity: '0.01' } },
]

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
  const [dcaInterval, setDcaInterval] = useState('3600')
  const [dcaAmount, setDcaAmount] = useState('10')
  const [dcaTakeProfit, setDcaTakeProfit] = useState('5')
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
        return price
      }
    } catch (e: any) {
      setPriceError('Gagal ambil harga: ' + (e.message || ''))
    }
    setPriceLoading(false)
  }

  async function fetchRecommendation() {
    if (strategy !== 'grid') return
    try {
      const rec = await api.grid.recommend({ symbol, horizon, capital: parseFloat(capital) || 100, validation_mode: validationMode })
      setRecommendation(rec)
      setUpperPrice(String(rec.UpperPrice))
      setLowerPrice(String(rec.LowerPrice))
      setGridCount(String(rec.GridCount))
      setQuantity(rec.Quantity)
      // Also fetch historical insights
      const hist = await api.grid.insights(symbol)
      setInsights(hist || [])
    } catch { /* ignore */ }
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
    if (strategy === 'grid') setTimeout(fetchRecommendation, 300)
  }, [showCreate, symbol])

  function applyPreset(p: Preset) {
    setStrategy(p.strategy)
    setMode(p.mode)
    setSymbol(p.symbol)
    setName(p.label)
    setQuantity(p.config.quantity || '0.001')
    setGridCount(String(p.config.grid_count || 10))
    setFastPeriod(String(p.config.fast_period || 10))
    setSlowPeriod(String(p.config.slow_period || 30))
    setDcaInterval(String(p.config.interval_sec || 3600))
    setDcaAmount(p.config.amount || '10')
    setDcaTakeProfit(String(p.config.take_profit_pct || 5))
    setShowCreate(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
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
      config = { fast_period: parseInt(fastPeriod), slow_period: parseInt(slowPeriod), quantity }
    } else {
      config = { interval_sec: parseInt(dcaInterval), amount: dcaAmount, take_profit_pct: parseFloat(dcaTakeProfit) || 0 }
    }
    await api.sessions.create({ name: name || `${strategy}-${symbol}`, strategy, mode, symbol, config: JSON.stringify(config) })
    setShowCreate(false)
    setNameEdited(false)
    refetch()
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

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Sessions</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Bot trading otomatis Anda</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="px-5 py-2.5 bg-[#9fe870] text-[#163300] font-bold border-2 border-[#9fe870] hover:bg-[#cdffad] hover:scale-[1.03] active:scale-[0.97] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)]">
            {showCreate ? '✕ Tutup' : '+ New Session'}
          </button>
        </div>

        {/* Market Ticker */}
        <div className="flex items-center gap-3 bg-white dark:bg-[#1e201c] rounded-[24px] px-5 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-8 overflow-x-auto shadow-[0_1px_4px_rgba(14,15,12,0.04)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
          <span className="text-[10px] font-bold text-[#9fe870] tracking-widest uppercase flex-shrink-0">Live</span>
          <div className="w-px h-4 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)] flex-shrink-0" />
          <div className="flex gap-5">
            <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">BTC</span><PriceBadge symbol="BTC_USDT" compact /></div>
            <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
            <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">ETH</span><PriceBadge symbol="ETH_USDT" compact /></div>
            <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
            <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">BNB</span><PriceBadge symbol="BNB_USDT" compact /></div>
          </div>
        </div>

        {/* Form panel — slide-down, full width, max-w-3xl */}
        {showCreate && (
          <div className="mb-8 rounded-[24px] bg-white dark:bg-[#1e201c] shadow-[0_0_0_1px_rgba(14,15,12,0.08),0_8px_32px_rgba(14,15,12,0.06)] dark:shadow-[0_0_0_1px_rgba(232,235,230,0.1),0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden" style={{borderTop: '3px solid #9fe870'}}>
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-black text-xl text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">New Session</h2>
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-0.5">Konfigurasi bot trading baru</p>
                </div>
                <button type="button" onClick={() => { setShowCreate(false); setNameEdited(false) }} className="w-8 h-8 flex items-center justify-center text-[#686868] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.08)] rounded-full transition">✕</button>
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
                      Grid: <span className="text-[#163300] font-medium">{parseInt(lowerPrice).toLocaleString()}</span>
                      {' — '}
                      <span className="text-[#163300] font-medium">{parseInt(upperPrice).toLocaleString()}</span>
                      <span className="text-[#686868]"> (±{DEFAULT_BOUNDARY_PCT}%)</span>
                    </span>
                  )}
                </div>
              )}
              {priceError && (
                <div className="bg-[rgba(208,50,56,0.06)] dark:bg-[rgba(208,50,56,0.1)] border border-[rgba(208,50,56,0.15)] dark:border-[rgba(208,50,56,0.2)] rounded-[10px] p-3 text-sm text-[#d03238]">
                  {priceError} <span className="text-[#5a5b58]">— isi manual atau coba pair lain</span>
                </div>
              )}

              {/* Main fields — 2 column grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Nama Session <HelpIcon text="Nama bebas untuk membedakan session satu dengan lainnya" /></label>
                  <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="mis. Grid Signal BTC/USDT 07 Jul" value={name} onChange={e => { setNameEdited(true); setName(e.target.value) }} />
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
                    <option value="paper">📝 Paper — trading simulasi (uang virtual $1000)</option>
                    <option value="live">⚡ Live — trading sungguhan (RISIKO TINGGI)</option>
                  </select>
                </div>
              </div>

              {/* Strategy-specific config */}
              {strategy === 'grid' ? (
            <>
              {/* Beginner / Advanced Toggle */}

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#686868] dark:text-[#898989] font-medium">Mode:</label>
                <button type="button"
                  onClick={() => { setIsBeginner(true); fetchRecommendation() }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${isBeginner ? 'bg-[#9fe870] text-[#163300]' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#e8ebe6] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                  🎓 Pemula
                </button>
                <button type="button"
                  onClick={() => setIsBeginner(false)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${!isBeginner ? 'bg-[#9fe870] text-[#163300]' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#e8ebe6] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                  ⚙️ Manual
                </button>
              </div>

              {/* Beginner Controls */}
              {isBeginner && (
                <div className="bg-[#fafafa] dark:bg-[#141411] rounded-[16px] p-4 space-y-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                  <div className="grid grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#686868] dark:text-[#898989] font-medium block mb-1">Validasi</label>
                      <select className="w-full px-2 py-1.5 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-sm text-[#0e0f0c] dark:text-[#e8ebe6]" value={validationMode} onChange={e => { setValidationMode(e.target.value as any); setTimeout(fetchRecommendation, 0) }}>
                        <option value="grid_steps">Step Grid</option>
                        <option value="percent">Persentase</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button type="button" onClick={fetchRecommendation} className="w-full px-3 py-1.5 bg-[#9fe870] text-[#163300] font-semibold hover:bg-[#cdffad] rounded-full text-sm transition">
                        Rekomendasi
                      </button>
                    </div>
                  </div>

                  {/* Recommendation Preview */}
                  {recommendation && (
                    <div className="bg-white dark:bg-[#1e201c] border-l-4 border-[#9fe870] rounded-[12px] p-4 text-xs space-y-1.5 shadow-[0_1px_4px_rgba(14,15,12,0.06)] dark:shadow-[0_1px_4px_rgba(232,235,230,0.06)]">
                      <p className="text-[#054d28] font-semibold">Rekomendasi untuk {symbol}</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Range: {recommendation.LowerPrice?.toLocaleString()} — {recommendation.UpperPrice?.toLocaleString()}</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Grid: {recommendation.GridCount} level, step {recommendation.StepSize?.toFixed(8)}</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Qty: {recommendation.Quantity} ({horizon}, modal ${capital})</p>
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Validasi: {recommendation.ValidationTargetValue} ({validationMode === 'grid_steps' ? 'step' : '%'}) dalam {recommendation.ValidationWindowMinutes} menit</p>
                      <p className="text-[#686868] dark:text-[#898989] italic">{recommendation.Reason}</p>
                    </div>
                  )}

                  {/* Historical Insights */}
                  {insights.length > 0 && (
                    <div className="bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-[10px] p-3 text-xs space-y-1">
                      <p className="text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold">📈 Hasil Sebelumnya untuk {symbol}</p>
                      {insights.slice(0, 3).map((h: any) => {
                        try {
                          const cfg = JSON.parse(h.config)
                          return (
                            <div key={h.session_id} className="flex justify-between items-center border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] pt-1.5 mt-1.5">
                              <span className="text-[#686868] dark:text-[#898989]">
                                {h.name} · grid {cfg.grid_count || '?'}
                              </span>
                              <span className={`font-semibold ${h.success_rate >= 60 ? 'text-[#054d28]' : h.success_rate >= 30 ? 'text-[#b0630f]' : 'text-[#991b1b]'}`}>
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
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">Harga Atas (jual)</span>{renderConfigHelp('upper_price')}</div>
                    <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="70000" value={upperPrice} onChange={e => setUpperPrice(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">Harga Bawah (beli)</span>{renderConfigHelp('lower_price')}</div>
                    <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="60000" value={lowerPrice} onChange={e => setLowerPrice(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">Jumlah Grid</span>{renderConfigHelp('grid_count')}</div>
                    <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="10" value={gridCount} onChange={e => setGridCount(e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Quantity per Order {renderConfigHelp('quantity')}</label>
                <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
            </>
          ) : strategy === 'trend' ? (
            <>
              <div className="border-l-4 border-[rgba(56,200,255,0.5)] bg-[rgba(56,200,255,0.03)] dark:bg-[rgba(56,200,255,0.08)] rounded-r-[12px] p-4 text-xs text-[#686868] dark:text-[#898989] space-y-1.5">
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Apa itu Trend Following?</strong> Bot menggunakan 2 SMA (Simple Moving Average) untuk mendeteksi tren. SMA Cepat (fast period) bereaksi lebih cepat ke harga terbaru. SMA Lambat (slow period) lebih stabil.</p>
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Golden Cross (Beli):</strong> Terjadi saat SMA Cepat naik <em>di atas</em> SMA Lambat. Artinya tren naik mulai terbentuk — saat yang tepat untuk beli.</p>
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Death Cross (Jual):</strong> Terjadi saat SMA Cepat turun <em>di bawah</em> SMA Lambat. Artinya tren turun mulai terbentuk — saatnya jual atau hindari beli.</p>
                <p><strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">Saran per Pair:</strong> Pair stabil seperti BTC/ETH bisa pakai (fast=10, slow=30). Pair volatile seperti SOL/ADA bisa pakai (fast=7, slow=21) agar lebih responsif. Pair yang jarang bergerak seperti USDT/IDR tidak cocok untuk strategi ini.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Konfigurasi SMA</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">SMA Cepat</span>{renderConfigHelp('fast_period')}</div>
                    <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="10" value={fastPeriod} onChange={e => setFastPeriod(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">SMA Lambat</span>{renderConfigHelp('slow_period')}</div>
                    <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="30" value={slowPeriod} onChange={e => setSlowPeriod(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">Qty per Order</span>{renderConfigHelp('quantity')}</div>
                    <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} />
                  </div>
                </div>
              </div>
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
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">Interval Beli</span>{renderConfigHelp('dca_interval')}</div>
                    <select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" value={dcaInterval} onChange={e => setDcaInterval(e.target.value)}>
                      <option value="3600">Setiap 1 Jam</option>
                      <option value="7200">Setiap 2 Jam</option>
                      <option value="21600">Setiap 6 Jam</option>
                      <option value="43200">Setiap 12 Jam</option>
                      <option value="86400">Setiap 1 Hari</option>
                      <option value="604800">Setiap 1 Minggu</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">Jumlah (USDT)</span>{renderConfigHelp('dca_amount')}</div>
                    <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="10" value={dcaAmount} onChange={e => setDcaAmount(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868]">Take Profit %</span>{renderConfigHelp('dca_take_profit')}</div>
                    <input className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] dark:text-[#e8ebe6] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c]" placeholder="5" value={dcaTakeProfit} onChange={e => setDcaTakeProfit(e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          )}
              <button type="submit" className="w-full py-3 bg-[#9fe870] text-[#163300] font-bold text-sm rounded-full hover:bg-[#cdffad] hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[0_2px_12px_rgba(159,232,112,0.35)] mt-6 border-t border-[rgba(14,15,12,0.06)] pt-6">Buat Session</button>
            </form>
          </div>
        )}

        {/* Presets — hidden when form is open */}
        {!showCreate && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest mb-3">Mulai Cepat</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {presets.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className="bg-white dark:bg-[#1e201c] hover:bg-[rgba(159,232,112,0.04)] dark:hover:bg-[rgba(159,232,112,0.08)] rounded-[24px] p-4 text-left transition-all border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(159,232,112,0.5)] hover:shadow-[0_4px_16px_rgba(159,232,112,0.12)] group">
                  <p className="font-bold text-sm text-[#0e0f0c] dark:text-[#e8ebe6] mb-1 group-hover:text-[#163300]">{p.label}</p>
                  <p className="text-xs text-[#686868] dark:text-[#898989] leading-snug">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Session list or empty state */}
        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2b27]" />
            <span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span>
          </div>
        ) : sessions?.length ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-[#9fe870] uppercase tracking-widest">Sessions aktif · {sessions.length}</h2>
            </div>
            <div className="space-y-3">
              {sessions.map(s => (
                <SessionCard key={s.id} session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={(id) => router.push(`/sessions/${id}`)} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-[24px] bg-[rgba(159,232,112,0.1)] flex items-center justify-center text-2xl mx-auto mb-4">🤖</div>
            <p className="text-[#0e0f0c] dark:text-[#e8ebe6] text-lg font-bold">Belum ada session</p>
            <p className="text-[#686868] dark:text-[#898989] text-sm mt-1">Pilih preset di atas atau klik "+ New Session"</p>
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
  const strategyBg = session.strategy === 'grid'
    ? 'bg-[rgba(159,232,112,0.15)]'
    : session.strategy === 'trend'
    ? 'bg-[rgba(56,200,255,0.1)]'
    : 'bg-[rgba(255,209,26,0.1)]'
  const strategyLabel = session.strategy === 'grid' ? 'Grid Trading' : session.strategy === 'trend' ? 'Trend Following' : 'DCA'

  return (
    <div className="bg-white dark:bg-[#1e201c] rounded-[24px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] hover:shadow-[0_8px_32px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all p-5 cursor-pointer group" onClick={() => onDetail(session.id)}>
      <div className="flex items-center gap-4">
        {/* Strategy icon — lebih besar */}
        <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center text-2xl flex-shrink-0 ${strategyBg}`}>
          {strategyIcon}
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] text-base leading-tight">{session.name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              session.mode === 'live'
                ? 'bg-[rgba(255,209,26,0.15)] text-[#7a5f00]'
                : session.mode === 'paper'
                ? 'bg-[rgba(159,232,112,0.15)] text-[#163300]'
                : 'bg-[rgba(56,200,255,0.12)] text-[#0994b3]'
            }`}>
              {session.mode === 'signal' ? 'Signal' : session.mode === 'paper' ? 'Paper' : '⚡ Live'}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              session.status === 'running'
                ? 'bg-[rgba(159,232,112,0.15)] dark:bg-[rgba(159,232,112,0.2)] text-[#163300]'
                : 'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#5a5b58] dark:text-[#8a8d88]'
            }`}>
              {session.status === 'running' && (
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${session.is_alive ? 'bg-[#9fe870] animate-pulse' : 'bg-[#ffd11a]'}`} title={session.is_alive ? 'Goroutine aktif' : 'Status DB running, goroutine belum jalan'} />
              )}
              {session.status === 'running' ? 'Running' : 'Stopped'}
            </span>
          </div>
          <p className="text-xs text-[#686868] dark:text-[#898989]">
            <span className="font-medium text-[#454745] dark:text-[#8a8d88]">{session.symbol}</span> · {strategyLabel} · <PriceBadge symbol={session.symbol} compact />
          </p>
        </div>
        {/* Actions — stop propagation agar tidak trigger onDetail */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {session.status === 'running' ? (
            <button className="px-4 py-2 text-xs font-semibold bg-[#d03238] text-white hover:bg-[#d94a4f] rounded-full transition" onClick={() => onStop(session.id)}>Stop</button>
          ) : (
            <button className="px-4 py-2 text-xs font-semibold bg-[#9fe870] text-[#163300] hover:bg-[#cdffad] rounded-full transition shadow-[0_2px_8px_rgba(159,232,112,0.3)]" onClick={() => onStart(session.id)}>Start</button>
          )}
          <button className="w-8 h-8 flex items-center justify-center text-[#686868] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.08)] rounded-full text-sm transition" onClick={() => onDelete(session.id)} title="Hapus">✕</button>
        </div>
      </div>
    </div>
  )
}
