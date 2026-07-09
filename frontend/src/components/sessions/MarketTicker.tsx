'use client'
import { Fragment } from 'react'
import { PriceBadge } from '@/components/PriceBadge'

const DEFAULTS = ['BTC_USDT', 'ETH_USDT', 'BNB_USDT', 'SOL_USDT']

const label = (sym: string) => sym.split('_')[0]

export function MarketTicker({ symbols }: { symbols?: string[] }) {
  const pairs = (symbols?.length ? symbols : DEFAULTS)
  return (
    <div className="relative flex items-center gap-3 bg-white dark:bg-[#1e201c] rounded-[24px] px-5 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-8 overflow-x-auto shadow-[0_1px_4px_rgba(14,15,12,0.04)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
      <span className="text-[10px] font-bold text-[#7c7c72] tracking-widest uppercase flex-shrink-0">
        MARKET
      </span>
      <div className="w-px h-4 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)] flex-shrink-0" />
      <div className="flex gap-5">
        {pairs.map((sym, i) => (
          <Fragment key={sym}>
            {i > 0 && <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />}
            <div className="flex-shrink-0 flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{label(sym)}</span>
              <PriceBadge symbol={sym} compact />
            </div>
          </Fragment>
        ))}
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-[#1e201c] to-transparent rounded-r-[24px] pointer-events-none" />
    </div>
  )
}
