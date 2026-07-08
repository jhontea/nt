'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useMarketTicker } from '@/lib/useMarketTicker'
import { Navbar } from '@/components/Navbar'

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
      <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] animate-pulse">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="h-3 w-20 bg-[#f0f1ee] dark:bg-[#252822] rounded-full mb-2" />
            <div className="h-2 w-16 bg-[#f0f1ee] dark:bg-[#252822] rounded-full" />
          </div>
          <div className="h-4 w-10 bg-[#f0f1ee] dark:bg-[#252822] rounded-full" />
        </div>
        <div className="h-7 w-32 bg-[#f0f1ee] dark:bg-[#252822] rounded-full mb-4" />
        <div className="grid grid-cols-3 gap-2 border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] pt-3">
          <div className="h-2 bg-[#f0f1ee] dark:bg-[#252822] rounded-full" />
          <div className="h-2 bg-[#f0f1ee] dark:bg-[#252822] rounded-full" />
          <div className="h-2 bg-[#f0f1ee] dark:bg-[#252822] rounded-full" />
        </div>
      </div>
    )
  }

  const last = parseFloat(data.lastPrice)
  const changePct = parseFloat(data.priceChangePct)
  const isUp = changePct >= 0
  const isIDRPair = symbol.endsWith('_IDR')
  const approxIDR = !isIDRPair && usdtIdrRate ? last * usdtIdrRate : null

  return (
    <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.2)] hover:shadow-[0_8px_32px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#686868] dark:text-[#898989]">{label}</p>
          <p className="text-xs text-[#5a5b58] dark:text-[#8a8d88] mt-1">{symbol}</p>
        </div>
        <div className={`text-sm font-semibold ${isUp ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {isUp ? '+' : ''}{changePct.toFixed(2)}%
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xl sm:text-2xl font-bold font-mono text-[#0e0f0c] dark:text-[#e8ebe6] truncate">
          {isIDRPair ? formatIDR(last) : `$${formatUSDTPrice(last)}`}
        </p>
        {approxIDR && (
          <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">~ {formatIDR(approxIDR)}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mt-3 pt-3 text-xs text-[#5a5b58] dark:text-[#8a8d88]">
        <div>
          <p>24h High</p>
          <p className="text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{isIDRPair ? formatIDR(parseFloat(data.high24h)) : `$${formatUSDTPrice(parseFloat(data.high24h))}`}</p>
        </div>
        <div>
          <p>24h Low</p>
          <p className="text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{isIDRPair ? formatIDR(parseFloat(data.low24h)) : `$${formatUSDTPrice(parseFloat(data.low24h))}`}</p>
        </div>
        <div>
          <p>Volume</p>
          <p className="text-[#0e0f0c] dark:text-[#e8ebe6] mt-1">{parseFloat(data.volume).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
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
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="market" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Market Price</h1>
        <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">Harga pasar aktual untuk pair utama di TokoCrypto</p>

        <div className="bg-[rgba(14,15,12,0.02)] dark:bg-[rgba(232,235,230,0.04)] rounded-[16px] p-4 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-8 mt-4 text-sm text-[#686868] dark:text-[#898989]">
          Halaman ini menampilkan harga pair utama di TokoCrypto. Untuk pair USDT, harga juga dikonversi kira-kira ke rupiah memakai kurs <span className="text-[#0e0f0c] dark:text-[#e8ebe6] font-medium">USDT/IDR</span>{usdtIdrRate ? ` (${formatIDR(usdtIdrRate)})` : ''}.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {MARKET_SYMBOLS.map(item => (
            <MarketPriceCard key={item.symbol} label={item.label} symbol={item.symbol} usdtIdrRate={usdtIdrRate} />
          ))}
        </div>
      </div>
    </div>
  )
}
