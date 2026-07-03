'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

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
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Trading Bot</h1>
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
          {isRegister ? 'Already have an account? Login' : "Don't have an account? Register"}
        </button>
      </form>
    </div>
  )
}
