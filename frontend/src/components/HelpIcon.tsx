import { useState } from 'react'

export function HelpIcon({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-block ml-1">
      <span
        className="cursor-help text-[#5a5b58] dark:text-[#8a8d88] hover:text-[#2a2b27] dark:hover:text-[#d0d3ce] text-xs border border-[rgba(14,15,12,0.2)] dark:border-[rgba(232,235,230,0.2)] rounded-full w-4 h-4 inline-flex items-center justify-center select-none"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        role="button"
        aria-label="Help"
      >?</span>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#0e0f0c] dark:bg-[#e8ebe6] text-[#e8ebe6] dark:text-[#0e0f0c] text-xs rounded-[10px] w-max max-w-[min(224px,80vw)] shadow-lg whitespace-pre-wrap pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}
