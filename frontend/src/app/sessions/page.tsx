'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { HelpIcon } from '@/components/HelpIcon'

const modeHelp: Record<string, string> = {
  signal: 'Bot hanya menganalisis pasar dan mencatat sinyal beli/jual. Tidak ada order sungguhan. Cocok untuk belajar.',
  paper: 'Bot melakukan trading simulasi dengan uang virtual $1000. Hasil trading dicatat sebagai profit/loss virtual.',
  live: 'Bot melakukan trading sungguhan menggunakan akun TokoCrypto Anda. RISIKO TINGGI — gunakan dengan hati-hati.',
}

const strategyHelp: Record<string, string> = {
  grid: 'Pasang order beli dan jual di level harga yang sudah ditentukan. Bot akan beli di harga rendah dan jual di harga tinggi secara otomatis.',
  trend: 'Bot mendeteksi tren pasar menggunakan SMA (Simple Moving Average). Golden cross = beli, death cross = jual.',
}

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
  const [strategy, setStrategy] = useState<'grid' | 'trend'>('grid')
  const [mode, setMode] = useState<'signal' | 'paper' | 'live'>('signal')
  const [symbol, setSymbol] = useState('BTC_USDT')
  const [upperPrice, setUpperPrice] = useState('70000')
  const [lowerPrice, setLowerPrice] = useState('60000')
  const [gridCount, setGridCount] = useState('10')
  const [quantity, setQuantity] = useState('0.001')
  const [fastPeriod, setFastPeriod] = useState('10')
  const [slowPeriod, setSlowPeriod] = useState('30')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    let config: any
    if (strategy === 'grid') {
      config = { upper_price: parseFloat(upperPrice), lower_price: parseFloat(lowerPrice), grid_count: parseInt(gridCount), quantity }
    } else {
      config = { fast_period: parseInt(fastPeriod), slow_period: parseInt(slowPeriod), quantity }
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Trading Sessions</h1>
        <div className="space-x-3">
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition">
            {showCreate ? 'Cancel' : '+ New Session'}
          </button>
          <button onClick={logout} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition">Logout</button>
        </div>
      </div>

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
              <option value="grid">Grid Trading — beli & jual di level harga</option>
              <option value="trend">Trend Following — SMA crossover</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">Mode <HelpIcon text={modeHelp[mode]} /></label>
            <select className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" value={mode} onChange={e => setMode(e.target.value as any)}>
              <option value="signal">Signal — sinyal saja, tanpa eksekusi</option>
              <option value="paper">Paper — trading simulasi (uang virtual $1000)</option>
              <option value="live">Live — trading sungguhan (RISIKO TINGGI)</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">Pair <HelpIcon text="Pair crypto yang akan di-tradingkan. Contoh: BTC_USDT, ETH_USDT, BNB_IDR" /></label>
            <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="e.g. BTC_USDT" value={symbol} onChange={e => setSymbol(e.target.value)} />
          </div>

          {strategy === 'grid' ? (
            <>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Grid — Harga & Jumlah Grid</label>
                <div className="grid grid-cols-3 gap-3">
                  <div><input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Harga Atas" value={upperPrice} onChange={e => setUpperPrice(e.target.value)} /><p className="text-xs text-gray-500 mt-1">Batas atas</p></div>
                  <div><input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Harga Bawah" value={lowerPrice} onChange={e => setLowerPrice(e.target.value)} /><p className="text-xs text-gray-500 mt-1">Batas bawah</p></div>
                  <div><input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Jumlah Grid" value={gridCount} onChange={e => setGridCount(e.target.value)} /><p className="text-xs text-gray-500 mt-1">Level harga</p></div>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Quantity per Order <HelpIcon text="Jumlah aset per order. Contoh: 0.001 BTC atau 10 USDT" /></label>
                <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="e.g. 0.001" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm text-gray-400 block mb-1">SMA Period <HelpIcon text="SMA = Simple Moving Average. Fast period lebih sensitif, slow period lebih stabil. Golden cross = fast SMA naik di atas slow SMA (sinyal beli)" /></label>
                <div className="grid grid-cols-3 gap-3">
                  <div><input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Fast Period" value={fastPeriod} onChange={e => setFastPeriod(e.target.value)} /><p className="text-xs text-gray-500 mt-1">SMA cepat</p></div>
                  <div><input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Slow Period" value={slowPeriod} onChange={e => setSlowPeriod(e.target.value)} /><p className="text-xs text-gray-500 mt-1">SMA lambat</p></div>
                  <div><input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Quantity" value={quantity} onChange={e => setQuantity(e.target.value)} /><p className="text-xs text-gray-500 mt-1">per order</p></div>
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
          <p className="text-gray-500 text-sm mt-2">Klik &quot;+ New Session&quot; untuk memulai</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div key={s.id} className="bg-gray-900 p-4 rounded-xl flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="text-sm text-gray-400">
                  {s.symbol} · {s.strategy === 'grid' ? 'Grid' : 'Trend'} ·{' '}
                  <span className={s.mode === 'live' ? 'text-yellow-400' : ''}>
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
