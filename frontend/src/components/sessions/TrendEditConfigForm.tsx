'use client'
import { useState } from 'react'
import { GraduationCap, Settings } from 'lucide-react'
import { api } from '@/lib/api'
import type { TrendRecommendation } from '@/types'

interface TrendEditConfigFormProps {
  sessionId: number
  symbol: string
  currentConfig: Record<string, any>
  onSaved: () => void
  onCancel: () => void
  sessionRunning?: boolean
}

const inputCls = 'w-full px-3 py-2 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-xs text-[#0e0f0c] dark:text-[#e8ebe6] focus:outline-none focus:ring-2 focus:ring-[rgba(56,200,255,0.4)]'
const labelCls = 'text-xs text-[#686868] dark:text-[#898989] font-medium block mb-1'

export function TrendEditConfigForm({ sessionId, symbol, currentConfig, onSaved, onCancel, sessionRunning }: TrendEditConfigFormProps) {
  const [isBeginner, setIsBeginner] = useState(true)
  const [horizon, setHorizon] = useState<'short' | 'medium' | 'long'>(currentConfig.horizon || 'medium')
  const [capital, setCapital] = useState(String(currentConfig.capital || '100'))
  const [recommendation, setRecommendation] = useState<TrendRecommendation | null>(null)
  const [recLoading, setRecLoading] = useState(false)

  const [fastPeriod, setFastPeriod] = useState(String(currentConfig.fast_period || '10'))
  const [slowPeriod, setSlowPeriod] = useState(String(currentConfig.slow_period || '30'))
  const [trendInterval, setTrendInterval] = useState<'5m' | '15m' | '1h' | '4h'>(currentConfig.interval || '5m')
  const [quantity, setQuantity] = useState(String(currentConfig.quantity || '0.001'))
  const [validationTarget, setValidationTarget] = useState(String(currentConfig.validation_target_value ?? '2'))
  const [validationInvalid, setValidationInvalid] = useState(String(currentConfig.validation_invalid_value ?? '1'))
  const [validationWindow, setValidationWindow] = useState(String(currentConfig.validation_window_minutes ?? '120'))
  const [stopLoss, setStopLoss] = useState(String(currentConfig.stop_loss_pct || ''))
  const [takeProfit, setTakeProfit] = useState(String(currentConfig.take_profit_pct || ''))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchRecommendation() {
    setRecLoading(true)
    setError('')
    try {
      const rec = await api.trend.recommend({ symbol, horizon, capital: parseFloat(capital) || 100 })
      setRecommendation(rec)
      setFastPeriod(String(rec.fast_period))
      setSlowPeriod(String(rec.slow_period))
      setTrendInterval(rec.interval as any)
      setQuantity(rec.quantity)
      setValidationTarget(String(rec.validation_target_value))
      setValidationInvalid(String(rec.validation_invalid_value))
      setValidationWindow(String(rec.validation_window_minutes))
    } catch (e: any) {
      setError('Gagal ambil rekomendasi: ' + (e.message || ''))
    }
    setRecLoading(false)
  }

  function validate(): string {
    const fp = parseInt(fastPeriod)
    const sp = parseInt(slowPeriod)
    const qty = parseFloat(quantity)
    const target = parseFloat(validationTarget)
    const invalid = parseFloat(validationInvalid)
    const window = parseInt(validationWindow)
    if (isNaN(fp) || fp < 2) return 'SMA Cepat minimal 2'
    if (isNaN(sp) || sp < fp + 2) return `SMA Lambat minimal fast + 2 (${fp + 2})`
    if (sp > 200) return 'SMA Lambat maksimal 200'
    if (isNaN(qty) || qty <= 0) return 'Quantity harus > 0'
    if (isNaN(target) || target < 0) return 'Validasi target tidak boleh negatif'
    if (isNaN(invalid) || invalid < 0) return 'Validasi invalid tidak boleh negatif'
    if (isNaN(window) || window < 0 || window > 10080) return 'Window validasi harus 0–10080 menit'
    const sl = parseFloat(stopLoss)
    const tp = parseFloat(takeProfit)
    if (stopLoss && (isNaN(sl) || sl < 0 || sl >= 100)) return 'Stop Loss harus 0–99.99'
    if (takeProfit && (isNaN(tp) || tp < 0 || tp > 1000)) return 'Take Profit harus 0–1000'
    return ''
  }

  async function handleSave() {
    const validErr = validate()
    if (validErr) { setError(validErr); return }
    setSaving(true)
    setError('')
    try {
      const config: Record<string, any> = {
        ...currentConfig,
        fast_period: parseInt(fastPeriod),
        slow_period: parseInt(slowPeriod),
        interval: trendInterval,
        quantity,
        validation_mode: 'percent',
        validation_target_value: parseFloat(validationTarget),
        validation_invalid_value: parseFloat(validationInvalid),
        validation_window_minutes: parseInt(validationWindow),
      }
      if (stopLoss && parseFloat(stopLoss) > 0) config.stop_loss_pct = parseFloat(stopLoss)
      if (takeProfit && parseFloat(takeProfit) > 0) config.take_profit_pct = parseFloat(takeProfit)
      await api.sessions.applyConfig(sessionId, JSON.stringify(config))
      onSaved()
    } catch (e: any) {
      setError(e.message || 'Gagal simpan config')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Beginner/Manual toggle */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-[#686868] dark:text-[#898989] font-medium">Mode:</label>
        <button type="button"
          onClick={() => setIsBeginner(true)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition ${isBeginner ? 'bg-[rgba(56,200,255,0.85)] text-white' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989]'}`}>
          <GraduationCap size={13} className="inline mr-1" />Pemula
        </button>
        <button type="button"
          onClick={() => setIsBeginner(false)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition ${!isBeginner ? 'bg-[rgba(56,200,255,0.85)] text-white' : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989]'}`}>
          <Settings size={13} className="inline mr-1" />Manual
        </button>
      </div>

      {/* Beginner mode */}
      {isBeginner && (
        <div className="bg-[#f0f1ee] dark:bg-[#252822] rounded-[16px] p-4 space-y-3 border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Horizon</label>
              <select className={inputCls} value={horizon} onChange={e => setHorizon(e.target.value as any)}>
                <option value="short">Pendek (sinyal sering)</option>
                <option value="medium">Menengah (seimbang)</option>
                <option value="long">Panjang (sinyal jarang, reliabel)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Modal (USDT)</label>
              <input className={inputCls} type="number" min="1" placeholder="100" value={capital} onChange={e => setCapital(e.target.value)} />
            </div>
          </div>
          <button type="button" onClick={fetchRecommendation} disabled={recLoading}
            className="w-full px-3 py-1.5 bg-[rgba(56,200,255,0.85)] text-white font-semibold hover:bg-[rgba(56,200,255,1)] rounded-full text-xs transition disabled:opacity-50">
            {recLoading ? 'Memuat...' : 'Rekomendasi'}
          </button>
          {recommendation && (
            <div className="bg-white dark:bg-[#1e201c] border-l-4 border-[rgba(56,200,255,0.85)] rounded-[12px] p-3 text-xs space-y-1">
              <p className="text-[#0994b3] dark:text-[#5dd8f5] font-semibold">Rekomendasi untuk {symbol}</p>
              <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">SMA: cepat {recommendation.fast_period}, lambat {recommendation.slow_period} pada interval {recommendation.interval}</p>
              <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Qty: {recommendation.quantity} ({horizon}, modal ${capital})</p>
              <p className="text-[#0e0f0c] dark:text-[#e8ebe6]">Validasi: target +{recommendation.validation_target_value}%, invalid -{recommendation.validation_invalid_value}% dalam {recommendation.validation_window_minutes} menit</p>
              <p className="text-[#686868] dark:text-[#898989] italic">{recommendation.reason}</p>
            </div>
          )}
        </div>
      )}

      {/* Manual mode / always-visible fields after recommendation */}
      {(!isBeginner || recommendation) && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[#686868] dark:text-[#898989]">
            {isBeginner ? 'Config yang akan diterapkan ↓' : 'Konfigurasi SMA'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>SMA Cepat (fast period)</label>
              <input className={inputCls} type="number" min="2" placeholder="10" value={fastPeriod} onChange={e => setFastPeriod(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>SMA Lambat (slow period)</label>
              <input className={inputCls} type="number" min="4" placeholder="30" value={slowPeriod} onChange={e => setSlowPeriod(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Interval Candle</label>
              <select className={inputCls} value={trendInterval} onChange={e => setTrendInterval(e.target.value as any)}>
                <option value="5m">5 menit</option>
                <option value="15m">15 menit</option>
                <option value="1h">1 jam</option>
                <option value="4h">4 jam</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Qty per Sinyal</label>
              <input className={inputCls} type="number" min="0" step="0.00001" placeholder="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
          </div>

          <p className="text-xs font-semibold text-[#686868] dark:text-[#898989] pt-1">Validasi</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Target %</label>
              <input className={inputCls} type="number" min="0" step="0.1" placeholder="2" value={validationTarget} onChange={e => setValidationTarget(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Invalid %</label>
              <input className={inputCls} type="number" min="0" step="0.1" placeholder="1" value={validationInvalid} onChange={e => setValidationInvalid(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Window (menit)</label>
              <input className={inputCls} type="number" min="0" max="10080" placeholder="120" value={validationWindow} onChange={e => setValidationWindow(e.target.value)} />
            </div>
          </div>

          <p className="text-xs font-semibold text-[#686868] dark:text-[#898989] pt-1">Stop Loss / Take Profit <span className="font-normal">(opsional)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Stop Loss %</label>
              <input className={inputCls} type="number" min="0" max="99.99" step="0.1" placeholder="0 = nonaktif" value={stopLoss} onChange={e => setStopLoss(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Take Profit %</label>
              <input className={inputCls} type="number" min="0" max="1000" step="0.1" placeholder="0 = nonaktif" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-[#d03238]">{error}</p>}

      {sessionRunning && (
        <p className="text-xs text-[#686868] dark:text-[#898989]">Hentikan session sebelum mengubah config.</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || sessionRunning}
          className="px-4 py-2 text-sm font-semibold bg-[rgba(56,200,255,0.85)] text-white rounded-full hover:bg-[rgba(56,200,255,1)] transition-all disabled:opacity-40">
          {saving ? 'Menyimpan...' : '✓ Simpan'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold bg-white dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] text-[#686868] dark:text-[#898989] rounded-full hover:text-[#d03238] transition-all">
          Batal
        </button>
      </div>
    </div>
  )
}
