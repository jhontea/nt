'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { PriceBadge } from '@/components/PriceBadge'

const MARKET_SYMBOLS = [
  { label: 'Ethereum', symbol: 'ETH_USDT' },
  { label: 'Solana', symbol: 'SOL_USDT' },
  { label: 'Shiba Inu', symbol: 'SHIB_USDT' },
  { label: 'Polkadot', symbol: 'DOT_USDT' },
  { label: 'Dogecoin', symbol: 'DOGE_USDT' },
  { label: 'Bitcoin', symbol: 'BTC_USDT' },
  { label: 'BNB', symbol: 'BNB_USDT' },
]

export default function MarketPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (initialized && !isAuthenticated) router.push('/login')
  }, [initialized, isAuthenticated, router])

  if (!initialized || !isAuthenticated) return null

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button onClick={() => router.push('/sessions')} className="text-gray-400 hover:text-white mb-3 block">&larr; Back to Dashboard</button>
          <h1 className="text-2xl font-bold">Market Price</h1>
          <p className="text-sm text-gray-500">Harga pasar aktual untuk pair utama di TokoCrypto</p>
        </div>
        <div className="space-x-3">
          <button onClick={() => router.push('/glossary')} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm">📖 Glosarium</button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-4 mb-6 text-sm text-gray-400">
        Halaman ini menampilkan harga dari pair USDT yang umum dipakai. Data diambil dari cache backend yang menerima update real-time dari TokoCrypto.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {MARKET_SYMBOLS.map(item => (
          <div key={item.symbol} className="space-y-2">
            <div className="text-sm text-gray-400 px-1">{item.label}</div>
            <PriceBadge symbol={item.symbol} />
          </div>
        ))}
      </div>
    </div>
  )
}
