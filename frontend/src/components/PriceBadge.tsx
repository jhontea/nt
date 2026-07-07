'use client'
import { useMarketTicker } from '@/lib/useMarketTicker'

export function PriceBadge({ symbol, compact }: { symbol: string; compact?: boolean }) {
  const { data, connected } = useMarketTicker(symbol)

  if (!connected || !data) return null

  const price = parseFloat(data.lastPrice)
  const change = parseFloat(data.priceChange)
  const isUp = change >= 0

  if (compact) {
    return (
      <span className={`text-xs font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
        {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
        <span className="ml-1">{isUp ? '▲' : '▼'} {Math.abs(parseFloat(data.priceChangePct))}%</span>
      </span>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{symbol}</p>
          <p className={`text-2xl font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
            {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
          </p>
        </div>
        <div className={`text-right ${isUp ? 'text-green-400' : 'text-red-400'}`}>
          <p className="text-lg font-semibold">{isUp ? '+' : ''}{data.priceChangePct}%</p>
          <p className={`text-xs ${isUp ? 'text-green-500' : 'text-red-500'}`}>{isUp ? '+' : ''}{data.priceChange}</p>
        </div>
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-700">
        <span>24h H: {parseFloat(data.high24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
        <span>24h L: {parseFloat(data.low24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
        <span>Vol: {parseFloat(data.volume).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      {!connected && <p className="text-xs text-yellow-500 mt-1">⏳ Menghubungkan...</p>}
    </div>
  )
}
