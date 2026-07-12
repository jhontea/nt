'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

interface DCAEditConfigFormProps {
  sessionId: number
  symbol: string
  currentConfig: Record<string, any>
  onSaved: () => void
  onCancel: () => void
  sessionRunning?: boolean
}

const inputCls = 'w-full px-3 py-2 bg-[#f0f1ee] dark:bg-[#252822] border border-[rgba(14,15,12,0.12)] dark:border-[rgba(232,235,230,0.12)] rounded-[10px] text-xs text-[#0e0f0c] dark:text-[#e8ebe6] focus:outline-none focus:ring-2 focus:ring-[rgba(255,209,26,0.5)]'
const labelCls = 'text-xs text-[#686868] dark:text-[#898989] font-medium block mb-1'

const INTERVAL_OPTIONS = [
  { value: '600', label: 'Setiap 10 Menit' },
  { value: '1800', label: 'Setiap 30 Menit' },
  { value: '3600', label: 'Setiap 1 Jam' },
  { value: '7200', label: 'Setiap 2 Jam' },
  { value: '21600', label: 'Setiap 6 Jam' },
  { value: '43200', label: 'Setiap 12 Jam' },
  { value: '86400', label: 'Setiap 1 Hari' },
  { value: '604800', label: 'Setiap 1 Minggu' },
]

export function DCAEditConfigForm({ sessionId, symbol, currentConfig, onSaved, onCancel, sessionRunning }: DCAEditConfigFormProps) {
  const [intervalSec, setIntervalSec] = useState(String(currentConfig.interval_sec || '3600'))
  const [amount, setAmount] = useState(String(currentConfig.amount || ''))
  const [takeProfitPct, setTakeProfitPct] = useState(String(currentConfig.take_profit_pct || ''))
  const [stopLossPct, setStopLossPct] = useState(String(currentConfig.stop_loss_pct || ''))
  const [dropPct, setDropPct] = useState(String(currentConfig.drop_pct || ''))
  const [maxBuys, setMaxBuys] = useState(String(currentConfig.max_buys || ''))
  const [maxInvested, setMaxInvested] = useState(String(currentConfig.max_invested || ''))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function validate(): string {
    const interval = parseInt(intervalSec)
    const amt = parseFloat(amount)
    if (isNaN(interval) || interval < 60) return 'Interval minimal 60 detik'
    if (isNaN(amt) || amt <= 0) return 'Jumlah harus > 0'
    const tp = parseFloat(takeProfitPct)
    const sl = parseFloat(stopLossPct)
    const dp = parseFloat(dropPct)
    if (takeProfitPct && (isNaN(tp) || tp <= 0 || tp > 1000)) return 'Take Profit harus 0–1000'
    if (stopLossPct && (isNaN(sl) || sl <= 0 || sl >= 100)) return 'Stop Loss harus 0–99.99'
    if (dropPct && (isNaN(dp) || dp <= 0 || dp >= 100)) return 'Drop % harus 0–99.99'
    const mb = parseInt(maxBuys)
    if (maxBuys && (isNaN(mb) || mb < 1)) return 'Max Buys harus >= 1'
    const mi = parseFloat(maxInvested)
    if (maxInvested && (isNaN(mi) || mi <= 0)) return 'Max Invested harus > 0'
    return ''
  }

  async function handleSave() {
    const validErr = validate()
    if (validErr) { setError(validErr); return }
    setSaving(true)
    setError('')
    try {
      const config: Record<string, any> = {
        interval_sec: parseInt(intervalSec),
        amount,
      }
      if (takeProfitPct && parseFloat(takeProfitPct) > 0) config.take_profit_pct = parseFloat(takeProfitPct)
      else config.take_profit_pct = 0
      if (stopLossPct && parseFloat(stopLossPct) > 0) config.stop_loss_pct = parseFloat(stopLossPct)
      else config.stop_loss_pct = 0
      if (dropPct && parseFloat(dropPct) > 0) config.drop_pct = parseFloat(dropPct)
      else config.drop_pct = 0
      if (maxBuys && parseInt(maxBuys) > 0) config.max_buys = parseInt(maxBuys)
      if (maxInvested && parseFloat(maxInvested) > 0) config.max_invested = parseFloat(maxInvested)
      await api.sessions.applyConfig(sessionId, JSON.stringify(config))
      onSaved()
    } catch (e: any) {
      setError(e.message || 'Gagal simpan config')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-[#686868] dark:text-[#898989]">
        Edit konfigurasi DCA untuk {symbol}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Interval Beli</label>
          <select className={inputCls} value={intervalSec} onChange={e => setIntervalSec(e.target.value)}>
            {INTERVAL_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Jumlah (IDR)</label>
          <input className={inputCls} inputMode="numeric" placeholder="50000" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
      </div>

      <p className="text-xs font-semibold text-[#686868] dark:text-[#898989] pt-1">Take Profit / Stop Loss <span className="font-normal">(opsional)</span></p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Take Profit %</label>
          <input className={inputCls} type="number" min="0" max="1000" step="0.1" placeholder="0 = nonaktif" value={takeProfitPct} onChange={e => setTakeProfitPct(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Stop Loss %</label>
          <input className={inputCls} type="number" min="0" max="99.99" step="0.1" placeholder="0 = nonaktif" value={stopLossPct} onChange={e => setStopLossPct(e.target.value)} />
        </div>
      </div>

      <p className="text-xs font-semibold text-[#686868] dark:text-[#898989] pt-1">Fitur Lanjutan <span className="font-normal">(opsional)</span></p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Beli saat turun %</label>
          <input className={inputCls} type="number" min="0" max="99.99" step="0.1" placeholder="0 = nonaktif" value={dropPct} onChange={e => setDropPct(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Maks Pembelian</label>
          <input className={inputCls} type="number" min="0" step="1" placeholder="0 = unlimited" value={maxBuys} onChange={e => setMaxBuys(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Maks Modal (IDR)</label>
          <input className={inputCls} inputMode="numeric" placeholder="0 = unlimited" value={maxInvested} onChange={e => setMaxInvested(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-xs text-[#d03238]">{error}</p>}

      {sessionRunning && (
        <p className="text-xs text-[#686868] dark:text-[#898989]">Hentikan session sebelum mengubah config.</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || sessionRunning}
          className="px-4 py-2 text-sm font-semibold bg-[#ffd11a] text-[#7a5f00] rounded-full hover:bg-[#f5c842] transition-all disabled:opacity-40">
          {saving ? 'Menyimpan...' : 'Simpan'}
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
