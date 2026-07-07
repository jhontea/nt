'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'

const steps = [
  { num: 1, title: 'Buat Akun', desc: 'Register dengan username dan password. Data disimpan di database lokal.' },
  { num: 2, title: 'Buat Sesi Trading', desc: 'Pilih strategi (Grid/Trend/DCA), mode (Signal/Paper/Live), dan pasangan yang akan di-tradingkan.' },
  { num: 3, title: 'Start Bot', desc: 'Klik Start untuk memulai bot. Bot akan mengeksekusi strategi setiap 30 detik.' },
  { num: 4, title: 'Pantau Hasil', desc: 'Lihat P&L, order, dan sinyal real-time via WebSocket di halaman detail sesi.' },
]

const modes = [
  { name: 'Signal', icon: '📊', desc: 'Bot hanya menganalisis pasar dan mencatat sinyal beli/jual. Tidak ada order sungguhan. Cocok untuk belajar dan uji strategi.' },
  { name: 'Paper', icon: '📝', desc: 'Trading simulasi dengan uang virtual $1000. Bot mengeksekusi order palsu dan mencatat P&L virtual.' },
  { name: 'Live', icon: '⚡', desc: 'Trading sungguhan via API TokoCrypto. Eksekusi order real dengan uang sungguhan — gunakan dengan hati-hati.' },
]

const strategies = [
  { name: 'Grid', icon: '📐', desc: 'Pasang order beli dan jual di level harga yang sudah ditentukan. Bot akan beli di harga rendah dan jual di harga tinggi.' },
  { name: 'Trend', icon: '📈', desc: 'Deteksi tren pasar menggunakan SMA crossover. Golden cross (SMA cepat naik di atas SMA lambat) = beli, death cross = jual.' },
  { name: 'DCA', icon: '🪙', desc: 'Dollar Cost Averaging — beli aset secara berkala dalam jumlah tetap. Otomatis jual saat harga naik ke target profit.' },
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
    <div className="min-h-screen bg-[#fafafa] text-[#0e0f0c]">
      {/* Header */}
      <header className="border-b border-[rgba(14,15,12,0.08)] sticky top-0 bg-[#fafafa]/95 backdrop-blur-sm z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <span className="hidden sm:inline">Trading Bot</span>
          </h1>
          <nav className="flex gap-3 sm:gap-4 text-sm">
            <Link href="/login" className="px-3 py-1.5 bg-[#9fe870] hover:bg-[#8ad05e] rounded-lg transition text-[#163300] font-medium">
              Login
            </Link>
            <Link href="/glossary" className="px-3 py-1.5 text-[#686868] hover:text-[#0e0f0c] hover:bg-[#f0f1ee] rounded-lg transition">
              Glosarium
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
          Bot Trading Otomatis<br className="hidden sm:block" /> untuk TokoCrypto
        </h2>
        <p className="text-[#686868] max-w-2xl mx-auto mb-8 text-base sm:text-lg">
          Bot trading pribadi yang mendukung 3 mode (Signal, Paper, Live) dan 3 strategi (Grid, Trend Following, DCA).
          Pantau hasil trading secara real-time melalui dashboard web.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login" className="px-6 py-3 bg-[#9fe870] hover:bg-[#8ad05e] rounded-lg font-semibold transition text-base text-[#163300]">
            Mulai Sekarang
          </Link>
          <Link href="/glossary" className="px-6 py-3 bg-[#f0f1ee] hover:bg-[#e8ebe6] rounded-lg font-semibold transition text-base">
            Pelajari Istilah
          </Link>
        </div>
      </section>

      {/* Quick Start */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h3 className="text-2xl sm:text-3xl font-bold mb-8 sm:mb-10 text-center">Cara Menggunakan</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {steps.map(s => (
            <div key={s.num} className="bg-white rounded-xl p-5 relative border border-[rgba(14,15,12,0.08)] hover:border-[rgba(14,15,12,0.12)] transition">
              <span className="absolute -top-3 -left-3 w-8 h-8 bg-[#9fe870] rounded-full flex items-center justify-center text-sm font-bold text-[#163300] shadow-lg">{s.num}</span>
              <h4 className="font-semibold mb-2 mt-2">{s.title}</h4>
              <p className="text-sm text-[#686868] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modes */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h3 className="text-2xl sm:text-3xl font-bold mb-8 sm:mb-10 text-center">3 Mode Trading</h3>
        <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
          {modes.map(m => (
            <div key={m.name} className="bg-white rounded-xl p-5 sm:p-6 border border-[rgba(14,15,12,0.08)] hover:border-[rgba(14,15,12,0.12)] transition">
              <div className="text-3xl mb-3">{m.icon}</div>
              <h4 className="font-semibold mb-2 text-lg">{m.name}</h4>
              <p className="text-sm text-[#686868] leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#5a5b58] text-center mt-6">Mulai dari Signal untuk belajar, naik ke Paper untuk simulasi, lalu Live setelah siap.</p>
      </section>

      {/* Strategies */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h3 className="text-2xl sm:text-3xl font-bold mb-8 sm:mb-10 text-center">3 Strategi Trading</h3>
        <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
          {strategies.map(s => (
            <div key={s.name} className="bg-white rounded-xl p-5 sm:p-6 border border-[rgba(14,15,12,0.08)] hover:border-[rgba(14,15,12,0.12)] transition">
              <div className="text-3xl mb-3">{s.icon}</div>
              <h4 className="font-semibold mb-2 text-lg">{s.name}</h4>
              <p className="text-sm text-[#686868] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[rgba(14,15,12,0.08)] py-6 text-center text-xs text-[#5a5b58]">
        <p>Bot Trading Pribadi — Gunakan dengan bijak. Risiko trading sepenuhnya tanggung jawab pengguna.</p>
      </footer>
    </div>
  )
}
