'use client'
import { useEffect, useRef } from 'react'
import { getToken } from './api'

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== 'undefined' ? `ws://${window.location.hostname}:8100` : 'ws://localhost:8100')
const MAX_RETRIES = 5

type WSMessageHandler = (data: any) => void

export function useSessionWS(sessionId: number | null, onMessage: WSMessageHandler) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!sessionId) return
    let retries = 0
    let activeWs: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let dead = false

    function connect() {
      const token = getToken()
      if (!token || dead) return

      const ws = new WebSocket(`${WS_BASE}/ws/sessions/${sessionId}`)
      activeWs = ws

      ws.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data)) } catch { /* ignore */ }
      }
      ws.onopen = () => {
        retries = 0
        ws.send(JSON.stringify({ token }))
      }
      ws.onclose = () => {
        if (dead || ws !== activeWs) return
        if (retries < MAX_RETRIES) {
          timer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 15000))
        }
      }
    }

    // ponytail: 50ms debounce prevents Strict Mode double-connect in dev
    const init = setTimeout(connect, 50)

    return () => {
      dead = true
      clearTimeout(init)
      clearTimeout(timer)
      activeWs?.close()
      activeWs = null
    }
  }, [sessionId])
}
