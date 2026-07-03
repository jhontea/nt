export function HelpIcon({ text }: { text: string }) {
  return (
    <span className="group relative inline-block ml-1">
      <span className="cursor-help text-gray-500 hover:text-gray-300 text-xs border border-gray-600 rounded-full w-4 h-4 inline-flex items-center justify-center">?</span>
      <span className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-gray-200 text-xs rounded-lg w-56 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {text}
      </span>
    </span>
  )
}
