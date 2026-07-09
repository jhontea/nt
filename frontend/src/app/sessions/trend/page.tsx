'use client'
import { useEffect, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Navbar } from '@/components/Navbar'
import { SessionCard } from '@/components/sessions/SessionCard'
import { StrategyOverview } from '@/components/sessions/StrategyOverview'
import { StrategyBanner } from '@/components/sessions/StrategyBanner'
import { CreateSessionModal } from '@/components/sessions/CreateSessionModal'
import { StrategyTabs } from '@/components/sessions/StrategyTabs'
import { SectionLabel } from '@/components/sessions/SectionLabel'
import { EmptyState } from '@/components/sessions/EmptyState'
import { TrendSparkline } from '@/components/sessions/TrendSparkline'
import { InfoStrip } from '@/components/sessions/InfoStrip'
import { TrendingUp, Plus, Clock, Wallet, History } from 'lucide-react'

function parseTrendConfig(config: string): any {
  try { return JSON.parse(config) } catch { return null }
}

export default function TrendPage() {
  const { isAuthenticated, initialized } = useAuth()
  const router = useRouter()
  useEffect(() => { if (initialized && !isAuthenticated) router.push('/login') }, [initialized, isAuthenticated, router])

  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState('all')

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['trend-sessions'],
    queryFn: api.trend.sessions.list,
    enabled: isAuthenticated,
  })

  const { data: trendStatuses } = useQuery({
    queryKey: ['trend-status'],
    queryFn: api.trend.sessions.status,
    enabled: isAuthenticated,
    refetchInterval: 15000,
  })

  const uniqueSymbols = useMemo(() => [...new Set(sessions?.map(s => s.symbol) ?? [])], [sessions])

  const counts = useMemo(() => ({
    all: sessions?.length ?? 0,
    running: sessions?.filter(s => s.status === 'running').length ?? 0,
    stopped: sessions?.filter(s => s.status !== 'running').length ?? 0,
  }), [sessions])

  const filteredSessions = useMemo(() => {
    if (filter === 'all') return sessions ?? []
    return (sessions ?? []).filter(s => s.status === (filter === 'running' ? 'running' : 'stopped'))
  }, [sessions, filter])

  async function handleStart(id: number) { await api.sessions.start(id); refetch() }
  async function handleStop(id: number) { await api.sessions.stop(id); refetch() }
  async function handleDelete(id: number) {
    if (!confirm('Hapus session ini? Data sinyal dan order akan hilang permanen.')) return
    await api.sessions.delete(id); refetch()
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="sessions/trend" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[14px] bg-[rgba(56,200,255,0.12)] text-[#0994b3] dark:text-[#5dd8f5] flex items-center justify-center"><TrendingUp size={20} /></span>
            <div>
              <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight">Trend Following</h1>
              <p className="text-sm text-[#686868] dark:text-[#898989] mt-1">
                Bot mendeteksi tren dengan SMA crossover — golden cross beli, death cross jual.
              </p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-5 py-3 bg-[#38c8ff] text-[#003344] font-bold border-2 border-[#38c8ff] hover:bg-[#7de5ff] rounded-full transition-all text-sm shadow-[0_2px_8px_rgba(56,200,255,0.4)] whitespace-nowrap flex items-center gap-1.5">
            <Plus size={16} /> New Session
          </button>
        </div>
        <StrategyTabs active="trend" />
        {sessions && <StrategyOverview sessions={sessions} strategy="trend" />}
        <InfoStrip tone="trend" icon={<TrendingUp size={16} />} text="Bot mendeteksi tren dengan SMA crossover — golden cross memicu beli, death cross memicu jual." help="Trend cocok untuk pasar yang sedang bergerak kuat ke satu arah." />
        <StrategyBanner strategy="trend" sessions={sessions ?? []} />

        {/* Per-symbol insight */}
        {uniqueSymbols.length > 0 && (
          <div className="mb-6">
            <SectionLabel>RIWAYAT PER PAIR</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {uniqueSymbols.map(sym => {
                const symSessions = sessions!.filter(s => s.symbol === sym)
                const running = symSessions.filter(s => s.status === 'running').length
                const paper = symSessions.filter(s => s.mode === 'paper' && s.virtual_balance != null)
                const avgBal = paper.length > 0 ? paper.reduce((sum, s) => sum + (s.virtual_balance ?? 0), 0) / paper.length : null
                const avgInit = paper.length > 0 ? paper.reduce((sum, s) => sum + (s.initial_balance ?? 0), 0) / paper.length : 0
                const avgPct = avgBal !== null && avgInit > 0 ? ((avgBal - avgInit) / avgInit) * 100 : null
                return (
                  <div key={sym} className="bg-white dark:bg-[#1e201c] rounded-[16px] px-4 py-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">{sym.replace('_', '/')}</span>
                      {running > 0 && <span className="flex items-center gap-1 text-[10px] font-bold text-[#5dd8f5]"><span className="w-1.5 h-1.5 rounded-full bg-[#5dd8f5] animate-pulse" />{running} running</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#686868] dark:text-[#898989]">
                      <span>{symSessions.length} session</span>
                      {avgBal !== null && (
                        <>
                          <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                          <span>Avg ${avgBal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          {avgPct !== null && (
                            <span className={`font-semibold ${avgPct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                              {avgPct >= 0 ? '+' : ''}{avgPct.toFixed(1)}%
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <SectionLabel>SESSION TREND · {filteredSessions.length}</SectionLabel>
          </div>
          <div className="flex gap-1 p-1 bg-[#f0f1ee] dark:bg-[#252822] rounded-full border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
            {['all','running','stopped'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${filter === f ? 'bg-white dark:bg-[#1e201c] text-[#0e0f0c] dark:text-[#e8ebe6] shadow-sm' : 'text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6]'}`}>
                {f === 'all' ? 'Semua' : f === 'running' ? 'Running' : 'Stopped'} {counts[f as keyof typeof counts] > 0 && <span className="opacity-60">{counts[f as keyof typeof counts]}</span>}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 flex items-center gap-2 animate-pulse"><div className="w-4 h-4 rounded-full bg-[#e8ebe6] dark:bg-[#2a2c27]" /><span className="text-[#686868] dark:text-[#898989] text-sm">Memuat sessions...</span></div>
        ) : filteredSessions.length === 0 ? (
          sessions && sessions.length > 0 ? (
            <p className="text-sm text-[#686868] dark:text-[#898989] py-8 text-center">Tidak ada session dengan status {filter}.</p>
          ) : (
            <EmptyState
              icon={<TrendingUp size={28} />}
              title="Belum ada session Trend"
              description="Klik “+ New Session” untuk membuat session pertama dan mulai mendeteksi tren."
              actionLabel="New Session"
              onAction={() => setShowCreate(true)}
            />
          )
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((s) => {
              const cfg = parseTrendConfig(s.config)
              return (
                <div key={s.id}>
                  <SessionCard session={s} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} onDetail={id => router.push(`/sessions/${id}`)} />
                  {cfg && (
                    <div key={s.id + '-cfg'} className="mx-1 -mt-1 rounded-b-[16px] overflow-hidden border border-t-0 border-[rgba(56,200,255,0.15)]">
                      {/* Config strip */}
                      <div className="bg-[rgba(56,200,255,0.04)] dark:bg-[rgba(56,200,255,0.06)] px-4 py-2.5 flex items-center gap-3 text-xs text-[#686868] dark:text-[#898989] flex-wrap">
                        <span>SMA Cepat <span className="font-semibold text-[#0994b3] dark:text-[#5dd8f5]">{cfg.fast_period || 10}</span></span>
                        <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                        <span>SMA Lambat <span className="font-semibold text-[#0994b3] dark:text-[#5dd8f5]">{cfg.slow_period || 30}</span></span>
                        <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                        <span>Interval <span className="font-semibold text-[#0994b3] dark:text-[#5dd8f5]">{cfg.interval || '5m'}</span></span>
                        <span className="w-px h-3 bg-[rgba(14,15,12,0.1)] dark:bg-[rgba(232,235,230,0.1)]" />
                        <span>Qty <span className="font-semibold text-[#0e0f0c] dark:text-[#e8ebe6]">{cfg.quantity || '?'}</span></span>
                      </div>
                      {(() => {
                        const st = trendStatuses?.find(t => t.session_id === s.id)
                        if (!st) return null
                        if (st.cross_status === 'unknown' || st.fast_sma == null || st.slow_sma == null) return (
                          <div className="px-4 py-2 bg-[rgba(56,200,255,0.02)] dark:bg-[rgba(56,200,255,0.04)] text-[10px] text-[#686868] dark:text-[#898989]">
                            SMA tidak tersedia — restart session untuk menghitung ulang
                          </div>
                        )
                        const isGolden = st.cross_status === 'golden'
                        const barColor = isGolden ? 'bg-[#9fe870]' : st.cross_status === 'death' ? 'bg-[#ff6b6f]' : 'bg-[rgba(140,140,140,0.3)]'
                        const labelColor = isGolden ? 'text-[#054d28] dark:text-[#9fe870]' : st.cross_status === 'death' ? 'text-[#d03238] dark:text-[#ff6b6f]' : 'text-[#686868] dark:text-[#898989]'
                        const crossLabel = isGolden ? '↑ Golden Cross' : st.cross_status === 'death' ? '↓ Death Cross' : '— Neutral'

                        // Gap between fast and slow SMA as % — how far from a crossover
                        const smaGapPct = st.fast_sma != null && st.slow_sma != null && st.slow_sma !== 0
                          ? Math.abs((st.fast_sma - st.slow_sma) / st.slow_sma) * 100
                          : null

                        // What needs to happen for next action
                        const hasPosition = st.holding_qty != null && st.holding_qty > 0
                        const nextActionLabel = isGolden
                          ? hasPosition
                            ? '⏳ Menunggu Death Cross untuk JUAL'
                            : '✓ Golden Cross — bot sudah BUY'
                          : st.cross_status === 'death'
                            ? !hasPosition
                              ? '⏳ Menunggu Golden Cross untuk BELI'
                              : '✓ Death Cross — bot sudah SELL'
                            : '⏳ Menunggu crossover SMA'

                        return (
                          <div className="bg-[rgba(56,200,255,0.02)] dark:bg-[rgba(56,200,255,0.04)]">
                            {/* Row 1: Sparkline + Price + Cross Status */}
                            <div className="px-4 pt-3 pb-2 flex items-center gap-4">
                              {/* Sparkline */}
                              {st.recent_prices && st.recent_prices.length > 0 && (
                                <div className="flex-shrink-0">
                                  <TrendSparkline
                                    prices={st.recent_prices}
                                    fastSMA={st.recent_fast_sma || []}
                                    slowSMA={st.recent_slow_sma || []}
                                    width={100}
                                    height={32}
                                  />
                                  <div className="flex justify-between text-[9px] mt-0.5 gap-2">
                                    <span className="text-[#9fe870]">— SMA{cfg.fast_period||10}</span>
                                    <span className="text-[#ff6b6f]">— SMA{cfg.slow_period||30}</span>
                                  </div>
                                </div>
                              )}
                              {/* Price + Cross */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-[#0e0f0c] dark:text-[#e8ebe6]">
                                    {st.current_price != null ? st.current_price.toFixed(st.current_price < 1 ? 8 : 2) : '-'}
                                  </span>
                                  <span className={`text-[10px] font-bold ${labelColor}`}>{crossLabel}</span>
                                  {smaGapPct != null && (
                                    <span className="text-[10px] text-[#686868] dark:text-[#898989]">
                                      gap {smaGapPct.toFixed(3)}%
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-[10px] text-[#9fe870] opacity-80">
                                    SMA{cfg.fast_period || 10} {st.fast_sma?.toFixed(8)}
                                  </span>
                                  <span className="text-[10px] text-[#ff6b6f] opacity-80">
                                    SMA{cfg.slow_period || 30} {st.slow_sma?.toFixed(8)}
                                  </span>
                                </div>
                              </div>
                              {/* Next candle ETA */}
                              {st.next_candle_eta && (
                                <div className="flex-shrink-0 flex items-center gap-1 text-[10px] text-[#686868] dark:text-[#898989]">
                                  <Clock size={10} />
                                  <span>{st.next_candle_eta}</span>
                                </div>
                              )}
                            </div>

                            {/* Row 2: Next action status — the key info */}
                            <div className="px-4 pb-2">
                              <div className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${
                                isGolden && hasPosition ? 'bg-[rgba(255,107,111,0.08)] text-[#d03238] dark:text-[#ff6b6f]' :
                                isGolden ? 'bg-[rgba(159,232,112,0.08)] text-[#054d28] dark:text-[#9fe870]' :
                                st.cross_status === 'death' && !hasPosition ? 'bg-[rgba(56,200,255,0.08)] text-[#0994b3] dark:text-[#5dd8f5]' :
                                'bg-[rgba(140,140,140,0.08)] text-[#686868] dark:text-[#898989]'
                              }`}>
                                {nextActionLabel}
                              </div>
                            </div>

                            {/* Row 3: Progress bar — SMA gap proximity */}
                            <div className="px-4 pb-2">
                              <div className="flex justify-between text-[9px] text-[#686868] dark:text-[#898989] mb-1">
                                <span>SMA cepat {'<'} lambat</span>
                                <span>posisi harga</span>
                                <span>SMA cepat {'>'} lambat</span>
                              </div>
                              <div className="relative h-2 bg-[#f0f1ee] dark:bg-[#252822] rounded-full overflow-hidden">
                                <div className={`absolute inset-0 rounded-full ${barColor} opacity-20`} />
                                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-[#1e201c] shadow-sm transition-all" style={{
                                  left: `${Math.min(100, Math.max(0, st.price_position_pct ?? 0))}%`,
                                  background: isGolden ? '#9fe870' : st.cross_status === 'death' ? '#ff6b6f' : 'rgba(140,140,140,0.5)',
                                  transform: 'translate(-50%, -50%)',
                                }} />
                              </div>
                            </div>

                            {/* Row 4: Holding + Signal info */}
                            <div className="px-4 pb-2.5 flex items-center gap-3 text-[10px] flex-wrap">
                              {/* Holding */}
                              {hasPosition ? (
                                <span className="flex items-center gap-1 text-[#686868] dark:text-[#898989]">
                                  <Wallet size={10} />
                                  Hold {st.holding_qty!.toFixed(4)} (${st.holding_value?.toFixed(2)})
                                  {st.unrealized_pnl != null && (
                                    <span className={`font-semibold ${st.unrealized_pnl >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                      {st.unrealized_pnl >= 0 ? '+' : ''}{st.unrealized_pnl_pct?.toFixed(2)}%
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[#686868] dark:text-[#898989]">
                                  <Wallet size={10} /> Cash — menunggu sinyal beli
                                </span>
                              )}
                              {/* Last signal */}
                              {st.last_signal_type && (
                                <span className={`font-semibold ${st.last_signal_result != null && st.last_signal_result >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}`}>
                                  Last {st.last_signal_type === 'buy' ? '▲ Buy' : '▼ Sell'}{st.last_signal_result != null ? ` ${st.last_signal_result >= 0 ? '+' : ''}${st.last_signal_result.toFixed(2)}%` : ''}
                                </span>
                              )}
                              {/* Signal history */}
                              {st.signal_history && st.signal_history.length > 1 && (
                                <span className="flex items-center gap-1 text-[#686868] dark:text-[#898989]">
                                  <History size={10} />
                                  {st.signal_history.slice(1, 5).map((sig, i) => (
                                    <span key={i} className={sig.result_pct != null && sig.result_pct >= 0 ? 'text-[#054d28] dark:text-[#9fe870]' : 'text-[#d03238] dark:text-[#ff6b6f]'}>
                                      {sig.side === 'buy' ? '▲' : '▼'}{sig.result_pct != null ? `${sig.result_pct >= 0 ? '+' : ''}${sig.result_pct.toFixed(1)}%` : '?'}
                                      {i < Math.min(st.signal_history!.length - 2, 3) ? ' ' : ''}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <CreateSessionModal strategy="trend" open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  )
}
