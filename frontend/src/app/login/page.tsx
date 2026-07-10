'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { BarChart2, FileText, Zap, BookOpen } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || '/api/backend'

const modes = [
  { name: 'Signal', desc: 'Bot memberi sinyal beli/jual — Anda yang eksekusi manual', icon: <BarChart2 size={14} className="inline mr-1" />, border: 'border-l-4 border-l-[#38c8ff]', nameColor: 'text-[#38c8ff]' },
  { name: 'Paper',  desc: 'Trading simulasi dengan uang virtual $1.000 — tanpa risiko',  icon: <FileText size={14} className="inline mr-1" />, border: 'border-l-4 border-l-[#9fe870]',  nameColor: 'text-[#163300] dark:text-[#9fe870]' },
  { name: 'Live',   desc: 'Trading sungguhan via API TokoCrypto — gunakan dengan hati-hati', icon: <Zap size={14} className="inline mr-1" />, border: 'border-l-4 border-l-[#ffd11a]',  nameColor: 'text-[#ffd11a]' },
]

const errorMsg: Record<string, string> = {
  no_code: 'Login dibatalkan.',
  exchange_failed: 'Gagal autentikasi dengan Google.',
  userinfo_failed: 'Gagal mengambil info akun Google.',
  not_allowed: 'Email Anda tidak diizinkan mengakses aplikasi ini.',
}

function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="bg-white dark:bg-[#1e201c] p-8 rounded-[24px] w-full max-w-sm space-y-6 flex-shrink-0 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-[10px] bg-[#9fe870] flex items-center justify-center">
            <span className="text-[#163300] font-black text-base leading-none">N</span>
          </div>
          <span className="text-xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">NeuralTrade</span>
        </div>
        <h2 className="text-lg font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">Masuk ke Akun Anda</h2>
        <p className="text-xs text-[#686868] dark:text-[#898989] mt-0.5">Gunakan akun Google untuk melanjutkan</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[rgba(208,50,56,0.08)] dark:bg-[rgba(255,107,111,0.08)] border border-[rgba(208,50,56,0.2)] dark:border-[rgba(255,107,111,0.2)] rounded-[10px] px-3 py-2" role="alert">
          <p className="text-sm text-[#d03238] dark:text-[#ff6b6f]">{errorMsg[error] ?? 'Login gagal, coba lagi.'}</p>
        </div>
      )}

      <a
        href={`${API}/v1/auth/google`}
        className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white dark:bg-[#252822] border border-[rgba(14,15,12,0.15)] dark:border-[rgba(232,235,230,0.15)] rounded-full font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] hover:bg-[#f5f5f5] dark:hover:bg-[#2e3128] transition shadow-sm hover:scale-[1.01] active:scale-[0.99]"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          <path fill="none" d="M0 0h48v48H0z"/>
        </svg>
        Masuk dengan Google
      </a>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fafafa] dark:bg-[#141411]">
      <div className="flex flex-col-reverse sm:flex-row gap-6 max-w-3xl w-full">

        {/* Info Panel */}
        <div className="bg-white dark:bg-[#1e201c] rounded-[24px] p-6 flex-1 space-y-4 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)]">
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

        {/* Login Panel */}
        <Suspense fallback={
          <div className="bg-white dark:bg-[#1e201c] p-8 rounded-[24px] w-full max-w-sm flex-shrink-0 border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] flex items-center justify-center">
            <p className="text-sm text-[#686868] dark:text-[#898989]">Memuat...</p>
          </div>
        }>
          <LoginForm />
        </Suspense>

      </div>
    </div>
  )
}
