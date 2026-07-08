'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

const modes = [
  { name: 'Signal', desc: 'Bot memberi sinyal beli/jual — Anda yang eksekusi manual', icon: '📊', border: 'border-l-4 border-l-[rgba(56,200,255,0.8)]' },
  { name: 'Paper', desc: 'Trading simulasi dengan uang virtual $1000 — tanpa risiko', icon: '📝', border: 'border-l-4 border-l-[rgba(159,232,112,0.8)]' },
  { name: 'Live', desc: 'Trading sungguhan via API TokoCrypto — gunakan dengan hati-hati', icon: '⚡', border: 'border-l-4 border-l-[rgba(255,209,26,0.8)]' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const fn = isRegister ? api.auth.register : api.auth.login
      const res = await fn(username, password)
      login(res.token, rememberMe)
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fafafa] dark:bg-[#141411]">
      <div className="flex flex-col-reverse sm:flex-row gap-8 max-w-3xl w-full">
        {/* Info Panel */}
         <div className="bg-white dark:bg-[#1e201c] rounded-[16px] p-6 flex-1 space-y-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
           <div className="flex items-center gap-3 mb-2">
             <div className="w-10 h-10 rounded-[12px] bg-[rgba(159,232,112,0.15)] flex items-center justify-center text-xl">🤖</div>
             <h1 className="text-2xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Trading Bot</h1>
           </div>
          <p className="text-sm text-[#686868] dark:text-[#898989]">
            Bot trading otomatis untuk TokoCrypto. Mulai dari sinyal, uji coba kertas, hingga trading sungguhan.
          </p>
          <div className="space-y-2">
            <p className="text-xs text-[#5a5b58] dark:text-[#8a8d88] uppercase tracking-wider font-semibold">3 Mode Trading</p>
            {modes.map(m => (
              <div key={m.name} className={`bg-[#f0f1ee] dark:bg-[#252822] rounded-[12px] p-3 ${m.border}`}>
                <p className="text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6]">{m.icon} {m.name}</p>
                <p className="text-xs text-[#686868] dark:text-[#898989]">{m.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#5a5b58] dark:text-[#8a8d88]">* 3 strategi: Grid, Trend Following, DCA</p>
          <a href="/glossary" className="block text-xs text-[#2d7a1a] dark:text-[#b3f08a] hover:text-[#054d28] dark:hover:text-[#cdffad] mt-2">📖 Lihat Glosarium istilah trading &rarr;</a>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1e201c] p-8 rounded-[16px] w-full max-w-sm space-y-4 flex-shrink-0 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
          <h2 className="text-2xl font-black tracking-tight text-center text-[#0e0f0c] dark:text-[#e8ebe6]">{isRegister ? 'Register' : 'Login'}</h2>
          {error && <p className="text-[#d03238] dark:text-[#ff6b6f] text-sm" role="alert" aria-live="polite">{error}</p>}

          <div>
            <label htmlFor="username" className="block text-sm text-[#686868] dark:text-[#898989] mb-1">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              className="w-full px-4 py-3 bg-[#f0f1ee] dark:bg-[#252822] rounded-lg border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] focus:border-[#9fe870] focus:ring-2 focus:ring-[rgba(159,232,112,0.4)] outline-none text-[#0e0f0c] dark:text-[#e8ebe6]"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-[#686868] dark:text-[#898989] mb-1">Password</label>
            <input
              id="password"
              name="password"
              className="w-full px-4 py-3 bg-[#f0f1ee] dark:bg-[#252822] rounded-lg border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] focus:border-[#9fe870] focus:ring-2 focus:ring-[rgba(159,232,112,0.4)] outline-none text-[#0e0f0c] dark:text-[#e8ebe6]"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

          {/* Ingat Saya checkbox */}
          <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
            <input
              id="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded-[4px] border-[rgba(14,15,12,0.3)] dark:border-[rgba(232,235,230,0.3)] bg-[#f0f1ee] dark:bg-[#252822] text-[#9fe870] focus:ring-[#9fe870] focus:ring-offset-white dark:focus:ring-offset-[#252822]"
            />
            <span className="text-sm text-[#686868] dark:text-[#898989]">Ingat Saya</span>
          </label>

          <button type="submit" disabled={submitting} className="w-full py-3 bg-[#9fe870] hover:bg-[#cdffad] dark:hover:bg-[#b8f080] rounded-full font-semibold transition text-[#163300] shadow-[0_2px_8px_rgba(159,232,112,0.4)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Loading...' : isRegister ? 'Register' : 'Login'}
          </button>
          <button type="button" className="w-full py-2 text-sm text-[#686868] dark:text-[#898989] hover:text-[#9fe870] dark:hover:text-[#9fe870] transition font-medium" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Sudah punya akun? Login' : 'Belum punya akun? Register'}
          </button>
        </form>
      </div>
    </div>
  )
}
