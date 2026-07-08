'use client'
import React from 'react'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { BarChart2, FileText, Zap, BookOpen, AlertCircle } from 'lucide-react'

const modes: { name: string; desc: string; icon: React.ReactNode; border: string; nameColor: string }[] = [
  { name: 'Signal', desc: 'Bot memberi sinyal beli/jual — Anda yang eksekusi manual', icon: <BarChart2 size={14} className="inline mr-1" />, border: 'border-l-4 border-l-[#38c8ff]', nameColor: 'text-[#38c8ff]' },
  { name: 'Paper',  desc: 'Trading simulasi dengan uang virtual $1.000 — tanpa risiko',  icon: <FileText size={14} className="inline mr-1" />, border: 'border-l-4 border-l-[#9fe870]',  nameColor: 'text-[#163300] dark:text-[#9fe870]' },
  { name: 'Live',   desc: 'Trading sungguhan via API TokoCrypto — gunakan dengan hati-hati', icon: <Zap size={14} className="inline mr-1" />, border: 'border-l-4 border-l-[#ffd11a]',  nameColor: 'text-[#ffd11a]' },
]

const inputCls = 'w-full px-4 py-3 bg-[#f0f1ee] dark:bg-[#252822] rounded-[12px] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] focus:border-[#9fe870] focus:ring-2 focus:ring-[rgba(159,232,112,0.35)] outline-none text-[#0e0f0c] dark:text-[#e8ebe6] placeholder:text-[#a0a39e] dark:placeholder:text-[#5a5d58] transition'

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
      setError(err.message || 'Autentikasi gagal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fafafa] dark:bg-[#141411]">
      <div className="flex flex-col-reverse sm:flex-row gap-6 max-w-3xl w-full">

        {/* Info Panel */}
        <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-6 flex-1 space-y-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
          {/* Brand — matches Navbar style */}
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-[10px] bg-[#9fe870] flex items-center justify-center">
              <span className="text-[#163300] font-black text-base leading-none">N</span>
            </div>
            <span className="text-xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">NeuralTrade</span>
          </div>
          <p className="text-sm text-[#686868] dark:text-[#898989]">
            Bot trading otomatis untuk TokoCrypto. Mulai dari sinyal, uji coba kertas, hingga trading sungguhan.
          </p>
          <div className="space-y-2">
            <p className="text-xs text-[#5a5b58] dark:text-[#8a8d88] uppercase tracking-wider font-semibold">3 Mode Trading</p>
            {modes.map(m => (
              <div key={m.name} className={`bg-[#f0f1ee] dark:bg-[#252822] rounded-[12px] p-3 ${m.border}`}>
                <p className={`text-sm font-semibold ${m.nameColor}`}>{m.icon}{m.name}</p>
                <p className="text-xs text-[#686868] dark:text-[#898989] mt-0.5">{m.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#5a5b58] dark:text-[#8a8d88]">* 3 strategi: Grid, Trend Following, DCA</p>
          <a href="/glossary" className="block text-xs text-[#2d7a1a] dark:text-[#b3f08a] hover:text-[#054d28] dark:hover:text-[#cdffad] transition">
            <BookOpen size={13} className="inline mr-1" />Lihat Glosarium istilah trading →
          </a>
        </div>

        {/* Login / Register Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1e201c] p-8 rounded-[24px] w-full max-w-sm space-y-4 flex-shrink-0 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">

          {/* Form header */}
          <div className="text-center mb-2">
            <div className="inline-flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-[10px] bg-[#9fe870] flex items-center justify-center">
                <span className="text-[#163300] font-black text-base leading-none">N</span>
              </div>
              <span className="text-xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">NeuralTrade</span>
            </div>
            <h2 className="text-lg font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">
              {isRegister ? 'Buat Akun Baru' : 'Masuk ke Akun Anda'}
            </h2>
            <p className="text-xs text-[#686868] dark:text-[#898989] mt-0.5">
              {isRegister ? 'Isi data di bawah untuk mendaftar' : 'Selamat datang kembali!'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(255,107,111,0.08)] border border-[rgba(208,50,56,0.2)] dark:border-[rgba(255,107,111,0.2)] rounded-[10px] px-3 py-2" role="alert" aria-live="polite">
              <AlertCircle size={15} className="text-[#d03238] dark:text-[#ff6b6f] mt-0.5 shrink-0" />
              <p className="text-sm text-[#d03238] dark:text-[#ff6b6f]">{error}</p>
            </div>
          )}

          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] mb-1.5">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              className={inputCls}
              placeholder="contoh: trader123"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#0e0f0c] dark:text-[#e8ebe6] mb-1.5">
              Password
            </label>
            <input
              id="password"
              name="password"
              className={inputCls}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

          {/* Remember me */}
          <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
            <input
              id="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded-[4px] border-[rgba(14,15,12,0.3)] dark:border-[rgba(232,235,230,0.3)] bg-[#f0f1ee] dark:bg-[#252822] accent-[#9fe870]"
            />
            <span className="text-sm text-[#686868] dark:text-[#898989]">Ingat Saya</span>
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-[#9fe870] hover:bg-[#b8f080] rounded-full font-bold transition text-[#163300] shadow-[0_2px_12px_rgba(159,232,112,0.35)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Memproses...' : isRegister ? 'Daftar' : 'Masuk'}
          </button>

          {/* Toggle login/register */}
          <p className="text-center text-sm text-[#686868] dark:text-[#898989]">
            {isRegister ? 'Sudah punya akun? ' : 'Belum punya akun? '}
            <button
              type="button"
              className="font-semibold text-[#163300] dark:text-[#9fe870] hover:underline transition"
              onClick={() => { setIsRegister(!isRegister); setError('') }}
            >
              {isRegister ? 'Masuk' : 'Daftar'}
            </button>
          </p>
        </form>

      </div>
    </div>
  )
}
