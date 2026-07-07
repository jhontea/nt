'use client'
import { useEffect, useState } from 'react'
import { api } from './api'

const POLL_INTERVAL = 1000

interface MarketTickerData {
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

function restToData(ticker: { lastPrice: string; volume: string; priceChange: string }): MarketTickerData {
  const last = parseFloat(ticker.lastPrice)
  const change = parseFloat(ticker.priceChange)
  const open = last - change
  const changePct = open > 0 ? (change / open) * 100 : 0
  return {
    lastPrice: ticker.lastPrice,
    open24h: open.toFixed(8),
    high24h: '0',
    low24h: '0',
    volume: ticker.volume,
    priceChange: ticker.priceChange,
    priceChangePct: changePct.toFixed(2),
  }
}

export function useMarketTicker(symbol: string | null): MarketTickerState {
  const [state, setState] = useState<MarketTickerState>({ data: null, connected: false })

  useEffect(() => {
    if (!symbol) return
    let cancelled = false

    async function fetchTicker() {
      try {
        const ticker = await api.sessions.getTicker(symbol!)
        if (!cancelled) {
          setState({ data: restToData(ticker), connected: false })
        }
      } catch { /* backend might be down */ }
    }

    fetchTicker()
    const id = setInterval(fetchTicker, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  return state
}
