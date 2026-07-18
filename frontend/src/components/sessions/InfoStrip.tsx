import type { ReactNode } from 'react'
import { HelpIcon } from '@/components/HelpIcon'

type Tone = 'grid' | 'trend' | 'dca' | 'neutral'

const TONE: Record<Tone, { bar: string; icon: string; bg: string }> = {
  grid: { bar: 'border-l-[#9fe870]', icon: 'text-[#163300] dark:text-[#9fe870]', bg: 'bg-[rgba(159,232,112,0.05)] dark:bg-[rgba(159,232,112,0.06)]' },
  trend: { bar: 'border-l-[#38c8ff]', icon: 'text-[#0994b3] dark:text-[#5dd8f5]', bg: 'bg-[rgba(56,200,255,0.05)] dark:bg-[rgba(56,200,255,0.07)]' },
  dca: { bar: 'border-l-[#ffd11a]', icon: 'text-[#7a5f00] dark:text-[#f5c842]', bg: 'bg-[rgba(255,209,26,0.05)] dark:bg-[rgba(255,209,26,0.07)]' },
  neutral: { bar: 'border-l-[#9fe870]', icon: 'text-[#163300] dark:text-[#9fe870]', bg: 'bg-[rgba(159,232,112,0.05)] dark:bg-[rgba(159,232,112,0.06)]' },
}

export function InfoStrip({ tone = 'neutral', icon, text, help }: {
  tone?: Tone
  icon?: ReactNode
  text: string
  help?: string
}) {
  const t = TONE[tone]
  return (
    <div className={`flex items-start gap-2 rounded-r-[12px] border-l-4 ${t.bar} ${t.bg} px-4 py-2.5 mb-4`}>
      {icon && <span className={`mt-0.5 flex-shrink-0 ${t.icon}`}>{icon}</span>}
      <p className="text-sm text-[#686868] dark:text-[#898989] leading-relaxed">
        {text}
        {help && <HelpIcon text={help} />}
      </p>
    </div>
  )
}
