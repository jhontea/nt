'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Mover } from '@/types'

function formatVolume(v: string): string {
  const n = parseFloat(v)
  if (!isFinite(n)) return '-'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'
  return n.toFixed(2)
}

function Row({ m }: { m: Mover }) {
  const pct = parseFloat(m.priceChangePercent)
  const up = pct >= 0
  const currency = m.symbol.endsWith('_IDR') ? 'Rp' : '$'
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{m.symbol.replace('_', '/')}</span>
      <span className="flex items-center gap-2">
        <span className="text-[#686868] dark:text-[#898989]">{currency}{parseFloat(m.lastPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className={`font-semibold ${up ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
          {up ? '+' : ''}{pct.toFixed(2)}%
        </span>
        <span className="text-[9px] text-[#686868] dark:text-[#898989] w-12 text-right">{formatVolume(m.volume)}</span>
      </span>
    </div>
  )
}

function Column({ title, items }: { title: string; items: Mover[] }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-widest mb-1">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[#686868] dark:text-[#898989] py-1">Memuat…</p>
      ) : (
        items.map(m => <Row key={m.symbol} m={m} />)
      )}
    </div>
  )
}

const divider = <div className="w-px self-stretch bg-[rgba(14,15,12,0.08)] dark:bg-[rgba(232,235,230,0.08)]" />

export function MarketMovers() {
  const { data, isLoading } = useQuery({
    queryKey: ['marketMovers'],
    queryFn: api.sessions.getMovers,
    refetchInterval: 5000,
    retry: false,
  })

  const gu = data?.gainersUsdt ?? []
  const gi = data?.gainersIdr ?? []
  const hu = data?.hotUsdt ?? []
  const hi = data?.hotIdr ?? []
  const empty = isLoading && gu.length === 0 && gi.length === 0 && hu.length === 0 && hi.length === 0

  return (
    <div className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-6 flex flex-wrap gap-x-4 gap-y-4">
      {empty ? (
        <p className="text-xs text-[#686868] dark:text-[#898989]">Memuat data pasar…</p>
      ) : (
        <>
          <Column title="Top Gainers USDT" items={gu} />
          {divider}
          <Column title="Top Gainers IDR" items={gi} />
          {divider}
          <Column title="Hot Pairs USDT" items={hu} />
          {divider}
          <Column title="Hot Pairs IDR" items={hi} />
        </>
      )}
    </div>
  )
}
