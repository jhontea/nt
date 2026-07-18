import type { Session } from '@/types'

const TIPS: Record<'grid' | 'trend' | 'dca', string> = {
  grid: 'Tip: Grid paling cocok untuk pasar sideways (naik-turun). Atur range ±10–20% dari harga saat ini agar order sering terisi.',
  trend: 'Tip: Untuk pair volatile (SOL, ADA) gunakan SMA pendek agar lebih responsif; pair tenang (BTC, ETH) bisa pakai SMA lebih panjang.',
  dca: 'Tip: Semakin sering membeli, rata-rata harga beli makin halus. Cocok untuk pasar volatile agar tidak perlu menebak waktu terbaik.',
}

export function StrategyBanner({ strategy, sessions }: { strategy: 'grid' | 'trend' | 'dca'; sessions: Session[] }) {
  const running = sessions.filter(s => s.status === 'running').length
  const text = running > 0
    ? `${TIPS[strategy]} Saat ini ada ${running} session ${strategy === 'grid' ? 'Grid' : strategy === 'trend' ? 'Trend' : 'DCA'} yang sedang berjalan — pantau lewat tombol detail.`
    : TIPS[strategy]
  return (
    <details className="group mb-4 rounded-[12px] border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] bg-white/60 dark:bg-[#1e201c]/60">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-[#686868] dark:text-[#a5a8a2] flex items-center justify-between gap-3">
        <span>Panduan & tip {strategy === 'grid' ? 'Grid' : strategy === 'trend' ? 'Trend' : 'DCA'}</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-45 text-base leading-none">+</span>
      </summary>
      <div className="px-4 pb-3 text-xs leading-relaxed text-[#686868] dark:text-[#a5a8a2]">{text}</div>
    </details>
  )
}
