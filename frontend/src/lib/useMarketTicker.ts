'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from './api'

const WS_URLS = [
  'wss://stream-cloud.tokocrypto.site/stream/ws',
  'wss://stream-cloud.tokocrypto.site/stream',
  'wss://stream-toko.2meta.app/stream',
  'wss://www.tokocrypto.com/stream',
]
const REST_INTERVAL = 30000
const WS_TIMEOUT = 8000 // fall back to REST if WS doesn't connect in 8s

interface MarketTickerData {
  lastPrice: string
  open24h: string
  high24h: string
  low24h: string
  volume: string
  quoteVolume: string
  priceChange: string
  priceChangePct: string
}

interface MarketTickerState {
  data: MarketTickerData | null
  connected: boolean
  source: 'rest' | 'ws'
}

function symbolToStream(symbol: string): string {
  return symbol.toLowerCase().replace('_', '') + '@miniTicker'
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
    quoteVolume: '0',
    priceChange: ticker.priceChange,
    priceChangePct: changePct.toFixed(2),
  }
}

export function useMarketTicker(symbol: string | null): MarketTickerState {
  const [state, setState] = useState<MarketTickerState>({ data: null, connected: false, source: 'rest' })
  const wsRef = useRef<WebSocket | null>(null)

  // REST polling — always works
  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    async function fetchREST() {
      try {
        const ticker = await api.sessions.getTicker(symbol!)
        if (!cancelled) setState(prev => prev.source === 'rest' ? { data: restToData(ticker), connected: false, source: 'rest' } : prev)
      } catch { /* backend might be down */ }
    }
    fetchREST()
    const id = setInterval(fetchREST, REST_INTERVAL)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  // WebSocket — realtime upgrade, best-effort, try multiple URLs
  useEffect(() => {
    if (!symbol) return
    let ws: WebSocket | null = null
    let timeout: ReturnType<typeof setTimeout> | undefined
    let wsConnected = false

    function tryConnect(index: number) {
      if (index >= WS_URLS.length) return
      const base = WS_URLS[index]
      const stream = symbolToStream(symbol!)
      // Try both single-stream and combined formats
      const urls = [`${base}/${stream}`, `${base}?streams=${stream}`]
      const url = urls[0]
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        wsConnected = true
        clearTimeout(timeout)
        setState(prev => prev.data ? { ...prev, connected: true, source: 'ws' as const } : prev)
      }

      ws.onmessage = (e) => {
        try {
          const raw = JSON.parse(e.data)
          // Handle both raw and combined formats
          const d = raw.data || raw
          const last = parseFloat(d.c)
          const open = parseFloat(d.o)
          const change = last - open
          const changePct = open > 0 ? (change / open) * 100 : 0
          setState({
            data: {
              lastPrice: d.c,
              open24h: d.o,
              high24h: d.h,
              low24h: d.l,
              volume: d.v,
              quoteVolume: d.q || '0',
              priceChange: change.toFixed(8),
              priceChangePct: changePct.toFixed(2),
            },
            connected: true,
            source: 'ws',
          })
        } catch { /* ignore parse errors */ }
      }

      ws.onclose = () => {
        if (wsConnected) {
          setState(prev => prev.data ? { ...prev, connected: false } : prev)
        } else if (index + 1 < WS_URLS.length) {
          ws = null
          tryConnect(index + 1)
        }
      }

      ws.onerror = () => { ws?.close() }
    }

    // Fall back to REST if WS doesn't connect in time
    timeout = setTimeout(() => {
      if (!wsConnected) { ws?.close(); ws = null }
    }, WS_TIMEOUT)

    tryConnect(0)

    return () => {
      clearTimeout(timeout)
      ws?.close()
      wsRef.current = null
    }
  }, [symbol])

  return state
}
