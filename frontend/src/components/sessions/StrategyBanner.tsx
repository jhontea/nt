import type { Session } from '@/types'
import { InfoStrip } from './InfoStrip'

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
  return <InfoStrip tone={strategy} text={text} />
}
