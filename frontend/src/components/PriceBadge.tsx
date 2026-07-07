'use client'
import { useMarketTicker } from '@/lib/useMarketTicker'
import { useState, useEffect } from 'react'

export function PriceBadge({ symbol, compact }: { symbol: string; compact?: boolean }) {
  const { data, connected } = useMarketTicker(symbol)
  const [timeout, setTimeout_] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { if (!data) setTimeout_(true) }, 15000)
    return () => clearTimeout(t)
  }, [data])

  if (compact) {
    if (!data) {
      return <span className="text-xs text-[#686868]">⏳</span>
    }
    const price = parseFloat(data.lastPrice)
    const change = parseFloat(data.priceChange)
    const isUp = change >= 0
    return (
      <span className={`text-xs font-mono ${isUp ? 'text-[#054d28]' : 'text-[#d03238]'}`}>
        {price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
        <span className="ml-1">{isUp ? '▲' : '▼'} {Math.abs(parseFloat(data.priceChangePct))}%</span>
      </span>
    )
  }

  return (
    <div className="bg-[#f0f1ee] rounded-[16px] p-4">
      {!connected && !data ? (
        <p className="text-sm text-[#5a5b58]">⏳ Menghubungkan ke TokoCrypto untuk harga {symbol}...</p>
      ) : timeout && !data ? (
        <p className="text-sm text-[#7a5f00]">
          ⚠️ Tidak dapat terhubung ke TokoCrypto. Harga real-time tidak tersedia.{' '}
          <span className="text-[#5a5b58]">Coba refresh halaman.</span>
        </p>
      ) : !data ? (
        <p className="text-sm text-[#5a5b58]">⏳ Menunggu data harga {symbol}...</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs text-[#5a5b58] mb-1">{symbol}</p>
              <p className={`text-2xl font-bold font-mono ${parseFloat(data.priceChange) >= 0 ? 'text-[#054d28]' : 'text-[#d03238]'}`}>
                {parseFloat(data.lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
              </p>
            </div>
            <div className={`text-right ${parseFloat(data.priceChange) >= 0 ? 'text-[#054d28]' : 'text-[#d03238]'}`}>
              <p className="text-lg font-semibold">{parseFloat(data.priceChange) >= 0 ? '+' : ''}{data.priceChangePct}%</p>
              <p className="text-xs">{parseFloat(data.priceChange) >= 0 ? '+' : ''}{data.priceChange}</p>
            </div>
          </div>
          <div className="flex justify-between text-xs text-[#5a5b58] mt-3 pt-3 border-t border-[rgba(14,15,12,0.12)]">
            <span>24h H: {parseFloat(data.high24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
            <span>24h L: {parseFloat(data.low24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</span>
            <span>Vol: {parseFloat(data.volume).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </>
      )}
      {connected && !data && <p className="text-xs text-[#5a5b58] mt-2">Terhubung, menunggu data...</p>}
    </div>
  )
}
