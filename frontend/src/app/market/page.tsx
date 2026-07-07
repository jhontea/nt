'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useMarketTicker } from '@/lib/useMarketTicker'

const MARKET_SYMBOLS = [
  { label: 'Ethereum', symbol: 'ETH_USDT' },
  { label: 'Solana', symbol: 'SOL_USDT' },
  { label: 'Shiba Inu', symbol: 'SHIB_USDT' },
  { label: 'Polkadot', symbol: 'DOT_USDT' },
  { label: 'Dogecoin', symbol: 'DOGE_USDT' },
  { label: 'Bitcoin', symbol: 'BTC_USDT' },
  { label: 'BNB', symbol: 'BNB_USDT' },
  { label: 'Tether', symbol: 'USDT_IDR' },
]

function formatUSDTPrice(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 8 : 2,
  })
}

function formatIDR(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}

function MarketPriceCard({ label, symbol, usdtIdrRate }: { label: string; symbol: string; usdtIdrRate: number | null }) {
  const { data } = useMarketTicker(symbol)

  if (!data) {
    return (
      <div className="bg-white rounded-xl p-5 border border-[rgba(14,15,12,0.08)]">
        <p className="text-sm text-[#686868]">{label}</p>
        <p className="text-xs text-[#5a5b58] mt-1">{symbol}</p>
        <p className="text-sm text-[#5a5b58] mt-4">Mengambil harga...</p>
      </div>
    )
  }

  const last = parseFloat(data.lastPrice)
  const changePct = parseFloat(data.priceChangePct)
  const isUp = changePct >= 0
  const isIDRPair = symbol.endsWith('_IDR')
  const approxIDR = !isIDRPair && usdtIdrRate ? last * usdtIdrRate : null

  return (
    <div className="bg-white rounded-xl p-5 border border-[rgba(14,15,12,0.08)] hover:border-[rgba(14,15,12,0.12)] transition">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#686868]">{label}</p>
          <p className="text-xs text-[#5a5b58] mt-1">{symbol}</p>
        </div>
        <div className={`text-sm font-semibold ${isUp ? 'text-[#054d28]' : 'text-[#d03238]'}`}>
          {isUp ? '+' : ''}{changePct.toFixed(2)}%
        </div>
      </div>

      <div className="mt-4">
        <p className="text-2xl font-bold font-mono text-[#0e0f0c]">
          {isIDRPair ? formatIDR(last) : `$${formatUSDTPrice(last)}`}
        </p>
        {approxIDR && (
          <p className="text-sm text-[#686868] mt-1">~ {formatIDR(approxIDR)}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[rgba(14,15,12,0.08)] text-xs text-[#5a5b58]">
        <div>
          <p>24h High</p>
          <p className="text-[#2a2b27] mt-1">{isIDRPair ? formatIDR(parseFloat(data.high24h)) : `$${formatUSDTPrice(parseFloat(data.high24h))}`}</p>
        </div>
        <div>
          <p>24h Low</p>
          <p className="text-[#2a2b27] mt-1">{isIDRPair ? formatIDR(parseFloat(data.low24h)) : `$${formatUSDTPrice(parseFloat(data.low24h))}`}</p>
        </div>
        <div>
          <p>Volume</p>
          <p className="text-[#2a2b27] mt-1">{parseFloat(data.volume).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        </div>
      </div>
    </div>
  )
}

export default function MarketPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  const { data: usdtIdr } = useMarketTicker('USDT_IDR')
  const usdtIdrRate = usdtIdr ? parseFloat(usdtIdr.lastPrice) : null

  useEffect(() => {
    if (initialized && !isAuthenticated) router.push('/login')
  }, [initialized, isAuthenticated, router])

  if (!initialized || !isAuthenticated) return null

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button onClick={() => router.push('/sessions')} className="text-[#686868] hover:text-[#0e0f0c] mb-3 block">&larr; Back to Dashboard</button>
          <h1 className="text-2xl font-bold">Market Price</h1>
          <p className="text-sm text-[#5a5b58]">Harga pasar aktual untuk pair utama di TokoCrypto</p>
        </div>
        <div className="space-x-3">
          <button onClick={() => router.push('/glossary')} className="px-4 py-2 bg-[#e8ebe6] hover:bg-[#f0f1ee] rounded-lg transition text-sm">📖 Glosarium</button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 mb-6 text-sm text-[#686868]">
        Halaman ini menampilkan harga pair utama di TokoCrypto. Untuk pair USDT, harga juga dikonversi kira-kira ke rupiah memakai kurs <span className="text-[#2a2b27] font-medium">USDT/IDR</span>{usdtIdrRate ? ` (${formatIDR(usdtIdrRate)})` : ''}.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {MARKET_SYMBOLS.map(item => (
          <MarketPriceCard key={item.symbol} label={item.label} symbol={item.symbol} usdtIdrRate={usdtIdrRate} />
        ))}
      </div>
    </div>
  )
}
