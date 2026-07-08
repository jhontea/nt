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
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${isUp ? 'bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
            {symbol.split('_')[0].slice(0, 3)}
          </div>
          <div>
            <p className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{label}</p>
            <p className="text-xs text-[#5a5b58] dark:text-[#8a8d88]">{symbol}</p>
          </div>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-sm font-bold ${isUp ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {isUp ? '+' : ''}{changePct.toFixed(2)}%
        </div>
      </div>

      <div className="mt-4">
        <p className="text-2xl sm:text-3xl font-black font-mono text-[#0e0f0c] dark:text-[#e8ebe6] truncate">
          {isIDRPair ? formatIDR(last) : `$${formatUSDTPrice(last)}`}
        </p>
        {approxIDR && (
          <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">~ {formatIDR(approxIDR)}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mt-3 pt-3 text-xs">
        <div>
          <p className="text-[#686868] dark:text-[#898989]">↑ 24h High</p>
          <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{isIDRPair ? formatIDR(parseFloat(data.high24h)) : `$${formatUSDTPrice(parseFloat(data.high24h))}`}</p>
        </div>
        <div>
          <p className="text-[#686868] dark:text-[#898989]">↓ 24h Low</p>
          <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{isIDRPair ? formatIDR(parseFloat(data.low24h)) : `$${formatUSDTPrice(parseFloat(data.low24h))}`}</p>
        </div>
        <div>
          <p className="text-[#686868] dark:text-[#898989]">Vol</p>
          <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">{parseFloat(data.volume).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
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
        <div className="flex items-center justify-between mb-6 mt-0 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Market</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">
              Harga live TokoCrypto{usdtIdrRate ? <> · <span className="text-[#0e0f0c] dark:text-[#e8ebe6] font-medium">USDT = {formatIDR(usdtIdrRate)}</span></> : ''}
            </p>
          </div>
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
