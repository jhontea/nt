'use client'
import { useRouter } from 'next/navigation'
import { Grid2x2, TrendingUp, Coins } from 'lucide-react'

const TABS = [
  { key: 'grid' as const, label: 'Grid', icon: <Grid2x2 size={16} />, active: 'bg-[rgba(159,232,112,0.15)] text-[#163300] dark:text-[#9fe870] shadow-[0_1px_4px_rgba(159,232,112,0.25)]' },
  { key: 'trend' as const, label: 'Trend', icon: <TrendingUp size={16} />, active: 'bg-[rgba(56,200,255,0.15)] text-[#0994b3] dark:text-[#5dd8f5] shadow-[0_1px_4px_rgba(56,200,255,0.25)]' },
  { key: 'dca' as const, label: 'DCA', icon: <Coins size={16} />, active: 'bg-[rgba(255,209,26,0.15)] text-[#7a5f00] dark:text-[#f5c842] shadow-[0_1px_4px_rgba(255,209,26,0.25)]' },
]

export function StrategyTabs({ active }: { active: 'grid' | 'trend' | 'dca' }) {
  const router = useRouter()
  return (
    <div className="flex gap-1 p-1 bg-[#f0f1ee] dark:bg-[#252822] rounded-full border border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)] mb-6 w-fit max-w-full overflow-x-auto">
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => router.push(`/sessions/${t.key}`)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition whitespace-nowrap ${
            t.key === active ? t.active : 'text-[#686868] dark:text-[#898989] hover:text-[#0e0f0c] dark:hover:text-[#e8ebe6] hover:bg-white dark:hover:bg-[#1e201c]'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}
