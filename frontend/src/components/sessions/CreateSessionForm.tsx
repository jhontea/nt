'use client'
import { useState, useEffect } from 'react'
import { HelpIcon } from '@/components/HelpIcon'
import { GraduationCap, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

const USDT_PAIRS = [
  'BTC_USDT', 'ETH_USDT', 'BNB_USDT', 'SOL_USDT', 'XRP_USDT',
  'ADA_USDT', 'DOGE_USDT', 'DOT_USDT', 'AVAX_USDT', 'MATIC_USDT',
  'LINK_USDT', 'UNI_USDT', 'ATOM_USDT', 'LTC_USDT', 'BCH_USDT',
  'PEPE_USDT', 'SHIB_USDT',
]

const IDR_PAIRS = [
  'BTC_IDR', 'ETH_IDR', 'BNB_IDR', 'SOL_IDR', 'USDT_IDR',
  'DOGE_IDR', 'XRP_IDR', 'ADA_IDR',
  'AVAX_IDR', 'HBAR_IDR', 'POL_IDR', 'TKO_IDR',
  'ARB_IDR', 'DOGS_IDR', 'FLOKI_IDR', 'GRAM_IDR',
  'MANTA_IDR', 'ONDO_IDR', 'RENDER_IDR', 'SCR_IDR',
  'SUI_IDR', 'TAO_IDR', 'VIRTUAL_IDR', 'WIF_IDR',
  'WLD_IDR', 'ZIL_IDR',
]

const modeHelp: Record<string, string> = {
  signal: 'Bot hanya menganalisis pasar dan mencatat sinyal beli/jual. Tidak ada order sungguhan. Cocok untuk belajar.',
  paper: 'Bot melakukan trading simulasi dengan uang virtual $1000. Hasil trading dicatat sebagai profit/loss virtual.',
  live: 'Bot melakukan trading sungguhan menggunakan akun TokoCrypto Anda. RISIKO TINGGI — gunakan dengan hati-hati.',
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
    short: 'Periode SMA lambat — melihat tren jangka panang.',
    long: 'SMA Lambat (slow period) lebih stabil dan menunjukkan tren jangka panjang. Harus lebih besar dari SMA cepat. Disarankan 2-3x dari fast period. Contoh: fast=10, slow=30.',
  },
  dca_interval: {
    short: 'Frekuensi pembelian rutin.',
    long: 'Makin sering = harga rata-rata lebih halus, cocok untuk pasar volatile. Makin jarang = lebih cocok untuk tren naik jangka panjang.',
  },
  dca_amount: {
    short: 'Jumlah IDR yang dibelikan setiap interval.',
    long: 'Contoh: 50000 berarti bot akan membeli Rp50.000 worth of asset setiap interval. Sesuaikan dengan modal. Jangan terlalu besar agar tidak cepat habis.',
  },
}

// groupNumber adds thousand separators for display; ungroup strips them back to a raw numeric string.
function groupNumber(v: string): string {
  if (!v) return ''
  const [intPart, ...rest] = v.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return rest.length ? `${grouped}.${rest.join('.')}` : grouped
}
function ungroup(v: string): string {
  return v.replace(/[^\d.]/g, '')
}

const DEFAULT_BOUNDARY_PCT = 15 // ±15% around current price

function calcGridDefaults(price: number) {
  const upper = Math.round(price * (1 + DEFAULT_BOUNDARY_PCT / 100))
  const lower = Math.round(price * (1 - DEFAULT_BOUNDARY_PCT / 100))
  return { upper: String(upper), lower: String(lower) }
}

export function CreateSessionForm({ strategy, onCreated }: { strategy: 'grid' | 'trend' | 'dca'; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'signal' | 'paper' | 'live'>('signal')
  const [symbol, setSymbol] = useState(strategy === 'dca' ? 'BTC_IDR' : 'BTC_USDT')
  const [upperPrice, setUpperPrice] = useState('')
  const [lowerPrice, setLowerPrice] = useState('')
  const [gridCount, setGridCount] = useState('10')
  const [quantity, setQuantity] = useState('0.001')
  const [fastPeriod, setFastPeriod] = useState('10')
  const [slowPeriod, setSlowPeriod] = useState('30')
  const [trendInterval, setTrendInterval] = useState<'5m' | '15m' | '1h' | '4h'>('5m')
  const [dcaInterval, setDcaInterval] = useState('3600')
  const [dcaAmount, setDcaAmount] = useState('50000')
  const [dcaTakeProfit, setDcaTakeProfit] = useState('')
  const [dcaStopLoss, setDcaStopLoss] = useState('')
  const [dcaDropPct, setDcaDropPct] = useState('')
  const [dcaMaxBuys, setDcaMaxBuys] = useState('')
  const [dcaMaxInvested, setDcaMaxInvested] = useState('')
  const [initialBalance, setInitialBalance] = useState('1000')
  const [stopLossPct, setStopLossPct] = useState('')
  const [takeProfitPct, setTakeProfitPct] = useState('')
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState('')
  const [isBeginner, setIsBeginner] = useState(true)
  const [horizon, setHorizon] = useState<'short' | 'medium' | 'long'>('medium')
  const [capital, setCapital] = useState('100')
  const [maxOrderValue, setMaxOrderValue] = useState('')
  const [maxPositionValue, setMaxPositionValue] = useState('')
  const [validationMode, setValidationMode] = useState<'grid_steps' | 'percent'>('grid_steps')
  const [recommendation, setRecommendation] = useState<any>(null)
  const [insights, setInsights] = useState<any[]>([])
  const [nameEdited, setNameEdited] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

  const { data: liveBalance } = useQuery({
    queryKey: ['account-balance'],
    queryFn: () => api.account.balance(),
    enabled: mode === 'live',
    staleTime: 15_000,
  })
  const quoteAsset = symbol.split('_')[1] || 'USDT'
  const availableQuote = parseFloat(liveBalance?.assets.find(a => a.asset === quoteAsset)?.free ?? '0')

  // Auto-generate session name when mode/symbol changes
  useEffect(() => {
    if (nameEdited) return
    const date = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    const stratLabel = strategy === 'grid' ? 'Grid' : strategy === 'trend' ? 'Trend' : 'DCA'
    const modeLabel = mode === 'signal' ? 'Signal' : mode === 'paper' ? 'Paper' : 'Live'
    const sym = symbol.replace('_', '/')
    setName(`${stratLabel} ${modeLabel} ${sym} ${date}`)
  }, [mode, symbol, nameEdited, strategy])

  async function fetchPriceAndApply(sym: string) {
    if (!sym) return
    setPriceLoading(true)
    setPriceError('')
    try {
      const ticker = await api.sessions.getTicker(sym)
      const price = parseFloat(ticker.lastPrice)
      if (!isNaN(price) && price > 0) {
        setCurrentPrice(price)
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

  // Fetch price when pair changes
  useEffect(() => {
    setCurrentPrice(null)
    setPriceError('')
    setRecommendation(null)
    fetchPriceAndApply(symbol)
    if (strategy === 'grid' || strategy === 'trend') setTimeout(() => fetchRecommendation(strategy), 300)
  }, [symbol, strategy])

  // Live defaults must respect the actual account balance. Keep a small fee/slippage reserve.
  useEffect(() => {
    if (mode !== 'live' || strategy !== 'grid' || availableQuote <= 0) return
    const safeCapital = Math.floor(availableQuote * 0.93 * 100) / 100
    if ((parseFloat(capital) || 0) > safeCapital) setCapital(String(safeCapital))
    if (!maxPositionValue || parseFloat(maxPositionValue) > safeCapital) setMaxPositionValue(String(safeCapital))
    if (!maxOrderValue || parseFloat(maxOrderValue) > safeCapital) setMaxOrderValue(String(safeCapital))
    if (currentPrice && currentPrice > 0 && parseFloat(quantity) * currentPrice > safeCapital) {
      setQuantity((safeCapital / currentPrice).toFixed(8))
    }
  }, [mode, strategy, availableQuote, currentPrice, capital, maxOrderValue, maxPositionValue, quantity])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    setFormError('')
    setCreating(true)
    try {
      let config: any
      if (strategy === 'grid') {
        const upper = parseFloat(upperPrice)
        const lower = parseFloat(lowerPrice)
        const count = parseInt(gridCount)
        const qty = parseFloat(quantity)
        const orderCap = parseFloat(maxOrderValue)
        const positionCap = parseFloat(maxPositionValue)
        if (![upper, lower, count, qty].every(Number.isFinite) || upper <= lower || count < 2 || qty <= 0) {
          setFormError('Konfigurasi Grid tidak valid. Pastikan range, jumlah grid, dan quantity terisi dengan benar.')
          return
        }
        if (mode === 'live') {
          const estimatedOrder = currentPrice ? qty * currentPrice : 0
          if (!Number.isFinite(orderCap) || !Number.isFinite(positionCap) || orderCap <= 0 || positionCap <= 0) {
            setFormError('Batas nilai order dan posisi wajib diisi untuk Grid Live.')
            return
          }
          if (positionCap < orderCap) {
            setFormError('Batas posisi harus lebih besar atau sama dengan batas per order.')
            return
          }
          if (availableQuote <= 0 || positionCap > availableQuote) {
            setFormError(`Batas posisi melebihi saldo ${quoteAsset} tersedia.`)
            return
          }
          if (estimatedOrder > orderCap) {
            setFormError(`Estimasi order ${estimatedOrder.toFixed(2)} ${quoteAsset} melebihi batas per order.`)
            return
          }
        }
        config = {
          upper_price: upper,
          lower_price: lower,
          grid_count: count,
          quantity,
          ...(mode === 'live' ? { max_order_value: orderCap, max_position_value: positionCap } : {}),
        }
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
        const amountNum = parseFloat(dcaAmount) || 0
        const isIDR = symbol.endsWith('_IDR')
        if (mode === 'live' && isIDR && amountNum < 20000) {
          alert('Amount DCA live untuk pair IDR minimal Rp20.000 (batas minimum notional TokoCrypto).')
          setCreating(false)
          return
        }
        config = { interval_sec: parseInt(dcaInterval), amount: dcaAmount, take_profit_pct: parseFloat(dcaTakeProfit) || 0, stop_loss_pct: parseFloat(dcaStopLoss) || 0, drop_pct: parseFloat(dcaDropPct) || 0, ...(dcaMaxBuys ? { max_buys: parseInt(dcaMaxBuys) } : {}), ...(dcaMaxInvested ? { max_invested: parseFloat(dcaMaxInvested) } : {}) }
      }
      const createFn = strategy === 'grid' ? api.grid.sessions.create : strategy === 'trend' ? api.trend.sessions.create : api.dca.sessions.create
      await createFn({ name: name || `${strategy}-${symbol}`, mode, symbol, config: JSON.stringify({
        ...config,
        ...((mode === 'paper' || mode === 'live') && stopLossPct ? { stop_loss_pct: parseFloat(stopLossPct) } : {}),
        ...((mode === 'paper' || mode === 'live') && takeProfitPct ? { take_profit_pct: parseFloat(takeProfitPct) } : {}),
      }), ...(mode === 'paper' ? { initial_balance: parseFloat(initialBalance) || 1000 } : {}) })
      setNameEdited(false)
      onCreated()
    } catch (e: any) {
      setFormError(e?.message || 'Gagal membuat session.')
    } finally {
      setCreating(false)
    }
  }

  function renderConfigHelp(key: string) {
    const h = fieldHelp[key]
    if (!h) return null
    return <HelpIcon text={`${h.short}\n\n${h.long}`} />
  }

  return (
    <form onSubmit={handleCreate} className="p-6 space-y-5">
      <div className="grid grid-cols-3 gap-2" aria-label="Tahapan konfigurasi session">
        {['1 · Dasar', '2 · Risiko', '3 · Review'].map((step, index) => (
          <div key={step} className={`rounded-full px-3 py-2 text-center text-[10px] sm:text-xs font-bold ${index === 0 ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#a5a8a2]'}`}>
            {step}
          </div>
        ))}
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
            <span className="text-xs font-bold text-[#9fe870] uppercase tracking-widest flex-shrink-0">Harga Live</span>
            <span className="text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold">{currentPrice.toLocaleString()}</span>
            <span className="text-xs text-[#5a5b58] dark:text-[#8a8d88]">{symbol}</span>
            {strategy === 'grid' && lowerPrice && upperPrice && (
              <span className="text-xs text-[#686868] dark:text-[#898989] ml-auto">
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
              {(strategy === 'dca' ? IDR_PAIRS : USDT_PAIRS).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Mode <HelpIcon text={modeHelp[mode]} /></label>
            <select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" value={mode} onChange={e => setMode(e.target.value as any)}>
              <option value="signal">Signal — sinyal saja, tanpa eksekusi</option>
              <option value="paper">Paper — trading simulasi (uang virtual)</option>
              <option value="live">Live — trading sungguhan (RISIKO TINGGI)</option>
            </select>
          </div>
        </div>

        {mode === 'paper' && (
          <div>
            <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Modal Virtual ({strategy === 'dca' ? 'IDR' : 'USDT'})</label>
            <input type="text" inputMode="numeric" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="1,000" value={groupNumber(initialBalance)} onChange={e => setInitialBalance(ungroup(e.target.value))} />
          </div>
        )}

        {(mode === 'paper' || mode === 'live') && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Stop Loss % <span className="text-[#686868] dark:text-[#898989] font-normal text-xs">(opsional)</span></label>
              <input type="number" min="0" max="100" step="0.1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(208,50,56,0.4)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="mis. 10" value={stopLossPct} onChange={e => setStopLossPct(e.target.value)} />
              <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Hentikan session jika total value turun {stopLossPct ? stopLossPct : 'X'}% dari modal</p>
            </div>
            <div>
              <label className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] block mb-1.5">Take Profit % <span className="text-[#686868] dark:text-[#898989] font-normal text-xs">(opsional)</span></label>
              <input type="number" min="0" max="1000" step="0.1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="mis. 20" value={takeProfitPct} onChange={e => setTakeProfitPct(e.target.value)} />
              <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Hentikan session jika total value naik {takeProfitPct ? takeProfitPct : 'Y'}% dari modal</p>
            </div>
          </div>
        )}

        {/* Strategy-specific config */}
        {strategy === 'grid' ? (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#686868] dark:text-[#898989] font-medium">Mode:</label>
              <button type="button"
                onClick={() => { setIsBeginner(true); fetchRecommendation() }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${isBeginner ? 'bg-[#9fe870] text-[#163300]' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                <GraduationCap size={14} className="inline mr-1" />Pemula
              </button>
              <button type="button"
                onClick={() => setIsBeginner(false)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${!isBeginner ? 'bg-[#9fe870] text-[#163300]' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                <Settings size={14} className="inline mr-1" />Manual
              </button>
            </div>

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
              {currentPrice && parseFloat(quantity) > 0 && (
                <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Estimasi per order: {(currentPrice * parseFloat(quantity)).toLocaleString('en-US', { maximumFractionDigits: 4 })} {quoteAsset}</p>
              )}
            </div>
            {mode === 'live' && (
              <div className="rounded-[16px] border border-[rgba(208,50,56,0.2)] bg-[rgba(208,50,56,0.04)] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-[#d03238] dark:text-[#ff6b6f]">Risk Control Grid Live</span>
                  <span className="text-[#686868] dark:text-[#898989]">Saldo {quoteAsset}: {availableQuote.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-[#686868] dark:text-[#898989]">Batas per order ({quoteAsset})
                    <input type="number" min="0" step="0.01" className="mt-1 w-full px-3 py-2.5 bg-white dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-[#0e0f0c] dark:text-[#e8ebe6]" value={maxOrderValue} onChange={e => setMaxOrderValue(e.target.value)} />
                  </label>
                  <label className="text-xs text-[#686868] dark:text-[#898989]">Batas total posisi ({quoteAsset})
                    <input type="number" min="0" step="0.01" className="mt-1 w-full px-3 py-2.5 bg-white dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-[#0e0f0c] dark:text-[#e8ebe6]" value={maxPositionValue} onChange={e => setMaxPositionValue(e.target.value)} />
                  </label>
                </div>
                <p className="text-[10px] text-[#686868] dark:text-[#898989]">Sistem menyisakan sekitar 7% saldo untuk fee dan slippage. Order baru ditolak saat salah satu batas tercapai.</p>
              </div>
            )}
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
                <GraduationCap size={14} className="inline mr-1" />Pemula
              </button>
              <button type="button"
                onClick={() => { setIsBeginner(false); setRecommendation(null) }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${!isBeginner ? 'bg-[rgba(56,200,255,0.85)] text-white' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#2a2c27] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                <Settings size={14} className="inline mr-1" />Manual
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Interval Beli</span>{renderConfigHelp('dca_interval')}</div>
                  <select className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" value={dcaInterval} onChange={e => setDcaInterval(e.target.value)}>
                    <option value="600">Setiap 10 Menit</option>
                    <option value="1800">Setiap 30 Menit</option>
                    <option value="3600">Setiap 1 Jam</option>
                    <option value="7200">Setiap 2 Jam</option>
                    <option value="21600">Setiap 6 Jam</option>
                    <option value="43200">Setiap 12 Jam</option>
                    <option value="86400">Setiap 1 Hari</option>
                    <option value="604800">Setiap 1 Minggu</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Jumlah (IDR)</span>{renderConfigHelp('dca_amount')}</div>
                  <input inputMode="numeric" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="50,000" value={groupNumber(dcaAmount)} onChange={e => setDcaAmount(ungroup(e.target.value))} />
                  {mode === 'live' && symbol.endsWith('_IDR') && (parseFloat(dcaAmount) || 0) < 20000 && (
                    <p className="text-xs text-[#d03238] dark:text-[#ff6b6f] mt-1">⚠ Minimal Rp20.000 untuk live order IDR (batas notional TokoCrypto)</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Beli saat turun %</span></div>
                  <input type="number" min="0" max="99.99" step="0.1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="0 = tiap interval" value={dcaDropPct} onChange={e => setDcaDropPct(e.target.value)} />
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Beli hanya saat harga turun X% dari harga beli terakhir</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Jual saat untung %</span></div>
                  <input type="number" min="0" max="1000" step="0.1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="0 = nonaktif" value={dcaTakeProfit} onChange={e => setDcaTakeProfit(e.target.value)} />
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Jual semua lalu beli lagi saat harga naik X% dari rata-rata beli</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Jual saat rugi %</span></div>
                  <input type="number" min="0" max="99.99" step="0.1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(208,50,56,0.4)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="0 = nonaktif" value={dcaStopLoss} onChange={e => setDcaStopLoss(e.target.value)} />
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Jual semua lalu beli lagi saat harga turun X% dari rata-rata beli</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Maks. Jumlah Beli</span></div>
                  <input type="number" min="1" step="1" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="0 = tidak terbatas" value={dcaMaxBuys} onChange={e => setDcaMaxBuys(e.target.value)} />
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Batas maksimum order beli yang dieksekusi. Setelah tercapai, bot berhenti beli.</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1.5"><span className="text-xs text-[#686868] dark:text-[#898989]">Maks. Modal (IDR)</span></div>
                  <input inputMode="numeric" className="w-full px-3 py-2.5 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[rgba(22,51,0,0.6)] text-[#0e0f0c] dark:text-[#e8ebe6]" placeholder="0 = tidak terbatas" value={groupNumber(dcaMaxInvested)} onChange={e => setDcaMaxInvested(ungroup(e.target.value))} />
                  <p className="text-xs text-[#686868] dark:text-[#898989] mt-1">Total maksimum IDR yang boleh diinvestasikan. Bot berhenti beli setelah tercapai.</p>
                </div>
              </div>
            </div>
          </>
        )}
        <div className="rounded-[14px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] bg-[#fafafa] dark:bg-[#252822] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#686868] dark:text-[#a5a8a2] mb-2">Review session</p>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] capitalize">{strategy}</span>
            <span className="text-[#686868] dark:text-[#a5a8a2]">{symbol.replace('_', '/')}</span>
            <span className={`px-2 py-0.5 rounded-full font-semibold ${mode === 'live' ? 'bg-[rgba(208,50,56,0.1)] text-[#d03238] dark:text-[#ff6b6f]' : mode === 'paper' ? 'bg-[rgba(159,232,112,0.12)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(56,200,255,0.1)] text-[#0994b3] dark:text-[#5dd8f5]'}`}>{mode}</span>
            {mode === 'live' && <span className="text-[#d03238] dark:text-[#ff6b6f]">Order sungguhan</span>}
            {strategy === 'grid' && <span className="text-[#686868] dark:text-[#a5a8a2]">{gridCount} grid · qty {quantity}</span>}
            {strategy === 'dca' && <span className="text-[#686868] dark:text-[#a5a8a2]">Rp{Number(dcaAmount || 0).toLocaleString('id-ID')} / order</span>}
          </div>
        </div>
        <div className="sticky bottom-0 -mx-6 px-6 pb-1 pt-4 bg-white/95 dark:bg-[#1e201c]/95 backdrop-blur border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mt-4">
          {formError && <p role="alert" className="mb-3 text-xs text-[#d03238] dark:text-[#ff6b6f]">{formError}</p>}
          <button type="submit" className="w-full py-3 bg-[#9fe870] text-[#163300] font-bold text-sm rounded-full hover:bg-[#cdffad] hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[0_2px_12px_rgba(159,232,112,0.35)] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100" disabled={creating}>
            {creating ? 'Membuat...' : 'Buat Session'}
          </button>
        </div>
    </form>
  )
}
