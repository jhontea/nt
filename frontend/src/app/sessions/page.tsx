'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { HelpIcon } from '@/components/HelpIcon'

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
  const { logout, isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => { if (!isAuthenticated) router.push('/login') }, [isAuthenticated, router])

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

  async function fetchPriceAndApply(sym: string) {
    if (!sym) return
    setPriceLoading(true)
    setPriceError('')
    try {
      const ticker = await api.sessions.getTicker(sym)
      const price = parseFloat(ticker.last_price)
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

  // Fetch price when form opens or pair changes
  useEffect(() => {
    if (!showCreate) {
      setCurrentPrice(null)
      setPriceError('')
      return
    }
    fetchPriceAndApply(symbol)
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
    } else if (strategy === 'trend') {
      config = { fast_period: parseInt(fastPeriod), slow_period: parseInt(slowPeriod), quantity }
    } else {
      config = { interval_sec: parseInt(dcaInterval), amount: dcaAmount, take_profit_pct: parseFloat(dcaTakeProfit) || 0 }
    }
    await api.sessions.create({ name: name || `${strategy}-${symbol}`, strategy, mode, symbol, config: JSON.stringify(config) })
    setShowCreate(false)
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

  function renderConfigHelp(key: string) {
    const h = fieldHelp[key]
    if (!h) return null
    return <HelpIcon text={`${h.short}\n\n${h.long}`} />
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Trading Sessions</h1>
          <p className="text-sm text-gray-500">Kelola session trading bot Anda</p>
        </div>
        <div className="space-x-3">
          <button onClick={() => router.push('/glossary')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm">📖 Glosarium</button>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition">
            {showCreate ? 'Cancel' : '+ New Session'}
          </button>
          <button onClick={logout} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition">Logout</button>
        </div>
      </div>

      {/* Rekomendasi */}
      {!showCreate && (
        <div className="mb-8">
          <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-3">Rekomendasi Cepat</h2>
          <div className="grid md:grid-cols-4 gap-3">
            {presets.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="bg-gray-900 hover:bg-gray-800 rounded-xl p-4 text-left transition border border-gray-800 hover:border-gray-700">
                <p className="font-semibold text-sm mb-1">{p.label}</p>
                <p className="text-xs text-gray-400">{p.desc}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-2">Atau klik &quot;+ New Session&quot; untuk konfigurasi manual.</p>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-900 p-6 rounded-xl mb-6 space-y-4">
          <h2 className="font-semibold">New Trading Session</h2>

          {/* Info harga saat ini */}
          {priceLoading && (
            <div className="bg-gray-800 rounded-lg p-3 text-sm flex items-center gap-2">
              <span className="text-gray-400">Mengambil harga {symbol}...</span>
            </div>
          )}
          {currentPrice && !priceLoading && (
            <div className="bg-gray-800 rounded-lg p-3 text-sm flex items-center gap-2">
              <span className="text-gray-400">Harga {symbol}:</span>
              <span className="font-semibold text-green-400">{currentPrice.toLocaleString()}</span>
              {strategy === 'grid' && (
                <span className="text-xs text-gray-500">
                  → Grid otomatis: <span className="text-yellow-400">${parseInt(lowerPrice).toLocaleString()}</span> — <span className="text-green-400">${parseInt(upperPrice).toLocaleString()}</span>
                  <span className="text-gray-600"> (±{DEFAULT_BOUNDARY_PCT}%)</span>
                </span>
              )}
            </div>
          )}
          {priceError && (
            <div className="bg-gray-800 rounded-lg p-3 text-sm text-red-400">
              {priceError} <span className="text-gray-500">— isi manual atau coba pair lain</span>
            </div>
          )}

          <div>
            <label className="text-sm text-gray-400 block mb-1">Nama Session <HelpIcon text="Nama bebas untuk membedakan session satu dengan lainnya" /></label>
            <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Nama session" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">Strategi <HelpIcon text={strategyHelp[strategy]} /></label>
            <select className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" value={strategy} onChange={e => setStrategy(e.target.value as any)}>
              <option value="grid">📐 Grid Trading — beli & jual di level harga</option>
              <option value="trend">📈 Trend Following — SMA crossover</option>
              <option value="dca">🪙 DCA — beli rutin berkala (Dollar Cost Average)</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">Mode <HelpIcon text={modeHelp[mode]} /></label>
            <select className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" value={mode} onChange={e => setMode(e.target.value as any)}>
              <option value="signal">📊 Signal — sinyal saja, tanpa eksekusi</option>
              <option value="paper">📝 Paper — trading simulasi (uang virtual $1000)</option>
              <option value="live">⚡ Live — trading sungguhan (RISIKO TINGGI)</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">Pair <HelpIcon text="Pilih pair crypto yang akan di-tradingkan" /></label>
            <select className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" value={symbol} onChange={e => setSymbol(e.target.value)}>
              <optgroup label="USDT Pairs">
                {PAIRS.filter(p => p.endsWith('_USDT')).map(p => <option key={p} value={p}>{p}</option>)}
              </optgroup>
              <optgroup label="IDR Pairs">
                {PAIRS.filter(p => p.endsWith('_IDR')).map(p => <option key={p} value={p}>{p}</option>)}
              </optgroup>
            </select>
          </div>

          {strategy === 'grid' ? (
            <>
              <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                <p><strong>Apa itu Grid Trading?</strong> Bot memasang order beli di harga rendah dan order jual di harga tinggi secara berjenjang. Setiap kali harga turun ke level beli, bot akan membeli. Saat harga naik ke level jual, bot akan menjual. Profit diambil dari selisih harga beli dan jual.</p>
                <p><strong>Batas Atas & Bawah:</strong> Menentukan rentang harga yang ingin Anda tradingkan. Bot akan memasang grid secara merata di antara kedua batas ini. Disarankan ±15% dari harga pasar saat ini ({currentPrice ? `~$${(currentPrice * 0.85).toLocaleString()} — $${(currentPrice * 1.15).toLocaleString()}` : 'contoh: BTC 60000-70000'}).</p>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-2">Konfigurasi Grid</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Harga Atas (jual)</span>{renderConfigHelp('upper_price')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="70000" value={upperPrice} onChange={e => setUpperPrice(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Harga Bawah (beli)</span>{renderConfigHelp('lower_price')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="60000" value={lowerPrice} onChange={e => setLowerPrice(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Jumlah Grid</span>{renderConfigHelp('grid_count')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="10" value={gridCount} onChange={e => setGridCount(e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Quantity per Order {renderConfigHelp('quantity')}</label>
                <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
            </>
          ) : strategy === 'trend' ? (
            <>
              <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                <p><strong>Apa itu Trend Following?</strong> Bot menggunakan 2 SMA (Simple Moving Average) untuk mendeteksi tren. SMA Cepat (fast period) bereaksi lebih cepat ke harga terbaru. SMA Lambat (slow period) lebih stabil.</p>
                <p><strong>Golden Cross (Beli):</strong> Terjadi saat SMA Cepat naik <em>di atas</em> SMA Lambat. Artinya tren naik mulai terbentuk — saat yang tepat untuk beli.</p>
                <p><strong>Death Cross (Jual):</strong> Terjadi saat SMA Cepat turun <em>di bawah</em> SMA Lambat. Artinya tren turun mulai terbentuk — saatnya jual atau hindari beli.</p>
                <p><strong>Saran per Pair:</strong> Pair stabil seperti BTC/ETH bisa pakai (fast=10, slow=30). Pair volatile seperti SOL/ADA bisa pakai (fast=7, slow=21) agar lebih responsif. Pair yang jarang bergerak seperti USDT/IDR tidak cocok untuk strategi ini.</p>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-2">Konfigurasi SMA</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">SMA Cepat</span>{renderConfigHelp('fast_period')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="10" value={fastPeriod} onChange={e => setFastPeriod(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">SMA Lambat</span>{renderConfigHelp('slow_period')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="30" value={slowPeriod} onChange={e => setSlowPeriod(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Qty per Order</span>{renderConfigHelp('quantity')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                <p><strong>Apa itu DCA?</strong> Dollar Cost Averaging — strategi membeli aset dalam jumlah tetap secara rutin, tanpa peduli harga sedang naik atau turun. Tujuannya adalah meratakan harga beli rata-rata.</p>
                <p><strong>Contoh:</strong> Beli $10 BTC setiap 1 jam. Saat harga turun, $10 dapat BTC lebih banyak. Saat harga naik, $10 dapat BTC lebih sedikit. Rata-rata harga beli jadi lebih stabil.</p>
                <p><strong>Take Profit:</strong> Jika diaktifkan, bot akan menjual semua posisi saat harga naik X% dari rata-rata harga beli. Contoh: 5% = jual saat harga naik 5%.</p>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-2">Konfigurasi DCA</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Interval Beli</span>{renderConfigHelp('dca_interval')}</div>
                    <select className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" value={dcaInterval} onChange={e => setDcaInterval(e.target.value)}>
                      <option value="3600">Setiap 1 Jam</option>
                      <option value="7200">Setiap 2 Jam</option>
                      <option value="21600">Setiap 6 Jam</option>
                      <option value="43200">Setiap 12 Jam</option>
                      <option value="86400">Setiap 1 Hari</option>
                      <option value="604800">Setiap 1 Minggu</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Jumlah (USDT)</span>{renderConfigHelp('dca_amount')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="10" value={dcaAmount} onChange={e => setDcaAmount(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Take Profit %</span>{renderConfigHelp('dca_take_profit')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="5" value={dcaTakeProfit} onChange={e => setDcaTakeProfit(e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          )}
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition">Buat Session</button>
        </form>
      )}

      {isLoading ? (
        <p className="text-gray-400">Loading...</p>
      ) : !sessions?.length ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">Belum ada session trading</p>
          <p className="text-gray-500 text-sm mt-2">Pilih rekomendasi di atas atau klik &quot;+ New Session&quot;</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div key={s.id} className="bg-gray-900 p-4 rounded-xl flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="text-sm text-gray-400">
                  {s.symbol} · {s.strategy === 'grid' ? 'Grid' : s.strategy === 'trend' ? 'Trend' : 'DCA'} ·{' '}
                  <span className={s.mode === 'live' ? 'text-yellow-400' : s.mode === 'paper' ? 'text-blue-400' : 'text-gray-400'}>
                    {s.mode === 'signal' ? 'Signal' : s.mode === 'paper' ? 'Paper' : 'Live'}
                  </span> ·{' '}
                  <span className={s.status === 'running' ? 'text-green-400' : 'text-gray-500'}>{s.status}</span>
                </p>
              </div>
              <div className="space-x-2">
                <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm" onClick={() => router.push(`/sessions/${s.id}`)}>Detail</button>
                {s.status === 'running' ? (
                  <button className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm" onClick={() => handleStop(s.id)}>Stop</button>
                ) : (
                  <button className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm" onClick={() => handleStart(s.id)}>Start</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
