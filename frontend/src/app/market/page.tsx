'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useMarketTicker } from '@/lib/useMarketTicker'
import { Navbar } from '@/components/Navbar'
import { Search } from 'lucide-react'


const MARKET_SYMBOLS = [
  { label: 'Bitcoin', symbol: 'BTC_USDT' },
  { label: 'Ethereum', symbol: 'ETH_USDT' },
  { label: 'Solana', symbol: 'SOL_USDT' },
  { label: 'BNB', symbol: 'BNB_USDT' },
  { label: 'Dogecoin', symbol: 'DOGE_USDT' },
  { label: 'Shiba Inu', symbol: 'SHIB_USDT' },
  { label: 'Polkadot', symbol: 'DOT_USDT' },
  { label: 'USDT → IDR', symbol: 'USDT_IDR' },
]

function formatUSDTPrice(value: number) {
  return value.toLocaleString('en-US', {
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

function safeNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function MarketPriceCard({ label, symbol, usdtIdrRate }: { label: string; symbol: string; usdtIdrRate: number | null }) {
  const { data, connected, updatedAt } = useMarketTicker(symbol)

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

  const last = safeNumber(data.lastPrice)
  const changePct = safeNumber(data.priceChangePct)
  const high = safeNumber(data.high24h)
  const low = safeNumber(data.low24h)
  const volume = safeNumber(data.volume)
  const isUp = (changePct ?? 0) >= 0
  const isIDRPair = symbol.endsWith('_IDR')
  const approxIDR = !isIDRPair && usdtIdrRate && last != null ? last * usdtIdrRate : null
  const formatMarketValue = (value: number | null) => value == null ? '—' : isIDRPair ? formatIDR(value) : `$${formatUSDTPrice(value)}`

  return (
    <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.2)] hover:shadow-[0_8px_32px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${isUp ? 'bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
            {symbol.split('_')[0].slice(0, 3)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{label}</p>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-[#9fe870] animate-pulse' : 'bg-[#ffd11a]'}`} title={connected ? 'Data langsung' : 'Menunggu data'} />
            </div>
            <p className="text-xs text-[#5a5b58] dark:text-[#8a8d88]">{symbol.replace('_', '/')}</p>
          </div>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-sm font-bold ${isUp ? 'bg-[rgba(159,232,112,0.15)] text-[#054d28] dark:text-[#9fe870]' : 'bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {changePct == null ? '—' : `${isUp ? '+' : ''}${changePct.toFixed(2)}%`}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-2xl sm:text-3xl font-black font-mono text-[#0e0f0c] dark:text-[#e8ebe6] truncate">
          {last == null ? '—' : isIDRPair ? formatIDR(last) : `${formatUSDTPrice(last)} USDT`}
        </p>
        {approxIDR && (
          <p className="text-sm text-[#686868] dark:text-[#898989] mt-1 truncate">~ {formatIDR(approxIDR)}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mt-3 pt-3 text-xs">
        <div>
          <p className="text-[#686868] dark:text-[#898989]">↑ 24h High</p>
          <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5 truncate" title={formatMarketValue(high)}>{formatMarketValue(high)}</p>
        </div>
        <div>
          <p className="text-[#686868] dark:text-[#898989]">↓ 24h Low</p>
          <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5 truncate" title={formatMarketValue(low)}>{formatMarketValue(low)}</p>
        </div>
        <div>
          <p className="text-[#686868] dark:text-[#898989]">Vol (24h)</p>
          <p className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] mt-0.5">
            {volume == null ? '—' : compactNumber(volume)}
            <span className="text-[#686868] dark:text-[#898989] ml-1 font-normal text-[10px]">{symbol.split('_')[0]}</span>
          </p>
        </div>
      </div>
      <p className="text-[10px] text-[#686868] dark:text-[#898989] mt-3 text-right">
        {updatedAt ? `Diperbarui ${new Date(updatedAt).toLocaleTimeString('id-ID')}` : 'Menunggu pembaruan'}
      </p>
    </div>
  )
}

export default function MarketPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [quoteFilter, setQuoteFilter] = useState<'all' | 'USDT' | 'IDR'>('all')
  const { data: usdtIdr } = useMarketTicker('USDT_IDR')
  const usdtIdrRate = safeNumber(usdtIdr?.lastPrice)
  const filteredSymbols = MARKET_SYMBOLS.filter(item =>
    (quoteFilter === 'all' || item.symbol.endsWith(`_${quoteFilter}`)) &&
    `${item.label} ${item.symbol}`.toLowerCase().includes(search.trim().toLowerCase())
  )

  useEffect(() => {
    if (initialized && !isAuthenticated) router.push('/login')
  }, [initialized, isAuthenticated, router])

  if (!initialized) return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411] flex items-center justify-center">
      <div className="flex items-center gap-2 text-[#686868] dark:text-[#898989] animate-pulse">
        <span className="w-2 h-2 rounded-full bg-[#9fe870]" />
        <span className="text-sm">Memuat...</span>
      </div>
    </div>
  )
  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="market" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6 mt-0 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989]">Pasar Kripto</p>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(159,232,112,0.15)] border border-[rgba(159,232,112,0.3)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#054d28] dark:text-[#9fe870]">Live</span>
              </span>
            </div>
            <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Harga Pasar</h1>
            <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">
              Harga kripto terkini langsung dari TokoCrypto{usdtIdrRate ? <> · <span className="text-[#0e0f0c] dark:text-[#e8ebe6] font-medium">USDT = {formatIDR(usdtIdrRate)}</span></> : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#686868] dark:text-[#898989]" />
            <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Cari pair market" placeholder="Cari BTC, ETH, pair..." className="w-full pl-10 pr-4 py-2.5 rounded-[12px] bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.1)] dark:border-[rgba(232,235,230,0.1)] text-sm text-[#0e0f0c] dark:text-[#e8ebe6] focus:outline-none focus:ring-2 focus:ring-[rgba(159,232,112,0.35)]" />
          </div>
          <div className="flex gap-1 p-1 rounded-full bg-[#f0f1ee] dark:bg-[#252822]" aria-label="Filter quote market">
            {(['all', 'USDT', 'IDR'] as const).map(filter => (
              <button key={filter} onClick={() => setQuoteFilter(filter)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${quoteFilter === filter ? 'bg-white dark:bg-[#1e201c] text-[#0e0f0c] dark:text-[#e8ebe6] shadow-sm' : 'text-[#686868] dark:text-[#a5a8a2]'}`}>
                {filter === 'all' ? 'Semua' : filter}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-[#686868] dark:text-[#a5a8a2] mb-4">
          Menampilkan {filteredSymbols.length} pair · data dimuat bertahap dan diperbarui otomatis.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredSymbols.map(item => (
            <MarketPriceCard key={item.symbol} label={item.label} symbol={item.symbol} usdtIdrRate={usdtIdrRate} />
          ))}
        </div>
        {filteredSymbols.length === 0 && <p className="text-sm text-[#686868] dark:text-[#898989] py-12 text-center">Pair tidak ditemukan.</p>}
      </div>
    </div>
  )
}
