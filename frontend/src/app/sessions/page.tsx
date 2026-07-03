'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'

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
    await api.sessions.create({ name: name || `${strategy}-${symbol}`, strategy, mode: 'signal', symbol, config: JSON.stringify(config) })
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
        <h1 className="text-2xl font-bold">Sessions</h1>
        <div className="space-x-3">
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition">
            {showCreate ? 'Cancel' : '+ New Session'}
          </button>
          <button onClick={logout} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition">Logout</button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-900 p-6 rounded-xl mb-6 space-y-4">
          <h2 className="font-semibold">New Session</h2>
          <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <select className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" value={strategy} onChange={e => setStrategy(e.target.value as any)}>
            <option value="grid">Grid Trading</option>
            <option value="trend">Trend Following</option>
          </select>
          <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Symbol (e.g. BTC_USDT)" value={symbol} onChange={e => setSymbol(e.target.value)} />
          {strategy === 'grid' ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <input className="px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Upper Price" value={upperPrice} onChange={e => setUpperPrice(e.target.value)} />
                <input className="px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Lower Price" value={lowerPrice} onChange={e => setLowerPrice(e.target.value)} />
                <input className="px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Grid Count" value={gridCount} onChange={e => setGridCount(e.target.value)} />
              </div>
              <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Quantity (e.g. 0.001)" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <input className="px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Fast Period" value={fastPeriod} onChange={e => setFastPeriod(e.target.value)} />
                <input className="px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Slow Period" value={slowPeriod} onChange={e => setSlowPeriod(e.target.value)} />
              </div>
              <input className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700" placeholder="Quantity" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </>
          )}
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition">Create & Start</button>
        </form>
      )}

      {isLoading ? (
        <p className="text-gray-400">Loading...</p>
      ) : !sessions?.length ? (
        <p className="text-gray-400">No sessions yet. Create one to start.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div key={s.id} className="bg-gray-900 p-4 rounded-xl flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="text-sm text-gray-400">
                  {s.symbol} · {s.strategy} · {s.mode} · {s.status}
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
