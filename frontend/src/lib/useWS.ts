'use client'
import { useEffect, useRef, useCallback } from 'react'

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8100'

type WSMessageHandler = (data: any) => void

export function useSessionWS(sessionId: number | null, onMessage: WSMessageHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!sessionId) return

    const ws = new WebSocket(`${WS_BASE}/ws/sessions/${sessionId}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        onMessageRef.current(data)
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          wsRef.current = new WebSocket(`${WS_BASE}/ws/sessions/${sessionId}`)
        }
      }, 3000)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [sessionId])
}
