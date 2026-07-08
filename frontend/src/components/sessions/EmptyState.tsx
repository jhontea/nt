import type { ReactNode } from 'react'

export function EmptyState({ icon, title, description, actionLabel, onAction }: {
  icon?: ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="text-center py-16">
      {icon && (
        <div className="w-14 h-14 rounded-[24px] bg-[rgba(159,232,112,0.1)] dark:bg-[rgba(159,232,112,0.08)] flex items-center justify-center mx-auto mb-4 text-[#163300] dark:text-[#9fe870]">
          {icon}
        </div>
      )}
      <p className="text-[#0e0f0c] dark:text-[#e8ebe6] text-lg font-bold">{title}</p>
      <p className="text-[#686868] dark:text-[#898989] text-sm mt-1 max-w-sm mx-auto leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-5 py-2.5 bg-[#9fe870] text-[#163300] font-bold rounded-full hover:bg-[#cdffad] hover:scale-[1.02] active:scale-[0.98] transition-all text-sm shadow-[0_2px_8px_rgba(159,232,112,0.4)]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
