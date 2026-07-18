'use client'
import { useEffect, useId } from 'react'
import { X } from 'lucide-react'
import { CreateSessionForm } from './CreateSessionForm'

const ACCENT: Record<string, string> = {
  grid: 'border-t-[#9fe870]',
  trend: 'border-t-[#38c8ff]',
  dca: 'border-t-[#ffd11a]',
}

const TITLE: Record<string, string> = {
  grid: 'New Grid Session',
  trend: 'New Trend Session',
  dca: 'New DCA Session',
}

export function CreateSessionModal({ strategy, open, onClose, onCreated }: {
  strategy: 'grid' | 'trend' | 'dca'
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const titleId = useId()
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) {
      document.addEventListener('keydown', onKey)
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', onKey)
        document.body.style.overflow = previousOverflow
      }
    }
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-[rgba(14,15,12,0.45)] dark:bg-[rgba(0,0,0,0.6)] backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto bg-white dark:bg-[#1e201c] rounded-none sm:rounded-[24px] shadow-[0_24px_64px_rgba(14,15,12,0.25)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.5)] border-t-[3px] ${ACCENT[strategy]} flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white dark:bg-[#1e201c] border-b border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
          <h2 id={titleId} className="font-black text-lg text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">{TITLE[strategy]}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="w-9 h-9 flex items-center justify-center rounded-full text-[#686868] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.08)] dark:hover:bg-[rgba(208,50,56,0.15)] transition">
            <X size={16} />
          </button>
        </div>
        <CreateSessionForm strategy={strategy} onCreated={() => { onCreated(); onClose() }} />
      </div>
    </div>
  )
}
