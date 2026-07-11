export function DCABar({ avgBuy, current, tpPct, slPct, cur }: { avgBuy: number; current: number; tpPct: number; slPct: number; cur: string }) {
  if (avgBuy <= 0) return null
  const gainPct = ((current - avgBuy) / avgBuy) * 100

  const leftEdge = slPct > 0 ? -slPct : Math.min(-5, gainPct * 1.2)
  const rightEdge = tpPct > 0 ? tpPct : Math.max(5, gainPct * 1.2)
  const totalRange = rightEdge - leftEdge

  const dotPct = Math.max(0, Math.min(100, ((gainPct - leftEdge) / totalRange) * 100))
  const avgLinePct = Math.max(0, Math.min(100, ((0 - leftEdge) / totalRange) * 100))
  const tpLinePct = tpPct > 0 ? Math.max(0, Math.min(100, ((tpPct - leftEdge) / totalRange) * 100)) : null
  const slLinePct = slPct > 0 ? Math.max(0, Math.min(100, ((-slPct - leftEdge) / totalRange) * 100)) : null

  const isProfit = gainPct >= 0
  const nearTP = tpPct > 0 && gainPct >= tpPct * 0.8 && gainPct < tpPct
  const nearSL = slPct > 0 && gainPct <= -slPct * 0.8 && gainPct > -slPct

  const dotColor = nearTP ? '#9fe870' : nearSL ? '#ff6b6f' : isProfit ? '#9fe870' : '#ff6b6f'

  return (
    <div className="w-full mt-3 mb-1">
      <div className="flex items-center justify-between text-[10px] mb-1.5">
        <span className="text-[#686868] dark:text-[#898989]">
          Avg beli <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{cur}{avgBuy.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
        </span>
        <span className={`font-bold ${isProfit ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
          {nearTP && <span className="ml-1 animate-pulse"> · Mendekati TP!</span>}
          {nearSL && <span className="ml-1 animate-pulse text-[#ff6b6f]"> · Mendekati SL!</span>}
        </span>
      </div>

      <div className="relative w-full h-5 flex items-center">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full overflow-hidden" style={{
          background: `linear-gradient(to right, rgba(208,50,56,0.15) 0%, rgba(208,50,56,0.15) ${avgLinePct}%, rgba(159,232,112,0.15) ${avgLinePct}%, rgba(159,232,112,0.15) 100%)`
        }} />
        {slLinePct !== null && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-[#ff6b6f] opacity-70 rounded-full" style={{ left: `${slLinePct}%` }} />
        )}
        <div className="absolute top-0 bottom-0 w-0.5 bg-[rgba(140,140,140,0.5)] rounded-full" style={{ left: `${avgLinePct}%` }} />
        {tpLinePct !== null && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-[#9fe870] opacity-70 rounded-full" style={{ left: `${tpLinePct}%` }} />
        )}
        <div className="absolute w-3 h-3 rounded-full border-2 border-white dark:border-[#1e201c] shadow transition-all" style={{
          left: `${dotPct}%`,
          transform: 'translateX(-50%)',
          background: dotColor,
        }} />
      </div>

      <div className="relative mt-1" style={{ height: '14px' }}>
        {slLinePct !== null && (
          <span className="absolute text-[9px] text-[#d03238] dark:text-[#ff6b6f]" style={{ left: `${slLinePct}%`, transform: 'translateX(-50%)' }}>
            -{slPct}%
          </span>
        )}
        <span className="absolute text-[9px] text-[#686868] dark:text-[#898989]" style={{ left: `${avgLinePct}%`, transform: 'translateX(-50%)' }}>
          avg
        </span>
        {tpLinePct !== null && (
          <span className="absolute text-[9px] text-[#054d28] dark:text-[#9fe870]" style={{ left: `${tpLinePct}%`, transform: 'translateX(-50%)' }}>
            +{tpPct}%
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] flex-wrap gap-1">
        {slPct > 0 && (
          <span className="text-[#686868] dark:text-[#898989]">
            SL <span className="font-semibold text-[#d03238] dark:text-[#ff6b6f]">{cur}{(avgBuy * (1 - slPct / 100)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            {' '}({(gainPct - (-slPct)).toFixed(2)}% menuju SL)
          </span>
        )}
        {tpPct > 0 && (
          <span className="text-[#686868] dark:text-[#898989]">
            TP <span className="font-semibold text-[#054d28] dark:text-[#9fe870]">{cur}{(avgBuy * (1 + tpPct / 100)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
            {' '}{gainPct >= tpPct ? <span className="text-[#054d28] dark:text-[#9fe870] font-semibold">(sudah terlampaui +{(gainPct - tpPct).toFixed(2)}%)</span> : `(${(tpPct - gainPct).toFixed(2)}% lagi)`}
          </span>
        )}
      </div>
    </div>
  )
}
