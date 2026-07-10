'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Grid2x2, TrendingUp, Coins, Zap, FileText, BarChart2, X, AlertTriangle, CheckCircle } from 'lucide-react'
import { PriceBadge } from '@/components/PriceBadge'
import type { Session } from '@/types'

export function SessionCard({ session, onStart, onStop, onDelete, onDetail, livePnl, confirmDelete, onCancelDelete, onForceSell, forceSellConfirm, onCancelForceSell }: {
  session: Session
  onStart: (id: number) => void
  onStop: (id: number) => void
  onDelete: (id: number) => void
  onDetail: (id: number) => void
  livePnl?: { realized: number; trades: number } | null
  confirmDelete?: boolean
  onCancelDelete?: () => void
  onForceSell?: (id: number) => void
  forceSellConfirm?: boolean
  onCancelForceSell?: () => void
}) {
  const qc = useQueryClient()
  const [showLiveConfirm, setShowLiveConfirm] = useState(false)

  // Currency derived from the session's quote asset (USDT for grid/trend, IDR for DCA).
  const quote = session.symbol.split('_')[1] || 'USDT'
  const cur = quote === 'IDR' ? 'Rp' : '$'
  const lowThreshold = quote === 'IDR' ? 50000 : 10
  const fmtCur = (v: number) =>
    cur + v.toLocaleString(quote === 'IDR' ? 'id-ID' : 'en-US',
      quote === 'IDR' ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Dry-run preview: parse config for quantity/amount + get quote-asset balance from cache
  const cachedBalance = qc.getQueryData<{ can_trade: number; assets: { asset: string; free: string; locked: string }[] }>(['account-balance'])
  const usdtFree = parseFloat(cachedBalance?.assets.find(a => a.asset === quote)?.free ?? '0')

  // Parse config to get per-order notional
  const cfg = (() => { try { return JSON.parse(session.config) } catch { return null } })()
  const perOrderNotional = (() => {
    if (!cfg) return null
    if (session.strategy === 'dca') return parseFloat(cfg.amount ?? '0')
    if (session.strategy === 'trend') return null // unknown without ticker
    if (session.strategy === 'grid') return null // grid doesn't use single notional
    return null
  })()

  const strategyIcon = session.strategy === 'grid' ? <Grid2x2 size={22} /> : session.strategy === 'trend' ? <TrendingUp size={22} /> : <Coins size={22} />
  const modeIcon = session.mode === 'live' ? <Zap size={10} /> : session.mode === 'paper' ? <FileText size={10} /> : <BarChart2 size={10} />
  const modeBg = session.mode === 'live'
    ? 'bg-[rgba(255,209,26,0.9)] dark:bg-[rgba(255,209,26,0.8)]'
    : session.mode === 'paper'
    ? 'bg-[rgba(159,232,112,0.9)] dark:bg-[rgba(159,232,112,0.7)]'
    : 'bg-[rgba(56,200,255,0.9)] dark:bg-[rgba(56,200,255,0.7)]'
  const strategyBg = session.strategy === 'grid'
    ? 'bg-[rgba(159,232,112,0.15)]'
    : session.strategy === 'trend'
    ? 'bg-[rgba(56,200,255,0.1)]'
    : 'bg-[rgba(255,209,26,0.1)]'
  const strategyIconColor = session.strategy === 'grid'
    ? 'text-[#163300] dark:text-[#9fe870]'
    : session.strategy === 'trend'
    ? 'text-[#0994b3] dark:text-[#5dd8f5]'
    : 'text-[#7a5f00] dark:text-[#f5c842]'
  const modeIconColor = session.mode === 'live'
    ? 'text-[#7a5f00]'
    : session.mode === 'paper'
    ? 'text-[#163300]'
    : 'text-[#0994b3]'
  const strategyLabel = session.strategy === 'grid' ? 'Grid Trading' : session.strategy === 'trend' ? 'Trend Following' : 'DCA'

  function handleStartClick() {
    if (session.mode === 'live') {
      setShowLiveConfirm(true)
    } else {
      onStart(session.id)
    }
  }

  return (
    <>
      {/* Live confirmation + dry-run preview modal */}
      {showLiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowLiveConfirm(false)}>
          <div className="bg-white dark:bg-[#1e201c] rounded-[24px] border border-[rgba(208,50,56,0.3)] shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 rounded-full bg-[rgba(208,50,56,0.1)] flex items-center justify-center text-[#d03238] dark:text-[#ff6b6f] flex-shrink-0">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h3 className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">Konfirmasi Live Trading</h3>
                <p className="text-xs text-[#686868] dark:text-[#898989]">{session.name}</p>
              </div>
            </div>

            {/* Dry-run preview */}
            <div className="rounded-[16px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] p-3 mb-3 space-y-2">
              <p className="text-[10px] font-bold text-[#686868] dark:text-[#898989] uppercase tracking-wider">Simulasi Saldo</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#686868] dark:text-[#898989]">{quote} tersedia</span>
                <span className={`font-bold ${usdtFree < lowThreshold ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#054d28] dark:text-[#9fe870]'}`}>
                  {fmtCur(usdtFree)}
                  {usdtFree < lowThreshold && ' ⚠️'}
                </span>
              </div>
              {perOrderNotional != null && perOrderNotional > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#686868] dark:text-[#898989]">Per order ({session.strategy.toUpperCase()})</span>
                    <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmtCur(perOrderNotional)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#686868] dark:text-[#898989]">Estimasi order bisa dieksekusi</span>
                    <span className={`font-bold ${Math.floor(usdtFree / perOrderNotional) < 1 ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#054d28] dark:text-[#9fe870]'}`}>
                      {Math.floor(usdtFree / perOrderNotional)} order
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#f0f1ee] dark:bg-[#252822] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${usdtFree >= perOrderNotional ? 'bg-[#9fe870]' : 'bg-[#ff6b6f]'}`}
                      style={{ width: `${Math.min(100, (usdtFree / (perOrderNotional * 5)) * 100)}%` }}
                    />
                  </div>
                </>
              )}
              {usdtFree < 1 && (
                <p className="text-[10px] text-[#d03238] dark:text-[#ff6b6f]">⚠️ Saldo {quote} sangat rendah — order kemungkinan akan gagal</p>
              )}
            </div>

            <div className="bg-[rgba(208,50,56,0.06)] dark:bg-[rgba(208,50,56,0.1)] rounded-[16px] p-3 mb-4 text-xs text-[#686868] dark:text-[#898989] space-y-1.5">
              <p>⚡ Order sungguhan di TokoCrypto — <strong className="text-[#0e0f0c] dark:text-[#e8ebe6]">market order</strong>, ada slippage.</p>
              <p>🔄 Setiap sinyal langsung dieksekusi tanpa konfirmasi tambahan.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowLiveConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989] hover:bg-[rgba(14,15,12,0.1)] dark:hover:bg-[rgba(232,235,230,0.1)] rounded-full transition">
                Batal
              </button>
              <button onClick={() => { setShowLiveConfirm(false); onStart(session.id) }}
                className="flex-1 px-4 py-2.5 text-sm font-bold bg-[#d03238] text-white hover:bg-[#b02028] rounded-full transition shadow-[0_2px_8px_rgba(208,50,56,0.4)]">
                Ya, Mulai Live
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`bg-white dark:bg-[#1e201c] rounded-[24px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] hover:border-[rgba(14,15,12,0.16)] dark:hover:border-[rgba(232,235,230,0.16)] hover:shadow-[0_8px_32px_rgba(14,15,12,0.08)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all p-5 cursor-pointer group border-l-4 ${
          session.strategy === 'grid'
            ? 'border-l-[#9fe870]'
            : session.strategy === 'trend'
            ? 'border-l-[#38c8ff]'
            : 'border-l-[#ffd11a]'
        } ${
          session.mode === 'live' ? 'border-l-[#d03238]' : ''
        } ${
          session.status === 'running'
            ? 'bg-[rgba(159,232,112,0.015)] dark:bg-[rgba(159,232,112,0.03)]'
            : ''
        }`}
        onClick={() => onDetail(session.id)}
      >
        <div className="flex items-center gap-4">
          {/* Strategy icon utama + mode badge kecil */}
          <div className="relative flex-shrink-0">
            <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center ${strategyBg} ${strategyIconColor}`}>
              {strategyIcon}
            </div>
            <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${modeBg} ${modeIconColor}`}>
              {modeIcon}
            </span>
          </div>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-[#0e0f0c] dark:text-[#e8ebe6] text-base leading-tight truncate max-w-[200px] sm:max-w-[300px] md:max-w-sm">{session.name}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                session.mode === 'live'
                  ? 'bg-[rgba(208,50,56,0.12)] text-[#d03238] dark:text-[#ff6b6f]'
                  : session.mode === 'paper'
                  ? 'bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870]'
                  : 'bg-[rgba(56,200,255,0.12)] text-[#0994b3] dark:text-[#5dd8f5]'
              }`}>
                {session.mode === 'signal' ? 'Signal' : session.mode === 'paper' ? 'Paper' : '⚡ Live'}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                session.status === 'running'
                  ? 'bg-[rgba(159,232,112,0.15)] dark:bg-[rgba(159,232,112,0.2)] text-[#163300] dark:text-[#9fe870]'
                  : 'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#5a5b58] dark:text-[#8a8d88]'
              }`}>
                {session.status === 'running' && (
                  <span className={`inline-block w-2 h-2 rounded-full ${session.is_alive ? 'bg-[#9fe870] animate-pulse' : 'bg-[#ffd11a]'}`} title={session.is_alive ? 'Goroutine aktif' : 'Status DB running, goroutine belum jalan'} />
                )}
                {session.status === 'running' ? 'Running' : 'Stopped'}
              </span>
            </div>
            <p className="text-xs text-[#686868] dark:text-[#898989] truncate min-w-0">
              <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{session.symbol}</span> · {strategyLabel} · <PriceBadge symbol={session.symbol} compact />
            </p>
            {session.mode === 'paper' && session.virtual_balance != null && (
              <p className="text-xs mt-1 flex items-center gap-2">
                <span className="text-[#686868] dark:text-[#898989]">Saldo virtual</span>
                <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{fmtCur(session.virtual_balance)}</span>
                {session.initial_balance != null && (
                  <span className={`text-xs font-semibold ${session.virtual_balance >= session.initial_balance ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                    {session.virtual_balance >= session.initial_balance ? '+' : ''}{(((session.virtual_balance - session.initial_balance) / session.initial_balance) * 100).toFixed(1)}%
                  </span>
                )}
              </p>
            )}
            {session.mode === 'live' && livePnl != null && (
              <p className="text-xs mt-1 flex items-center gap-2">
                <span className="text-[#686868] dark:text-[#898989]">Realized P&L</span>
                <span className={`font-semibold ${livePnl.realized >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                  {livePnl.realized >= 0 ? '+' : ''}{fmtCur(livePnl.realized)}
                </span>
                <span className="text-[#686868] dark:text-[#898989]">{livePnl.trades} trade{livePnl.trades !== 1 ? 's' : ''}</span>
              </p>
            )}
            {session.mode === 'live' && livePnl == null && (
              <p className="text-xs mt-1 text-[#686868] dark:text-[#898989]">⚡ Live · belum ada trade</p>
            )}
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {session.status === 'running' ? (
              <button className="px-4 py-2 text-xs font-semibold bg-[rgba(208,50,56,0.08)] text-[#d03238] hover:bg-[#d03238] hover:text-white border border-[rgba(208,50,56,0.2)] hover:border-[#d03238] rounded-full transition" onClick={() => onStop(session.id)}>Stop</button>
            ) : (
              <button
                className={`px-4 py-2 text-xs font-semibold rounded-full transition ${
                  session.mode === 'live'
                    ? 'bg-[rgba(208,50,56,0.1)] text-[#d03238] dark:text-[#ff6b6f] hover:bg-[#d03238] hover:text-white border border-[rgba(208,50,56,0.3)] hover:border-[#d03238] shadow-[0_2px_8px_rgba(208,50,56,0.2)]'
                    : 'bg-[#9fe870] text-[#163300] hover:bg-[#cdffad] shadow-[0_2px_8px_rgba(159,232,112,0.3)]'
                }`}
                onClick={handleStartClick}
              >
                {session.mode === 'live' ? '⚡ Start Live' : 'Start'}
              </button>
            )}
            {/* Force Sell — DCA live running only */}
            {session.strategy === 'dca' && session.mode === 'live' && session.status === 'running' && onForceSell && (
              forceSellConfirm ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[#686868] dark:text-[#898989] mr-1">Jual semua?</span>
                  <button
                    className="px-3 py-2 text-xs font-semibold bg-[#d03238] text-white hover:bg-[#b02028] rounded-full transition"
                    onClick={() => onForceSell(session.id)}
                  >Ya</button>
                  <button
                    className="px-3 py-2 text-xs font-semibold bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989] hover:bg-[rgba(14,15,12,0.12)] rounded-full transition"
                    onClick={onCancelForceSell}
                  >Batal</button>
                </div>
              ) : (
                <button
                  className="px-3 py-2 text-xs font-semibold bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f] hover:bg-[#d03238] hover:text-white border border-[rgba(208,50,56,0.2)] hover:border-[#d03238] rounded-full transition"
                  onClick={() => onForceSell(session.id)}
                  title="Jual semua posisi sekarang"
                >Force Sell</button>
              )
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-[#686868] dark:text-[#898989] mr-1">Yakin?</span>
                <button
                  className="px-3 py-2 text-xs font-semibold bg-[#d03238] text-white hover:bg-[#b02028] rounded-full transition"
                  onClick={() => onDelete(session.id)}
                >Ya</button>
                <button
                  className="px-3 py-2 text-xs font-semibold bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989] hover:bg-[rgba(14,15,12,0.12)] rounded-full transition"
                  onClick={onCancelDelete}
                >Batal</button>
              </div>
            ) : (
              <button className="flex items-center gap-1 px-3 py-2 text-[#686868] hover:text-[#d03238] hover:bg-[rgba(208,50,56,0.08)] dark:hover:text-[#ff6b6f] dark:hover:bg-[rgba(208,50,56,0.15)] rounded-full text-sm transition" onClick={() => onDelete(session.id)} title="Hapus">
                <X size={14} />
                <span className="sr-only sm:not-sr-only text-xs font-medium">Hapus</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
