'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ChevronDown, ChevronUp, FlaskConical } from 'lucide-react'

interface Props {
  symbol: string
  fastPeriod: number
  slowPeriod: number
  interval: string
  quantity: number
}

function sma(prices: number[], period: number): number[] {
  return prices.map((_, i) => {
    if (i < period - 1) return 0
    const slice = prices.slice(i - period + 1, i + 1)
    return slice.reduce((a, b) => a + b, 0) / period
  })
}

interface Trade { side: 'buy' | 'sell'; price: number; pnl?: number }

function runBacktest(closes: number[], fast: number, slow: number, qty: number) {
  const fastSMA = sma(closes, fast)
  const slowSMA = sma(closes, slow)
  const trades: Trade[] = []
  let buyPrice = 0
  let holding = false
  let totalPnl = 0
  let wins = 0

  for (let i = slow; i < closes.length; i++) {
    const prevFast = fastSMA[i - 1]
    const prevSlow = slowSMA[i - 1]
    const currFast = fastSMA[i]
    const currSlow = slowSMA[i]
    if (prevFast <= 0 || prevSlow <= 0 || currFast <= 0 || currSlow <= 0) continue

    // Golden cross → buy
    if (!holding && prevFast <= prevSlow && currFast > currSlow) {
      buyPrice = closes[i]
      holding = true
      trades.push({ side: 'buy', price: closes[i] })
    }
    // Death cross → sell
    else if (holding && prevFast >= prevSlow && currFast < currSlow) {
      const pnl = (closes[i] - buyPrice) * qty
      totalPnl += pnl
      if (pnl > 0) wins++
      trades.push({ side: 'sell', price: closes[i], pnl })
      holding = false
    }
  }

  const sells = trades.filter(t => t.side === 'sell')
  const winRate = sells.length > 0 ? (wins / sells.length) * 100 : 0

  return { trades, totalPnl, winRate, tradeCount: sells.length }
}

export function TrendBacktest({ symbol, fastPeriod, slowPeriod, interval, quantity }: Props) {
  const [open, setOpen] = useState(false)
  const [backtestInterval, setBacktestInterval] = useState(interval || '1h')
  const [candleLimit, setCandleLimit] = useState(200)

  const { data: candles, isLoading } = useQuery({
    queryKey: ['backtest-candles', symbol, backtestInterval, candleLimit],
    queryFn: () => api.account.candles(symbol, backtestInterval, candleLimit),
    enabled: open,
    staleTime: 5 * 60_000,
  })

  const result = candles && candles.length >= slowPeriod
    ? runBacktest(candles.map(c => parseFloat(c.c)), fastPeriod, slowPeriod, quantity)
    : null

  return (
    <div className="mt-4 bg-white dark:bg-[#1e201c] rounded-[20px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[rgba(14,15,12,0.02)] dark:hover:bg-[rgba(232,235,230,0.02)] transition"
      >
        <FlaskConical size={14} className="text-[#686868] dark:text-[#898989] flex-shrink-0" />
        <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6] uppercase tracking-wider flex-1">Backtest</span>
        <span className="text-[10px] text-[#686868] dark:text-[#898989] mr-2">Simulasi sinyal historis</span>
        {open ? <ChevronUp size={14} className="text-[#686868] dark:text-[#898989]" /> : <ChevronDown size={14} className="text-[#686868] dark:text-[#898989]" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
          {/* Controls */}
          <div className="flex items-center gap-3 mt-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#686868] dark:text-[#898989]">Interval</span>
              <select value={backtestInterval} onChange={e => setBacktestInterval(e.target.value)}
                className="text-xs px-2 py-1 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-lg text-[#0e0f0c] dark:text-[#e8ebe6] focus:outline-none">
                {['5m','15m','30m','1h','4h','1d'].map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#686868] dark:text-[#898989]">Candles</span>
              <select value={candleLimit} onChange={e => setCandleLimit(Number(e.target.value))}
                className="text-xs px-2 py-1 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-lg text-[#0e0f0c] dark:text-[#e8ebe6] focus:outline-none">
                {[100,200,300,500].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <span className="text-[10px] text-[#686868] dark:text-[#898989]">
              SMA{fastPeriod}/{slowPeriod} · Qty {quantity}
            </span>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 animate-pulse py-4">
              <div className="w-3 h-3 rounded-full bg-[#9fe870]" />
              <span className="text-xs text-[#686868] dark:text-[#898989]">Mengambil data candle...</span>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#f8f9f6] dark:bg-[#252822] rounded-[14px] px-3 py-2.5">
                  <p className="text-[9px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Total P&L</p>
                  <p className={`text-base font-black mt-0.5 tabular-nums ${result.totalPnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                    {result.totalPnl >= 0 ? '+' : ''}${result.totalPnl.toFixed(2)}
                  </p>
                </div>
                <div className="bg-[#f8f9f6] dark:bg-[#252822] rounded-[14px] px-3 py-2.5">
                  <p className="text-[9px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Win Rate</p>
                  <p className={`text-base font-black mt-0.5 ${result.winRate >= 50 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                    {result.winRate.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-[#f8f9f6] dark:bg-[#252822] rounded-[14px] px-3 py-2.5">
                  <p className="text-[9px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wide">Trades</p>
                  <p className="text-base font-black mt-0.5 text-[#0e0f0c] dark:text-[#e8ebe6]">{result.tradeCount}</p>
                </div>
              </div>

              {/* Trade list */}
              {result.trades.length > 0 && (
                <div className="rounded-[14px] border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] overflow-auto max-h-[200px]">
                  <table className="w-full text-xs min-w-[300px]">
                    <thead className="sticky top-0 bg-white dark:bg-[#1e201c] z-10">
                      <tr className="border-b border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase">#</th>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase">Aksi</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase">Harga</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, i) => (
                        <tr key={i} className={`${i < result.trades.length - 1 ? 'border-b border-[rgba(14,15,12,0.04)] dark:border-[rgba(232,235,230,0.04)]' : ''}`}>
                          <td className="px-3 py-1.5 text-[#686868] dark:text-[#898989]">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            <span className={`font-bold ${t.side === 'buy' ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                              {t.side === 'buy' ? '▲ Buy' : '▼ Sell'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[#0e0f0c] dark:text-[#e8ebe6]">
                            {t.price < 1 ? t.price.toFixed(8) : t.price.toFixed(4)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                            {t.pnl != null
                              ? <span className={t.pnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}>
                                  {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                                </span>
                              : <span className="text-[#686868] dark:text-[#898989]">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.tradeCount === 0 && (
                <p className="text-xs text-[#686868] dark:text-[#898989] text-center py-2">
                  Tidak ada sinyal crossover dalam {candleLimit} candle terakhir dengan interval {backtestInterval}.
                </p>
              )}

              <p className="text-[9px] text-[#686868] dark:text-[#898989]">
                * Simulasi menggunakan harga close candle. Tidak memperhitungkan slippage, fee, atau partial fill.
              </p>
            </div>
          )}

          {candles && candles.length < slowPeriod && (
            <p className="text-xs text-[#686868] dark:text-[#898989] py-2">
              Data tidak cukup ({candles.length} candle, butuh minimal {slowPeriod}).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
