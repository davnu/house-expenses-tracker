import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton({ icon: Icon, label, className, ...props }, ref) {
    return (
      <Button
        ref={ref}
        variant="outline"
        size="sm"
        className={cn('h-10 w-10 px-0 sm:h-8 sm:w-auto sm:px-3', className)}
        {...props}
      >
        <Icon className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">{label}</span>
      </Button>
    )
  }
)
