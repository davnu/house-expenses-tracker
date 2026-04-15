import { useState } from 'react'
import { Info } from 'lucide-react'

interface InfoTooltipProps {
  text: string
  position?: 'top' | 'bottom'
}

export function InfoTooltip({ text, position = 'top' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        position === 'top' ? (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-56 rounded-md bg-foreground text-background text-xs p-2 leading-relaxed shadow-lg">
            {text}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
          </span>
        ) : (
          <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 w-56 rounded-md bg-foreground text-background text-xs p-2 leading-relaxed shadow-lg">
            {text}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-foreground" />
          </span>
        )
      )}
    </span>
  )
}
