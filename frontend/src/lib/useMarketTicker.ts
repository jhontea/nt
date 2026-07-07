'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = 'wss://stream-cloud.tokocrypto.site/stream/ws'
const MAX_RETRIES = 10

interface MiniTickerData {
  lastPrice: string
  open24h: string
  high24h: string
  low24h: string
  volume: string
  quoteVolume: string
  priceChange: string
  priceChangePct: string
}

interface MiniTickerState {
  data: MiniTickerData | null
  connected: boolean
}

function symbolToStream(symbol: string): string {
  return symbol.toLowerCase().replace('_', '') + '@miniTicker'
}

export function useMarketTicker(symbol: string | null): MiniTickerState {
  const [state, setState] = useState<MiniTickerState>({ data: null, connected: false })
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const connect = useCallback(() => {
    if (!symbol) return

    const stream = symbolToStream(symbol)
    const ws = new WebSocket(`${WS_URL}/${stream}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      retriesRef.current = 0
      setState(prev => ({ ...prev, connected: true }))
    }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      try {
        const raw = JSON.parse(e.data)
        // miniTicker: { e, E, s, c, o, h, l, v, q }
        const last = parseFloat(raw.c)
        const open = parseFloat(raw.o)
        const change = last - open
        const changePct = open > 0 ? (change / open) * 100 : 0

        setState({
          data: {
            lastPrice: raw.c,
            open24h: raw.o,
            high24h: raw.h,
            low24h: raw.l,
            volume: raw.v,
            quoteVolume: raw.q,
            priceChange: change.toFixed(8),
            priceChangePct: changePct.toFixed(2),
          },
          connected: true,
        })
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setState(prev => ({ ...prev, connected: false }))
      if (retriesRef.current < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000)
        retriesRef.current++
        timerRef.current = setTimeout(connect, delay)
      }
    }

    ws.onerror = () => { ws.close() }
  }, [symbol])

  useEffect(() => {
    if (!symbol) return
    connect()
    return () => {
      clearTimeout(timerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [symbol, connect])

  return state
}
