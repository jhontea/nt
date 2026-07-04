'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

const modes = [
  { name: 'Signal', desc: 'Bot memberi sinyal beli/jual — Anda yang eksekusi manual' },
  { name: 'Paper', desc: 'Trading simulasi dengan uang virtual $1000 — tanpa risiko' },
  { name: 'Live', desc: 'Trading sungguhan via API TokoCrypto — gunakan dengan hati-hati' },
]

const HISTORY_KEY = 'username_history'
const MAX_HISTORY = 5

function getHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function addHistory(username: string) {
  const list = getHistory().filter(u => u !== username)
  list.unshift(username)
  if (list.length > MAX_HISTORY) list.length = MAX_HISTORY
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
}

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [showClear, setShowClear] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setHistory(getHistory()) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const fn = isRegister ? api.auth.register : api.auth.login
      const res = await fn(username, password)
      addHistory(username)
      login(res.token)
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    }
  }

  function handleSelect(u: string) {
    setUsername(u)
    setShowClear(false)
    // Focus password after selecting username
    setTimeout(() => {
      const pwd = document.querySelector<HTMLInputElement>('#login-password')
      pwd?.focus()
    }, 0)
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY)
    setHistory([])
    setShowClear(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
      <div className="flex flex-col lg:flex-row gap-8 max-w-3xl w-full">
        {/* Info Panel */}
        <div className="bg-gray-900 rounded-xl p-6 flex-1 space-y-4">
          <h1 className="text-2xl font-bold">Trading Bot</h1>
          <p className="text-sm text-gray-400">
            Bot trading otomatis untuk TokoCrypto. Mulai dari sinyal, uji coba kertas, hingga trading sungguhan.
          </p>
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">3 Mode Trading</p>
            {modes.map(m => (
              <div key={m.name} className="bg-gray-800 rounded-lg p-3">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-gray-400">{m.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">* 2 strategi: Grid Trading &amp; Trend Following (SMA)</p>
          <a href="/glossary" className="block text-xs text-blue-400 hover:text-blue-300 mt-2">📖 Lihat Glosarium istilah trading &rarr;</a>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl w-full max-w-sm space-y-4 flex-shrink-0">
          <h2 className="text-xl font-semibold text-center">{isRegister ? 'Register' : 'Login'}</h2>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Username with autocomplete */}
          <div className="relative">
            <input
              ref={usernameRef}
              className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onFocus={() => { if (history.length > 0) setShowClear(true) }}
              onBlur={() => setTimeout(() => setShowClear(false), 200)}
              required
              list="username-list"
              autoComplete="username"
            />
            <datalist id="username-list">
              {history.map(u => <option key={u} value={u} />)}
            </datalist>
            {showClear && history.length > 0 && (
              <button type="button" onClick={clearHistory}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-red-400 transition">
                Hapus riwayat
              </button>
            )}
          </div>

          <input
            id="login-password"
            className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition">
            {isRegister ? 'Register' : 'Login'}
          </button>
          <button type="button" className="w-full text-sm text-gray-400 hover:text-white transition" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Sudah punya akun? Login' : 'Belum punya akun? Register'}
          </button>

          {/* Saved accounts hint */}
          {history.length > 0 && (
            <div className="pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">Akun tersimpan:</p>
              <div className="flex flex-wrap gap-1">
                {history.map(u => (
                  <button key={u} type="button" onClick={() => handleSelect(u)}
                    className="text-xs px-2 py-1 bg-gray-800 rounded hover:bg-gray-700 text-gray-300 transition">
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
