export function GridBar({ lower, upper, current, gridCount }: { lower: number; upper: number; current: number; gridCount: number }) {
  const range = upper - lower
  if (range <= 0) return null
  const pct = Math.max(0, Math.min(100, ((current - lower) / range) * 100))
  const mid = (lower + upper) / 2
  const isBuyZone = current < mid
  const fmt = (p: number) => p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return (
    <div className="relative w-full h-5 flex items-center">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full overflow-hidden" style={{
        background: 'linear-gradient(to right, rgba(208,50,56,0.08) 0%, rgba(208,50,56,0.08) 50%, rgba(159,232,112,0.1) 50%, rgba(159,232,112,0.1) 100%)'
      }}>
        <div className={`absolute inset-y-0 left-0 rounded-full ${isBuyZone ? 'bg-gradient-to-r from-[rgba(208,50,56,0.2)] to-[rgba(208,50,56,0.35)]' : 'bg-gradient-to-r from-[rgba(159,232,112,0.2)] to-[rgba(159,232,112,0.45)]'}`} style={{ width: `${pct}%` }} />
      </div>
      {Array.from({ length: gridCount + 1 }, (_, i) => (
        <div key={i} className="absolute top-0 bottom-0 w-px bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)]" style={{ left: `${(i / gridCount) * 100}%` }} />
      ))}
      <div className="absolute top-0 bottom-0 w-0.5 bg-[rgba(14,15,12,0.25)] dark:bg-[rgba(232,235,230,0.25)] rounded-full" style={{ left: '50%' }} />
      <div
        className={`absolute top-0 bottom-0 w-0.5 rounded-full ${isBuyZone ? 'bg-[#d03238] dark:bg-[#ff6b6f]' : 'bg-[#163300] dark:bg-[#9fe870]'}`}
        style={{ left: `${pct}%` }}
        title={`Harga: ${fmt(current)} · ${isBuyZone ? 'Buy zone' : 'Sell zone'}`}
      />
      <span className="absolute -bottom-3.5 left-0 text-[9px] text-[#686868] dark:text-[#898989]">{fmt(lower)}</span>
      <span className="absolute -bottom-3.5 text-[9px] text-[#686868] dark:text-[#898989]" style={{ left: '50%', transform: 'translateX(-50%)' }}>Mid</span>
      <span className="absolute -bottom-3.5 right-0 text-[9px] text-[#686868] dark:text-[#898989]">{fmt(upper)}</span>
    </div>
  )
}
