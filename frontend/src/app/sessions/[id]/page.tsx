'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useSessionWS } from '@/lib/useWS'
import { useEffect, useState } from 'react'
import { HelpIcon } from '@/components/HelpIcon'
import { PriceBadge } from '@/components/PriceBadge'
import { Navbar } from '@/components/Navbar'

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
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')

  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  // Auto-refresh on page focus
  useEffect(() => {
    const onFocus = () => {
      qc.invalidateQueries({ queryKey: ['session', id] })
      qc.invalidateQueries({ queryKey: ['pnl', id] })
      qc.invalidateQueries({ queryKey: ['orders', id] })
      qc.invalidateQueries({ queryKey: ['signals', id] })
      qc.invalidateQueries({ queryKey: ['signalSummary', id] })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [id, qc])

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

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.sessions.getOrders(Number(id)),
    enabled: isAuthenticated,
    refetchInterval: 10000,
  })

  // Grid Signal specific queries
  const isGridSignal = session?.strategy === 'grid' && session?.mode === 'signal'

  const { data: strategySignals } = useQuery({
    queryKey: ['signals', id],
    queryFn: () => api.sessions.getSignals(Number(id)),
    enabled: isAuthenticated && isGridSignal,
    refetchInterval: 15000,
  })

  const { data: signalSummary } = useQuery({
    queryKey: ['signalSummary', id],
    queryFn: () => api.sessions.getSignalSummary(Number(id)),
    enabled: isAuthenticated && isGridSignal,
    refetchInterval: 15000,
  })

  useSessionWS(Number(id), (data) => {
    if (data.type === 'signal') {
      qc.invalidateQueries({ queryKey: ['pnl', id] })
      qc.invalidateQueries({ queryKey: ['orders', id] })
      qc.invalidateQueries({ queryKey: ['signals', id] })
      qc.invalidateQueries({ queryKey: ['signalSummary', id] })
    }
  })

  async function handleStart() {
    setError('')
    setLoading('start')
    try {
      await api.sessions.start(Number(id))
      qc.invalidateQueries({ queryKey: ['session', id] })
    } catch (e: any) {
      setError(e.message || 'Failed to start')
    }
    setLoading('')
  }

  async function handleStop() {
    setError('')
    setLoading('stop')
    try {
      await api.sessions.stop(Number(id))
      qc.invalidateQueries({ queryKey: ['session', id] })
    } catch (e: any) {
      setError(e.message || 'Failed to stop')
    }
    setLoading('')
  }

  if (sessionLoading) return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-[#686868] animate-pulse">
          <span className="w-2 h-2 rounded-full bg-[#9fe870]" />
          <span className="text-sm">Memuat session...</span>
        </div>
      </div>
    </div>
  )
  if (!session) return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-sm text-[#686868]">Session not found</p>
      </div>
    </div>
  )

  let configDisplay: any = {}
  try { configDisplay = JSON.parse(session.config) } catch {}

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Back navigation */}
        <button
          onClick={() => router.push('/sessions')}
          className="flex items-center gap-1.5 text-sm text-[#686868] hover:text-[#0e0f0c] mb-6 transition-colors w-fit"
        >
          &larr; Kembali ke Sessions
        </button>

        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-black tracking-tight text-[#0e0f0c]">{session.name}</h1>
              {session.mode === 'signal' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(56,200,255,0.1)] text-[#0994b3]">Signal</span>
              )}
              {session.mode === 'paper' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(159,232,112,0.15)] text-[#163300]">Paper</span>
              )}
              {session.mode === 'live' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(255,209,26,0.15)] text-[#7a5f00]">Live</span>
              )}
              {session.status === 'running' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(5,77,40,0.06)] text-[#054d28]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9fe870] animate-pulse inline-block"></span>
                  Running
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f0f1ee] text-[#5a5b58]">Stopped</span>
              )}
            </div>
            <p className="text-sm text-[#686868] mt-1">{session.symbol} · {session.strategy} · {modeInfo[session.mode]}</p>
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-[#d03238] text-sm">{error}</span>}
            {session.status === 'running' ? (
              <button
                onClick={handleStop}
                disabled={loading === 'stop'}
                className="bg-[#d03238] text-white border-2 border-[#d03238] hover:bg-[#d94a4f] rounded-full px-4 py-2 font-semibold transition-all disabled:opacity-50"
              >
                {loading === 'stop' ? '...' : 'Stop'}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={loading === 'start'}
                className="bg-[#9fe870] text-[#163300] border-2 border-[#9fe870] hover:bg-[#cdffad] rounded-full px-5 py-2 font-semibold transition-all disabled:opacity-50"
              >
                {loading === 'start' ? '...' : 'Start'}
              </button>
            )}
          </div>
        </div>

        {/* Session Info Card */}
        <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)] mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[#686868] text-xs font-semibold uppercase tracking-wider">Pair</span>
              <p className="font-semibold text-[#0e0f0c] mt-1">{session.symbol}</p>
            </div>
            <div>
              <span className="text-[#686868] text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                Strategi <HelpIcon text={session.strategy === 'grid' ? 'Grid Trading: pasang order di level harga tetap' : 'Trend Following: deteksi tren pakai SMA'} />
              </span>
              <p className="font-semibold text-[#0e0f0c] mt-1">{session.strategy === 'grid' ? 'Grid Trading' : 'Trend Following'}</p>
            </div>
            <div>
              <span className="text-[#686868] text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                Mode <HelpIcon text={modeInfo[session.mode] || ''} />
              </span>
              <p className={`font-semibold mt-1 ${session.mode === 'live' ? 'text-[#7a5f00]' : 'text-[#0e0f0c]'}`}>
                {session.mode === 'signal' ? 'Signal' : session.mode === 'paper' ? 'Paper' : 'Live'}
              </p>
            </div>
            <div>
              <span className="text-[#686868] text-xs font-semibold uppercase tracking-wider">Status</span>
              <p className={`font-semibold mt-1 ${session.status === 'running' ? 'text-[#054d28]' : 'text-[#5a5b58]'}`}>{session.status}</p>
            </div>
          </div>
          <details className="mt-4 text-sm">
            <summary className="text-[#686868] cursor-pointer hover:text-[#0e0f0c] transition-colors text-xs font-medium">Lihat konfigurasi</summary>
            <pre className="mt-2 bg-[#f0f1ee] p-3 rounded-[16px] text-xs text-[#454745] overflow-x-auto">{JSON.stringify(configDisplay, null, 2)}</pre>
          </details>
        </div>

        {/* Real-time Price */}
        <div className="mb-6">
          <span className="text-[#686868] text-xs font-semibold uppercase tracking-wider block mb-2">Harga Real-time</span>
          <PriceBadge symbol={session.symbol} />
        </div>

        {/* Strategy Description */}
        <div className="border-l-4 border-[#9fe870] bg-[rgba(159,232,112,0.06)] rounded-[16px] p-4 mb-6 text-sm text-[#454745]">
          {session.strategy === 'grid' ? (
            <p>
              <span className="text-[#163300] font-semibold">Grid Trading</span>: Bot akan memasang order beli dan jual di {configDisplay.grid_count || '?'} level harga antara {configDisplay.lower_price || '?'} dan {configDisplay.upper_price || '?'}.
              Setiap order {configDisplay.quantity || '?'} {session.symbol.split('_')[0]}. Bot mengevaluasi setiap 30 detik.
            </p>
          ) : session.strategy === 'trend' ? (
            <p>
              <span className="text-[#454745] font-semibold">Trend Following (SMA)</span>: Bot menghitung SMA {configDisplay.fast_period || '?'} (cepat) dan SMA {configDisplay.slow_period || '?'} (lambat).
              Golden cross (SMA cepat &gt; SMA lambat) = sinyal <span className="text-[#054d28] font-medium">beli</span>. Death cross (SMA cepat &lt; SMA lambat) = sinyal <span className="text-[#d03238] font-medium">jual</span>.
            </p>
          ) : (
            <p>
              <span className="text-[#0994b3] font-semibold">DCA (Dollar Cost Average)</span>: Bot membeli <strong>${configDisplay.amount || '?'}</strong> setiap{' '}
              {configDisplay.interval_sec === 3600 ? '1 jam' : configDisplay.interval_sec === 7200 ? '2 jam' : configDisplay.interval_sec === 21600 ? '6 jam' : configDisplay.interval_sec === 43200 ? '12 jam' : configDisplay.interval_sec === 86400 ? '1 hari' : configDisplay.interval_sec === 604800 ? '1 minggu' : `${configDisplay.interval_sec || '?'} detik`}.
              {configDisplay.take_profit_pct > 0 ? ` Take profit ${configDisplay.take_profit_pct}% dari harga rata-rata beli.` : ' Tidak ada take profit — akumulasi terus.'}
            </p>
          )}
        </div>

        {/* P&L Cards */}
        {pnl ? (
          <div className="mb-6">
            <h2 className="text-base font-semibold text-[#0e0f0c] mb-3">Ringkasan Performa</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider flex items-center gap-1">Balance <HelpIcon text={pnlHelp.balance} /></p>
                <p className="text-xl font-bold text-[#0e0f0c] mt-1">${pnl.balance?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider flex items-center gap-1">Realized P&L <HelpIcon text={pnlHelp.realized} /></p>
                <p className={`text-xl font-bold mt-1 ${parseFloat(pnl.realized_pnl) >= 0 ? 'text-[#054d28]' : 'text-[#d03238]'}`}>
                  {parseFloat(pnl.realized_pnl) >= 0 ? '+' : ''}${pnl.realized_pnl}
                </p>
              </div>
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider">Total P&L</p>
                <p className={`text-xl font-bold mt-1 ${parseFloat(pnl.total_pnl) >= 0 ? 'text-[#054d28]' : 'text-[#d03238]'}`}>
                  {parseFloat(pnl.total_pnl) >= 0 ? '+' : ''}${pnl.total_pnl}
                </p>
              </div>
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider flex items-center gap-1">Win Rate <HelpIcon text={pnlHelp.winRate} /></p>
                <p className="text-xl font-bold text-[#0e0f0c] mt-1">{pnl.win_rate?.toFixed(1) || '0'}%</p>
              </div>
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider">Trades</p>
                <p className="text-xl font-bold text-[#0e0f0c] mt-1">{pnl.trade_count || 0}</p>
              </div>
            </div>
          </div>
        ) : pnlLoading ? (
          <p className="text-[#686868] mb-6 text-sm">Loading P&L...</p>
        ) : null}

        {/* Grid Signal Summary */}
        {isGridSignal && signalSummary && signalSummary.total_count > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-semibold text-[#0e0f0c] mb-3">Ringkasan Sinyal Grid</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider">Total Sinyal</p>
                <p className="text-lg font-bold text-[#0e0f0c] mt-1">{signalSummary.total_count}</p>
              </div>
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider">Success Rate</p>
                <p className={`text-lg font-bold mt-1 ${signalSummary.success_rate >= 50 ? 'text-[#054d28]' : signalSummary.success_rate > 0 ? 'text-[#7a5f00]' : 'text-[#686868]'}`}>
                  {signalSummary.success_rate.toFixed(1)}%
                </p>
              </div>
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider">Confirmed / Invalid / Expired</p>
                <p className="text-lg font-bold mt-1">
                  <span className="text-[#054d28]">{signalSummary.confirmed_count}</span>
                  <span className="text-[#686868] mx-1">/</span>
                  <span className="text-[#d03238]">{signalSummary.invalidated_count}</span>
                  <span className="text-[#686868] mx-1">/</span>
                  <span className="text-[#686868]">{signalSummary.expired_count}</span>
                </p>
              </div>
              <div className="bg-white rounded-[24px] p-5 border border-[rgba(14,15,12,0.08)]">
                <p className="text-xs text-[#686868] font-semibold uppercase tracking-wider">Buy / Sell</p>
                <p className="text-lg font-bold mt-1">
                  <span className="text-[#054d28]">{signalSummary.buy_count}</span>
                  <span className="text-[#686868] mx-1">/</span>
                  <span className="text-[#d03238]">{signalSummary.sell_count}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Grid Signal History */}
        {isGridSignal && strategySignals && strategySignals.length > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-semibold text-[#0e0f0c] mb-3">Histori Sinyal Grid</h2>
            <div className="bg-white rounded-[24px] overflow-hidden border border-[rgba(14,15,12,0.08)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[#686868] text-xs font-semibold uppercase tracking-wider bg-[#fafafa]">
                    <tr>
                      <th className="px-4 py-3 text-left">Waktu</th>
                      <th className="px-4 py-3 text-left">Sisi</th>
                      <th className="px-4 py-3 text-left">Level</th>
                      <th className="px-4 py-3 text-left">Harga</th>
                      <th className="px-4 py-3 text-left">Qty</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Hasil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(14,15,12,0.08)]">
                    {strategySignals.slice(0, 30).map(s => (
                      <tr key={s.id} className="hover:bg-[#fafafa] transition-colors">
                        <td className="px-4 py-3 text-[#686868] text-xs">{new Date(s.created_at).toLocaleString('id-ID')}</td>
                        <td className={`px-4 py-3 font-semibold text-xs ${s.signal_type === 'buy' ? 'text-[#054d28]' : 'text-[#d03238]'}`}>{s.signal_type}</td>
                        <td className="px-4 py-3 text-[#686868] text-xs">#{s.grid_level_index}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[#0e0f0c]">{parseFloat(s.grid_level_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</td>
                        <td className="px-4 py-3 text-xs text-[#454745]">{s.quantity}</td>
                        <td className={`px-4 py-3 text-xs font-semibold ${
                          s.validation_status === 'confirmed' ? 'text-[#054d28]' :
                          s.validation_status === 'invalidated' ? 'text-[#d03238]' :
                          s.validation_status === 'expired' ? 'text-[#5a5b58]' : 'text-[#7a5f00]'
                        }`}>{s.validation_status}</td>
                        <td className="px-4 py-3 text-xs">
                          {s.validation_status === 'confirmed' && s.result_pct != null && (
                            <span className={`font-semibold ${s.result_pct >= 0 ? 'text-[#054d28]' : 'text-[#d03238]'}`}>
                              {s.result_pct >= 0 ? '+' : ''}{s.result_pct.toFixed(2)}%
                            </span>
                          )}
                          {s.validation_status === 'pending' && <span className="text-[#7a5f00]">menunggu</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Orders Table — hidden when grid signal history is shown */}
        {!isGridSignal && (
          <>
            <h2 className="text-base font-semibold text-[#0e0f0c] mb-3">Riwayat Signal & Order</h2>
            {ordersLoading ? (
              <p className="text-[#686868] mb-6 text-sm">Loading orders...</p>
            ) : !orders?.length ? (
              <p className="text-[#686868] mb-6 text-sm">Belum ada order. Mulai session untuk melihat sinyal.</p>
            ) : (
              <div className="bg-white rounded-[24px] overflow-hidden border border-[rgba(14,15,12,0.08)] mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[#686868] text-xs font-semibold uppercase tracking-wider bg-[#fafafa]">
                      <tr>
                        <th className="px-4 py-3 text-left">Waktu</th>
                        <th className="px-4 py-3 text-left">Sisi</th>
                        <th className="px-4 py-3 text-left">Harga</th>
                        <th className="px-4 py-3 text-left">Jumlah</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Tipe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(14,15,12,0.08)]">
                      {orders.slice(0, 20).map(o => (
                        <tr key={o.id} className="hover:bg-[#fafafa] transition-colors">
                          <td className="px-4 py-3 text-[#686868] text-xs">{new Date(o.created_at).toLocaleTimeString('id-ID')}</td>
                          <td className={`px-4 py-3 font-semibold text-xs ${o.side === 'buy' ? 'text-[#054d28]' : 'text-[#d03238]'}`}>{o.side}</td>
                          <td className="px-4 py-3 text-[#0e0f0c]">{o.price}</td>
                          <td className="px-4 py-3 text-[#0e0f0c]">{o.quantity}</td>
                          <td className="px-4 py-3 text-[#454745]">{o.status}</td>
                          <td className="px-4 py-3 text-[#686868]">{o.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tips box */}
        <div className="bg-[rgba(159,232,112,0.06)] border border-[rgba(159,232,112,0.2)] rounded-[16px] p-4 mt-4">
          <p className="text-xs font-semibold text-[#163300] mb-2">Tips untuk pemula</p>
          <ul className="list-disc list-inside space-y-1 text-xs text-[#454745]">
            <li>Mulai dari <strong className="text-[#0e0f0c]">Signal Mode</strong> — lihat sinyal tanpa risiko</li>
            <li>Lanjut ke <strong className="text-[#0e0f0c]">Paper Trading</strong> — uji strategi dengan uang virtual $1000</li>
            <li>Baru ke <strong className="text-[#0e0f0c]">Live Trading</strong> — setelah strategi terbukti profit</li>
            <li>Session berjalan otomatis setiap 30 detik — start sekali, bot bekerja sendiri</li>
          </ul>
        </div>

      </div>
    </div>
  )
}
