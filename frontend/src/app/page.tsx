'use client'
import React from 'react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { Bot, BarChart2, FileText, Zap, Grid2x2, TrendingUp, Coins } from 'lucide-react'

const steps = [
  { num: 1, title: 'Buat Akun', desc: 'Register dengan username dan password. Data disimpan di database lokal.' },
  { num: 2, title: 'Buat Sesi Trading', desc: 'Pilih strategi (Grid/Trend/DCA), mode (Signal/Paper/Live), dan pasangan yang akan di-tradingkan.' },
  { num: 3, title: 'Start Bot', desc: 'Klik Start untuk memulai bot. Bot akan mengeksekusi strategi setiap 30 detik.' },
  { num: 4, title: 'Pantau Hasil', desc: 'Lihat P&L, order, dan sinyal real-time via WebSocket di halaman detail sesi.' },
]

const modes: { name: string; icon: React.ReactNode; desc: string; badge?: string }[] = [
  { name: 'Signal', icon: <BarChart2 size={22} />, desc: 'Bot hanya menganalisis pasar dan mencatat sinyal beli/jual. Tidak ada order sungguhan. Cocok untuk belajar dan uji strategi.', badge: 'Mulai di sini' },
  { name: 'Paper', icon: <FileText size={22} />, desc: 'Trading simulasi dengan uang virtual $1000. Bot mengeksekusi order palsu dan mencatat P&L virtual.' },
  { name: 'Live', icon: <Zap size={22} />, desc: 'Trading sungguhan via API TokoCrypto. Eksekusi order real dengan uang sungguhan — gunakan dengan hati-hati.', badge: 'Hati-hati' },
]

// Per-strategy accent: Grid=green, Trend=blue, DCA=yellow
const strategies: { name: string; icon: React.ReactNode; desc: string; iconBg: string; iconColor: string }[] = [
  {
    name: 'Grid',
    icon: <Grid2x2 size={22} />,
    desc: 'Pasang order beli dan jual di level harga yang sudah ditentukan. Bot akan beli di harga rendah dan jual di harga tinggi.',
    iconBg: 'bg-[#9fe870]/15 dark:bg-[#9fe870]/10',
    iconColor: 'text-[#163300] dark:text-[#9fe870]',
  },
  {
    name: 'Trend',
    icon: <TrendingUp size={22} />,
    desc: 'Deteksi tren pasar menggunakan SMA crossover. Golden cross (SMA cepat naik di atas SMA lambat) = beli, death cross = jual.',
    iconBg: 'bg-[#38c8ff]/15 dark:bg-[#38c8ff]/10',
    iconColor: 'text-[#0994b3] dark:text-[#5dd8f5]',
  },
  {
    name: 'DCA',
    icon: <Coins size={22} />,
    desc: 'Dollar Cost Averaging — beli aset secara berkala dalam jumlah tetap. Otomatis jual saat harga naik ke target profit.',
    iconBg: 'bg-[#ffd11a]/15 dark:bg-[#ffd11a]/10',
    iconColor: 'text-[#7a5f00] dark:text-[#f5c842]',
  },
]

export default function Home() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (mounted && initialized && isAuthenticated) router.push('/sessions')
  }, [mounted, initialized, isAuthenticated, router])

  if (!mounted || !initialized || isAuthenticated) return null

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411] text-[#0e0f0c] dark:text-[#e8ebe6]">
      {/* Header */}
      <header className="border-b border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] sticky top-0 bg-[#fafafa]/95 dark:bg-[#141411]/95 backdrop-blur-sm z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2 text-[#0e0f0c] dark:text-[#e8ebe6]">
            <Bot size={22} className="text-[#9fe870]" />
            NeuralTrade
          </h1>
          <nav className="flex gap-3 sm:gap-4 text-sm">
            <Link href="/login" className="px-3 py-1.5 bg-[#9fe870] hover:bg-[#cdffad] rounded-full transition text-[#163300] font-medium">
              Login
            </Link>
            <Link href="/glossary" className="px-3 py-1.5 text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:bg-[#f0f1ee] dark:hover:bg-[#1e201c] rounded-full transition">
              Glosarium
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#9fe870]/15 dark:bg-[#9fe870]/10 text-[#163300] dark:text-[#9fe870] text-xs font-medium mb-6">
          <Bot size={13} />
          Bot trading pribadi untuk TokoCrypto
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-5 leading-tight tracking-tight">
          Otomasi trading kripto<br className="hidden sm:block" /> dengan strategi yang bisa diatur
        </h2>
        <p className="text-[#686868] dark:text-[#898989] max-w-xl mx-auto mb-10 text-base sm:text-lg leading-relaxed">
          Grid, Trend Following, atau DCA — jalankan di mode Signal, Paper, atau Live.
          Pantau hasil real-time lewat dashboard web.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login" className="px-7 py-3 bg-[#9fe870] hover:bg-[#cdffad] rounded-full font-semibold transition text-base text-[#163300] shadow-sm">
            Mulai Sekarang
          </Link>
          <Link href="/glossary" className="px-7 py-3 bg-[#f0f1ee] dark:bg-[#1e201c] hover:bg-[#e8e9e6] dark:hover:bg-[#2a2c27] rounded-full font-semibold transition text-base text-[#0e0f0c] dark:text-[#e8ebe6]">
            Pelajari Istilah
          </Link>
        </div>
      </section>

      {/* Quick Start */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h3 className="text-xl sm:text-2xl font-bold mb-2 text-center text-[#0e0f0c] dark:text-[#e8ebe6]">Cara Mulai</h3>
        <p className="text-sm text-[#686868] dark:text-[#898989] text-center mb-8 sm:mb-10">Empat langkah dari daftar hingga bot berjalan</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {steps.map(s => (
            <div key={s.num} className="bg-white dark:bg-[#1e201c] rounded-[20px] p-5 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] transition">
              <div className="w-8 h-8 rounded-full bg-[#9fe870]/15 dark:bg-[#9fe870]/10 flex items-center justify-center text-sm font-bold text-[#163300] dark:text-[#9fe870] mb-4">
                {s.num}
              </div>
              <h4 className="font-semibold mb-1.5 text-[#0e0f0c] dark:text-[#e8ebe6]">{s.title}</h4>
              <p className="text-sm text-[#686868] dark:text-[#898989] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modes */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h3 className="text-xl sm:text-2xl font-bold mb-2 text-center text-[#0e0f0c] dark:text-[#e8ebe6]">3 Mode Trading</h3>
        <p className="text-sm text-[#686868] dark:text-[#898989] text-center mb-8 sm:mb-10">Mulai dari Signal untuk belajar, naik ke Paper untuk simulasi, lalu Live setelah siap</p>
        <div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
          {modes.map(m => (
            <div key={m.name} className="bg-white dark:bg-[#1e201c] rounded-[20px] p-5 sm:p-6 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] transition">
              <div className="flex items-start justify-between mb-4">
                <div className="w-9 h-9 rounded-[10px] bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] flex items-center justify-center text-[#0e0f0c] dark:text-[#e8ebe6]">
                  {m.icon}
                </div>
                {m.badge && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989]">
                    {m.badge}
                  </span>
                )}
              </div>
              <h4 className="font-semibold mb-2 text-base text-[#0e0f0c] dark:text-[#e8ebe6]">{m.name}</h4>
              <p className="text-sm text-[#686868] dark:text-[#898989] leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Strategies */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h3 className="text-xl sm:text-2xl font-bold mb-2 text-center text-[#0e0f0c] dark:text-[#e8ebe6]">3 Strategi Trading</h3>
        <p className="text-sm text-[#686868] dark:text-[#898989] text-center mb-8 sm:mb-10">Pilih sesuai gaya trading kamu</p>
        <div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
          {strategies.map(s => (
            <div key={s.name} className="bg-white dark:bg-[#1e201c] rounded-[20px] p-5 sm:p-6 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] transition">
              <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center mb-4 ${s.iconBg} ${s.iconColor}`}>
                {s.icon}
              </div>
              <h4 className="font-semibold mb-2 text-base text-[#0e0f0c] dark:text-[#e8ebe6]">{s.name}</h4>
              <p className="text-sm text-[#686868] dark:text-[#898989] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] py-6 text-center text-xs text-[#5a5b58] dark:text-[#8a8d88]">
        <p>Bot Trading Pribadi — Gunakan dengan bijak. Risiko trading sepenuhnya tanggung jawab pengguna.</p>
      </footer>
    </div>
  )
}
