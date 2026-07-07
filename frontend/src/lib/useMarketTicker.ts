'use client'
import { useEffect, useState } from 'react'
import { api } from './api'

const POLL_INTERVAL = 1000

export interface MarketTickerData {
  lastPrice: string
  open24h: string
  high24h: string
  low24h: string
  volume: string
  priceChange: string
  priceChangePct: string
}

interface MarketTickerState {
  data: MarketTickerData | null
  connected: boolean
}

// ponytail: module-level shared store — one interval drives all symbols, N hooks read from cache
const cache = new Map<string, MarketTickerData>()
const subscribers = new Map<string, Set<() => void>>()
const intervals = new Map<string, ReturnType<typeof setInterval>>()

function notify(symbol: string) {
  subscribers.get(symbol)?.forEach(cb => cb())
}

function restToData(t: { lastPrice: string; volume: string; priceChange: string; high24h: string; low24h: string }): MarketTickerData {
  const last = parseFloat(t.lastPrice)
  const change = parseFloat(t.priceChange)
  const open = last - change
  return {
    lastPrice: t.lastPrice,
    open24h: open.toFixed(8),
    high24h: t.high24h,
    low24h: t.low24h,
    volume: t.volume,
    priceChange: t.priceChange,
    priceChangePct: (open > 0 ? (change / open) * 100 : 0).toFixed(2),
  }
}

function subscribe(symbol: string, cb: () => void) {
  if (!subscribers.has(symbol)) subscribers.set(symbol, new Set())
  subscribers.get(symbol)!.add(cb)

  if (!intervals.has(symbol)) {
    const fetch = () =>
      api.sessions.getTicker(symbol).then(t => {
        cache.set(symbol, restToData(t))
        notify(symbol)
      }).catch(() => {})

    fetch()
    intervals.set(symbol, setInterval(fetch, POLL_INTERVAL))
  }

  return () => {
    subscribers.get(symbol)?.delete(cb)
    if (subscribers.get(symbol)?.size === 0) {
      clearInterval(intervals.get(symbol))
      intervals.delete(symbol)
      subscribers.delete(symbol)
      cache.delete(symbol)
    }
  }
}

export function useMarketTicker(symbol: string | null): MarketTickerState {
  const [data, setData] = useState<MarketTickerData | null>(() => symbol ? cache.get(symbol) ?? null : null)

  useEffect(() => {
    if (!symbol) return
    setData(cache.get(symbol) ?? null)
    return subscribe(symbol, () => setData(cache.get(symbol) ?? null))
  }, [symbol])

  return { data, connected: false }
}
