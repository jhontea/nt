'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

export function Navbar({ active }: { active?: 'sessions' | 'market' | 'glossary' }) {
  const router = useRouter()
  const { logout } = useAuth()
  const { theme, toggle } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-10 bg-[#fafafa] dark:bg-[#141411] border-b border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/sessions')} className="flex items-center gap-2 hover:opacity-80 transition">
            <span className="w-7 h-7 rounded-[10px] bg-[#9fe870] flex items-center justify-center text-sm font-black text-[#163300]">N</span>
            <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">NeuralTrade</span>
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="sm:hidden p-2 text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] rounded-lg transition" aria-label="Menu">
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => router.push('/sessions')}
              className={`px-3 py-1.5 text-sm rounded-full transition ${active === 'sessions' ? 'bg-[#f0f1ee] dark:bg-[#2a2c27] text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold border-b-2 border-[#9fe870]' : 'font-medium text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:bg-[#f0f1ee] dark:hover:bg-[#1e201c]'}`}
            >
              Sessions
            </button>
            <button
              onClick={() => router.push('/market')}
              className={`px-3 py-1.5 text-sm rounded-full transition ${active === 'market' ? 'bg-[#f0f1ee] dark:bg-[#2a2c27] text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold border-b-2 border-[#9fe870]' : 'font-medium text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:bg-[#f0f1ee] dark:hover:bg-[#1e201c]'}`}
            >
              Market
            </button>
            <button
              onClick={() => router.push('/glossary')}
              className={`px-3 py-1.5 text-sm rounded-full transition ${active === 'glossary' ? 'bg-[#f0f1ee] dark:bg-[#2a2c27] text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold border-b-2 border-[#9fe870]' : 'font-medium text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:bg-[#f0f1ee] dark:hover:bg-[#1e201c]'}`}
            >
              Glosarium
            </button>
            <div className="w-px h-5 bg-[rgba(14,15,12,0.12)] dark:bg-[rgba(232,235,230,0.12)] mx-1" />
          </div>
          <button
            onClick={toggle}
            className="px-2.5 py-1.5 min-h-[44px] text-sm text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:bg-[#f0f1ee] dark:hover:bg-[#1e201c] rounded-full transition"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 min-h-[44px] text-sm font-medium text-[#686868] dark:text-[#898989] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.06)] dark:hover:bg-[rgba(208,50,56,0.1)] rounded-full transition"
          >
            Logout
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="sm:hidden border-t border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] py-2 px-3">
          <button onClick={() => { router.push('/sessions'); setMobileOpen(false) }} className={`w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 transition ${active === 'sessions' ? 'bg-[#f0f1ee] dark:bg-[#2a2c27] text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold' : 'text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#1e201c]'}`}>Sessions</button>
          <button onClick={() => { router.push('/market'); setMobileOpen(false) }} className={`w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 transition ${active === 'market' ? 'bg-[#f0f1ee] dark:bg-[#2a2c27] text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold' : 'text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#1e201c]'}`}>Market</button>
          <button onClick={() => { router.push('/glossary'); setMobileOpen(false) }} className={`w-full text-left px-3 py-2.5 text-sm rounded-lg mb-1 transition ${active === 'glossary' ? 'bg-[#f0f1ee] dark:bg-[#2a2c27] text-[#0e0f0c] dark:text-[#e8ebe6] font-semibold' : 'text-[#686868] dark:text-[#898989] hover:bg-[#f0f1ee] dark:hover:bg-[#1e201c]'}`}>Glosarium</button>
        </div>
      )}
    </header>
  )
}
