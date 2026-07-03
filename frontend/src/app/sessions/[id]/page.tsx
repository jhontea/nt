'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useSessionWS } from '@/lib/useWS'
import { useEffect } from 'react'
import { HelpIcon } from '@/components/HelpIcon'

const modeInfo: Record<string, string> = {
  signal: 'Bot hanya mencatat sinyal. Tidak ada eksekusi order.',
  paper: 'Trading simulasi dengan uang virtual $1000.',
  live: 'Trading sungguhan via API TokoCrypto.',
}

const pnlHelp: Record<string, string> = {
  balance: 'Saldo saat ini. Untuk paper trading dimulai dari $1000.',
  realized: 'Keuntungan/kerugian dari posisi yang sudah ditutup (real).',
  winRate: 'Persentase trade yang profit dari total trade.',
}

export default function SessionDetailPage() {
  const { id } = useParams()
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()

  useEffect(() => { if (!isAuthenticated) router.push('/login') }, [isAuthenticated, router])

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.sessions.get(Number(id)),
    enabled: isAuthenticated,
  })

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ['pnl', id],
    queryFn: () => api.sessions.getPnL(Number(id)),
    enabled: isAuthenticated,
  })

  useSessionWS(Number(id), (data) => {
    if (data.type === 'signal') {
      qc.invalidateQueries({ queryKey: ['pnl', id] })
    }
  })

  async function handleStart() {
    await api.sessions.start(Number(id))
    qc.invalidateQueries({ queryKey: ['session', id] })
  }

  async function handleStop() {
    await api.sessions.stop(Number(id))
    qc.invalidateQueries({ queryKey: ['session', id] })
  }

  if (sessionLoading) return <div className="p-6 text-gray-400">Loading...</div>
  if (!session) return <div className="p-6 text-gray-400">Session not found</div>

  let configDisplay: any = {}
  try { configDisplay = JSON.parse(session.config) } catch {}

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => router.push('/sessions')} className="text-gray-400 hover:text-white mb-4 block">&larr; Back</button>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{session.name}</h1>
        <div className="space-x-2">
          {session.status === 'running' ? (
            <button onClick={handleStop} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition">Stop</button>
          ) : (
            <button onClick={handleStart} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition">Start</button>
          )}
        </div>
      </div>

      {/* Session Info */}
      <div className="bg-gray-900 p-4 rounded-xl mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-400">Pair</span><p className="font-medium">{session.symbol}</p></div>
          <div>
            <span className="text-gray-400">Strategi <HelpIcon text={session.strategy === 'grid' ? 'Grid Trading: pasang order di level harga tetap' : 'Trend Following: deteksi tren pakai SMA'} /></span>
            <p className="font-medium">{session.strategy === 'grid' ? 'Grid Trading' : 'Trend Following'}</p>
          </div>
          <div>
            <span className="text-gray-400">Mode <HelpIcon text={modeInfo[session.mode] || ''} /></span>
            <p className={`font-medium ${session.mode === 'live' ? 'text-yellow-400' : ''}`}>
              {session.mode === 'signal' ? 'Signal' : session.mode === 'paper' ? 'Paper' : 'Live'}
            </p>
          </div>
          <div><span className="text-gray-400">Status</span><p className={`font-medium ${session.status === 'running' ? 'text-green-400' : ''}`}>{session.status}</p></div>
        </div>
        <details className="mt-3 text-sm">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-300">Lihat konfigurasi</summary>
          <pre className="mt-2 bg-gray-800 p-2 rounded text-xs">{JSON.stringify(configDisplay, null, 2)}</pre>
        </details>
      </div>

      {/* Strategy Description */}
      <div className="bg-gray-800/50 rounded-xl p-4 mb-6 text-sm text-gray-300">
        {session.strategy === 'grid' ? (
          <p>
            <span className="text-blue-400 font-medium">Grid Trading</span>: Bot akan memasang order beli dan jual di {configDisplay.grid_count || '?'} level harga antara {configDisplay.lower_price || '?'} dan {configDisplay.upper_price || '?'}.
            Setiap order {configDisplay.quantity || '?'} {session.symbol.split('_')[0]}. Bot mengevaluasi setiap 30 detik.
          </p>
        ) : (
          <p>
            <span className="text-purple-400 font-medium">Trend Following (SMA)</span>: Bot menghitung SMA {configDisplay.fast_period || '?'} (cepat) dan SMA {configDisplay.slow_period || '?'} (lambat).
            Golden cross (SMA cepat &gt; SMA lambat) = sinyal <span className="text-green-400">beli</span>. Death cross (SMA cepat &lt; SMA lambat) = sinyal <span className="text-red-400">jual</span>.
          </p>
        )}
      </div>

      {/* P&L Cards */}
      {pnl ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">Ringkasan Performa</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-gray-900 p-4 rounded-xl">
              <p className="text-xs text-gray-400 uppercase flex items-center">Balance <HelpIcon text={pnlHelp.balance} /></p>
              <p className="text-xl font-bold">${pnl.balance?.toFixed(2) || '0.00'}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl">
              <p className="text-xs text-gray-400 uppercase flex items-center">Realized P&L <HelpIcon text={pnlHelp.realized} /></p>
              <p className={`text-xl font-bold ${parseFloat(pnl.realized_pnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {parseFloat(pnl.realized_pnl) >= 0 ? '+' : ''}${pnl.realized_pnl}
              </p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl">
              <p className="text-xs text-gray-400 uppercase">Total P&L</p>
              <p className={`text-xl font-bold ${parseFloat(pnl.total_pnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {parseFloat(pnl.total_pnl) >= 0 ? '+' : ''}${pnl.total_pnl}
              </p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl">
              <p className="text-xs text-gray-400 uppercase flex items-center">Win Rate <HelpIcon text={pnlHelp.winRate} /></p>
              <p className="text-xl font-bold">{pnl.win_rate?.toFixed(1) || '0'}%</p>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl">
              <p className="text-xs text-gray-400 uppercase">Trades</p>
              <p className="text-xl font-bold">{pnl.trade_count || 0}</p>
            </div>
          </div>
        </div>
      ) : pnlLoading ? (
        <p className="text-gray-400 mb-6">Loading P&L...</p>
      ) : null}

      {/* Info untuk pengguna baru */}
      <div className="bg-gray-800/30 rounded-xl p-4 text-xs text-gray-500 space-y-1 mt-4">
        <p>💡 <strong>Tips untuk pemula:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>Mulai dari <strong>Signal Mode</strong> — lihat sinyal tanpa risiko</li>
          <li>Lanjut ke <strong>Paper Trading</strong> — uji strategi dengan uang virtual $1000</li>
          <li>Baru ke <strong>Live Trading</strong> — setelah strategi terbukti profit</li>
          <li>Session berjalan otomatis setiap 30 detik — start sekali, bot bekerja sendiri</li>
        </ul>
      </div>
    </div>
  )
}
