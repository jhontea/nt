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

const fieldHelp: Record<string, string> = {
  upper_price: 'Harga tertinggi untuk grid. Bot akan mulai jual di level ini. Contoh: 70000 untuk BTC/USDT.',
  lower_price: 'Harga terendah untuk grid. Bot akan mulai beli di level ini. Contoh: 60000 untuk BTC/USDT.',
  grid_count: 'Jumlah level harga antara batas atas dan bawah. Makin banyak makin rapat order. 5-20 grid disarankan.',
  quantity: 'Jumlah aset per order. Untuk grid: 0.001 BTC. Untuk trend: sesuaikan dengan modal.',
  fast_period: 'Periode SMA cepat (lebih sensitif terhadap harga terbaru). Default: 10 candle.',
  slow_period: 'Periode SMA lambat (lebih stabil, melihat tren jangka panjang). Default: 30 candle.',
  dca_interval: 'Frekuensi pembelian rutin. Makin sering = makin Rata-rata harga beli.',
  dca_amount: 'Jumlah USDT yang dibelikan setiap interval. Contoh: 10 berarti beli $10 setiap interval.',
  dca_take_profit: 'Persentase kenaikan harga untuk menjual. 5 = jual saat harga naik 5% dari rata-rata beli.',
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
  { label: '🚀 Mulai Cepat — Grid Signal', desc: 'Buat session Grid Signal dengan pengaturan default. Cocok untuk pemula.', strategy: 'grid', mode: 'signal', symbol: 'BTC_USDT', config: { upper_price: 70000, lower_price: 60000, grid_count: 10, quantity: '0.001' } },
  { label: '📈 Trend Signal', desc: 'Ikuti tren pasar dengan SMA crossover. Mendeteksi golden cross dan death cross.', strategy: 'trend', mode: 'signal', symbol: 'BTC_USDT', config: { fast_period: 10, slow_period: 30, quantity: '0.001' } },
  { label: '🪙 DCA Paper $1000', desc: 'Simulasi DCA dengan uang virtual $1000. Beli $10 setiap jam, take profit 5%.', strategy: 'dca', mode: 'paper', symbol: 'BTC_USDT', config: { interval_sec: 3600, amount: '10', take_profit_pct: 5 } },
  { label: '📊 Grid Paper', desc: 'Simulasi Grid Trading dengan uang virtual $1000.', strategy: 'grid', mode: 'paper', symbol: 'ETH_USDT', config: { upper_price: 2500, lower_price: 2000, grid_count: 8, quantity: '0.01' } },
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
  const [upperPrice, setUpperPrice] = useState('70000')
  const [lowerPrice, setLowerPrice] = useState('60000')
  const [gridCount, setGridCount] = useState('10')
  const [quantity, setQuantity] = useState('0.001')
  const [fastPeriod, setFastPeriod] = useState('10')
  const [slowPeriod, setSlowPeriod] = useState('30')
  const [dcaInterval, setDcaInterval] = useState('3600')
  const [dcaAmount, setDcaAmount] = useState('10')
  const [dcaTakeProfit, setDcaTakeProfit] = useState('5')

  function applyPreset(p: Preset) {
    setStrategy(p.strategy)
    setMode(p.mode)
    setSymbol(p.symbol)
    setName(p.label.split('—')[1]?.trim() || p.label)
    if (p.strategy === 'grid') {
      setUpperPrice(String(p.config.upper_price))
      setLowerPrice(String(p.config.lower_price))
      setGridCount(String(p.config.grid_count))
      setQuantity(p.config.quantity)
    } else if (p.strategy === 'trend') {
      setFastPeriod(String(p.config.fast_period))
      setSlowPeriod(String(p.config.slow_period))
      setQuantity(p.config.quantity)
    } else {
      setDcaInterval(String(p.config.interval_sec))
      setDcaAmount(p.config.amount)
      setDcaTakeProfit(String(p.config.take_profit_pct))
    }
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
    return <HelpIcon text={fieldHelp[key] || ''} />
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

      {/* Rekomendasi / Presets */}
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
              <div>
                <label className="text-sm text-gray-400 block mb-2">Konfigurasi Grid</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Harga Atas</span>{renderConfigHelp('upper_price')}</div>
                    <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="70000" value={upperPrice} onChange={e => setUpperPrice(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1"><span className="text-xs text-gray-500">Harga Bawah</span>{renderConfigHelp('lower_price')}</div>
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
