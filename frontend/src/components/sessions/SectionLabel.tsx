import type { ReactNode } from 'react'

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-[#686868] dark:text-[#898989] mb-3">
      {children}
    </h2>
  )
}
