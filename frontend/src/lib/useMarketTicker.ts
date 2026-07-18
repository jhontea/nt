'use client'
import { useEffect, useState } from 'react'
import { api } from './api'

const POLL_INTERVAL = 2500

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
  updatedAt: number | null
}

// ponytail: one interval drives all symbols, subscribers read from shared cache
const cache = new Map<string, MarketTickerData>()
const updatedAtCache = new Map<string, number>()
const subscribers = new Map<string, Set<() => void>>()
let bulkInterval: ReturnType<typeof setInterval> | null = null

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

function fetchAll() {
  const symbols = Array.from(subscribers.keys())
  if (!symbols.length) return
  api.sessions.getTickersBulk(symbols).then(result => {
    for (const [sym, t] of Object.entries(result)) {
      if ((t as any).error) continue
      cache.set(sym, restToData(t as any))
      updatedAtCache.set(sym, Date.now())
      notify(sym)
    }
  }).catch(() => {})
}

function ensureInterval() {
  if (!bulkInterval) {
    fetchAll()
    bulkInterval = setInterval(fetchAll, POLL_INTERVAL)
  }
}

function stopIntervalIfIdle() {
  if (subscribers.size === 0 && bulkInterval) {
    clearInterval(bulkInterval)
    bulkInterval = null
  }
}

function subscribe(symbol: string, cb: () => void) {
  if (!subscribers.has(symbol)) subscribers.set(symbol, new Set())
  subscribers.get(symbol)!.add(cb)
  ensureInterval()

  return () => {
    subscribers.get(symbol)?.delete(cb)
    if (subscribers.get(symbol)?.size === 0) {
      subscribers.delete(symbol)
      cache.delete(symbol)
      updatedAtCache.delete(symbol)
    }
    stopIntervalIfIdle()
  }
}

export function useMarketTicker(symbol: string | null): MarketTickerState {
  const [data, setData] = useState<MarketTickerData | null>(() => symbol ? cache.get(symbol) ?? null : null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(() => symbol ? updatedAtCache.get(symbol) ?? null : null)

  useEffect(() => {
    if (!symbol) return
    setData(cache.get(symbol) ?? null)
    setUpdatedAt(updatedAtCache.get(symbol) ?? null)
    return subscribe(symbol, () => {
      setData(cache.get(symbol) ?? null)
      setUpdatedAt(updatedAtCache.get(symbol) ?? null)
    })
  }, [symbol])

  return { data, connected: data != null, updatedAt }
}
