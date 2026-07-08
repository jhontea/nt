'use client'
import { PriceBadge } from '@/components/PriceBadge'

export function MarketTicker() {
  return (
    <div className="relative flex items-center gap-3 bg-white dark:bg-[#1e201c] rounded-[24px] px-5 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-8 overflow-x-auto shadow-[0_1px_4px_rgba(14,15,12,0.04)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
      <span className="text-[10px] font-bold text-[#9fe870] tracking-widest uppercase flex-shrink-0 flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-[#9fe870] animate-pulse" />
        Live
      </span>
      <div className="w-px h-4 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)] flex-shrink-0" />
      <div className="flex gap-5">
        <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">BTC</span><PriceBadge symbol="BTC_USDT" compact /></div>
        <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
        <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">ETH</span><PriceBadge symbol="ETH_USDT" compact /></div>
        <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
        <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">BNB</span><PriceBadge symbol="BNB_USDT" compact /></div>
        <div className="w-px h-4 bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)] self-center" />
        <div className="flex-shrink-0 flex items-center gap-1.5"><span className="text-xs font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">SOL</span><PriceBadge symbol="SOL_USDT" compact /></div>
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-[#1e201c] to-transparent rounded-r-[24px] pointer-events-none" />
    </div>
  )
}
