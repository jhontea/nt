'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

const modes = [
  { name: 'Signal', desc: 'Bot memberi sinyal beli/jual — Anda yang eksekusi manual' },
  { name: 'Paper', desc: 'Trading simulasi dengan uang virtual $1000 — tanpa risiko' },
  { name: 'Live', desc: 'Trading sungguhan via API TokoCrypto — gunakan dengan hati-hati' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isRegister, setIsRegister] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const fn = isRegister ? api.auth.register : api.auth.login
      const res = await fn(username, password)
      login(res.token)
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    }
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
          <p className="text-xs text-gray-500">* 2 strategi: Grid Trading & Trend Following (SMA)</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl w-full max-w-sm space-y-4 flex-shrink-0">
          <h2 className="text-xl font-semibold text-center">{isRegister ? 'Register' : 'Login'}</h2>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <input
            className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
          <input
            className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition">
            {isRegister ? 'Register' : 'Login'}
          </button>
          <button type="button" className="w-full text-sm text-gray-400 hover:text-white transition" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Sudah punya akun? Login' : 'Belum punya akun? Register'}
          </button>
        </form>
      </div>
    </div>
  )
}
