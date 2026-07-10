'use client'
import { useState, useCallback, useRef, ReactNode } from 'react'
import { ToastContext, Toast, ToastType } from '@/lib/useToast'

// --- Provider ---
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => {
      const next = [...prev, { id, message, type }]
      // ponytail: drop oldest if over 3
      return next.length > 3 ? next.slice(next.length - 3) : next
    })
    timers.current[id] = setTimeout(() => dismiss(id), 3000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

// --- Container ---
const BORDER: Record<string, string> = {
  success: 'border-l-4 border-[#9fe870]',
  error:   'border-l-4 border-[#d03238]',
  info:    'border-l-4 border-[rgba(14,15,12,0.3)] dark:border-[rgba(232,235,230,0.3)]',
}

function ToastContainer() {
  const [, rerender] = useState(0)
  // reads from context via hook — but we're inside the provider so we need context directly
  // Use a consumer pattern instead
  return (
    <ToastContext.Consumer>
      {ctx => {
        if (!ctx || ctx.toasts.length === 0) return null
        return (
          <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
            {ctx.toasts.map(t => (
              <div
                key={t.id}
                className={`pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-[10px] text-sm
                  bg-[#0e0f0c] dark:bg-[#e8ebe6]
                  text-[#e8ebe6] dark:text-[#0e0f0c]
                  shadow-lg transition-all duration-200
                  ${BORDER[t.type]}`}
              >
                <span className="flex-1">{t.message}</span>
                <button
                  onClick={() => ctx.dismiss(t.id)}
                  className="opacity-50 hover:opacity-100 transition-opacity text-xs leading-none mt-0.5"
                  aria-label="Tutup"
                >✕</button>
              </div>
            ))}
          </div>
        )
      }}
    </ToastContext.Consumer>
  )
}
