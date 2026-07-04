'use client'
import { useEffect, useRef } from 'react'

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8100'
const MAX_RETRIES = 5

type WSMessageHandler = (data: any) => void

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export function useSessionWS(sessionId: number | null, onMessage: WSMessageHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const retriesRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!sessionId) return
    retriesRef.current = 0

    function connect() {
      const token = getToken()
      if (!token) return

      const ws = new WebSocket(`${WS_BASE}/ws/sessions/${sessionId}?token=${token}`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          onMessageRef.current(data)
        } catch { /* ignore parse errors */ }
      }

      ws.onclose = () => {
        if (retriesRef.current < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 15000)
          retriesRef.current++
          timerRef.current = setTimeout(connect, delay)
        }
      }

      ws.onopen = () => { retriesRef.current = 0 }
    }

    connect()

    return () => {
      clearTimeout(timerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [sessionId])
}
