import type { ReactNode } from 'react'

export function EmptyState({ icon, title, description, actionLabel, onAction, tone = 'grid' }: {
  icon?: ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  tone?: 'grid' | 'trend' | 'dca'
}) {
  const styles = {
    grid: { icon: 'bg-[rgba(159,232,112,0.1)] dark:bg-[rgba(159,232,112,0.08)] text-[#163300] dark:text-[#9fe870]', button: 'bg-[#9fe870] text-[#163300] hover:bg-[#cdffad] shadow-[0_2px_8px_rgba(159,232,112,0.4)]' },
    trend: { icon: 'bg-[rgba(56,200,255,0.1)] dark:bg-[rgba(56,200,255,0.08)] text-[#0994b3] dark:text-[#5dd8f5]', button: 'bg-[#38c8ff] text-[#003344] hover:bg-[#7de5ff] shadow-[0_2px_8px_rgba(56,200,255,0.35)]' },
    dca: { icon: 'bg-[rgba(255,209,26,0.1)] dark:bg-[rgba(255,209,26,0.08)] text-[#7a5f00] dark:text-[#f5c842]', button: 'bg-[#ffd11a] text-[#3d2f00] hover:bg-[#ffe566] shadow-[0_2px_8px_rgba(255,209,26,0.35)]' },
  }[tone]
  return (
    <div className="text-center py-12">
      {icon && (
        <div className={`w-14 h-14 rounded-[24px] flex items-center justify-center mx-auto mb-4 ${styles.icon}`}>
          {icon}
        </div>
      )}
      <p className="text-[#0e0f0c] dark:text-[#e8ebe6] text-lg font-bold">{title}</p>
      <p className="text-[#686868] dark:text-[#898989] text-sm mt-1 max-w-sm mx-auto leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={`mt-4 px-5 py-2.5 font-bold rounded-full hover:scale-[1.02] active:scale-[0.98] transition-all text-sm ${styles.button}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
