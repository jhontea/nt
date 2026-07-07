'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

export function Navbar({ active }: { active?: 'sessions' | 'market' | 'glossary' }) {
  const router = useRouter()
  const { logout } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-[rgba(14,15,12,0.08)]">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <button onClick={() => router.push('/sessions')} className="flex items-center gap-2 hover:opacity-80 transition">
          <span className="w-7 h-7 rounded-[10px] bg-[#9fe870] flex items-center justify-center text-sm font-black text-[#163300]">N</span>
          <span className="font-bold text-[#0e0f0c] tracking-tight">NeuralTrade</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push('/sessions')}
            className={`px-3 py-1.5 text-sm rounded-full transition ${active === 'sessions' ? 'bg-[#f0f1ee] text-[#0e0f0c] font-semibold border-b-2 border-[#9fe870]' : 'font-medium text-[#686868] hover:text-[#0e0f0c] hover:bg-[#f0f1ee]'}`}
          >
            Sessions
          </button>
          <button
            onClick={() => router.push('/market')}
            className={`px-3 py-1.5 text-sm rounded-full transition ${active === 'market' ? 'bg-[#f0f1ee] text-[#0e0f0c] font-semibold border-b-2 border-[#9fe870]' : 'font-medium text-[#686868] hover:text-[#0e0f0c] hover:bg-[#f0f1ee]'}`}
          >
            Market
          </button>
          <button
            onClick={() => router.push('/glossary')}
            className={`px-3 py-1.5 text-sm rounded-full transition ${active === 'glossary' ? 'bg-[#f0f1ee] text-[#0e0f0c] font-semibold border-b-2 border-[#9fe870]' : 'font-medium text-[#686868] hover:text-[#0e0f0c] hover:bg-[#f0f1ee]'}`}
          >
            Glosarium
          </button>
          <div className="w-px h-5 bg-[rgba(14,15,12,0.12)] mx-1" />
          <button
            onClick={toggle}
            className="px-2.5 py-1.5 text-sm text-[#686868] hover:text-[#0e0f0c] hover:bg-[#f0f1ee] rounded-full transition"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 text-sm font-medium text-[#686868] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.06)] rounded-full transition"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
