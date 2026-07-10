'use client'
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { api } from './api'

export function useLivePnl(liveIds: number[]): Record<number, { realized: number; trades: number } | null> {
  const livePnlQueries = useQueries({
    queries: liveIds.map(id => ({
      queryKey: ['pnl', id],
      queryFn: () => api.sessions.getPnL(id),
      enabled: liveIds.length > 0,
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
  })

  return useMemo(() => {
    const map: Record<number, { realized: number; trades: number } | null> = {}
    liveIds.forEach((id, i) => {
      const d = livePnlQueries[i]?.data
      map[id] = d ? { realized: parseFloat(d.realized_pnl), trades: d.trade_count } : null
    })
    return map
  }, [liveIds, livePnlQueries])
}
