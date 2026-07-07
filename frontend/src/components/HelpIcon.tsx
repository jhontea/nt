export function HelpIcon({ text }: { text: string }) {
  return (
    <span className="group relative inline-block ml-1">
      <span className="cursor-help text-[#5a5b58] hover:text-[#2a2b27] text-xs border border-[rgba(14,15,12,0.2)] rounded-full w-4 h-4 inline-flex items-center justify-center">?</span>
      <span className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#0e0f0c] text-[#e8ebe6] text-xs rounded-[10px] w-56 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {text}
      </span>
    </span>
  )
}
