import { Home, Loader2, Check } from 'lucide-react'
import { ProgressRing } from '@/components/ui/progress-ring'
import { cn } from '@/lib/utils'
import type { CascadeStep, StepStatus } from '@/hooks/use-cascade-progress'

interface CascadeProgressProps {
  steps: CascadeStep[]
  stepStates: Record<string, StepStatus>
  overallPercent: number
  title?: string
  /** 'house-delete' shows a Home icon that fades away as progress increases */
  variant?: 'default' | 'house-delete'
}

export function CascadeProgress({
  steps,
  stepStates,
  overallPercent,
  title,
  variant = 'default',
}: CascadeProgressProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Progress ring */}
      <ProgressRing
        percent={overallPercent}
        size={100}
        strokeWidth={7}
        color="var(--color-destructive)"
      >
        {variant === 'house-delete' ? (
          <Home
            className="h-7 w-7 text-muted-foreground transition-all duration-500 ease-out"
            style={{
              opacity: Math.max(0, 1 - overallPercent / 100),
              transform: `scale(${Math.max(0.3, 1 - overallPercent / 200)})`,
            }}
          />
        ) : (
          <span className="text-sm font-bold">{overallPercent}%</span>
        )}
      </ProgressRing>

      {/* Title */}
      {title && (
        <p className="text-sm font-medium text-foreground">{title}</p>
      )}

      {/* Step list */}
      <div className="w-full max-w-xs space-y-0.5">
        {steps.map((step) => {
          const status = stepStates[step.id] ?? 'pending'
          return (
            <StepRow key={step.id} step={step} status={status} />
          )
        })}
      </div>
    </div>
  )
}

function StepRow({ step, status }: { step: CascadeStep; status: StepStatus }) {
  const Icon = step.icon

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Status icon */}
      <div className="flex items-center justify-center w-5 h-5 shrink-0">
        {status === 'completed' && (
          <Check className="h-4 w-4 text-[#2a9d90] animate-[step-complete_0.3s_ease-out]" />
        )}
        {status === 'active' && (
          <Loader2 className="h-4 w-4 text-destructive animate-spin" />
        )}
        {status === 'pending' && (
          <Icon className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>

      {/* Label */}
      <span
        className={cn(
          'text-sm transition-colors duration-300',
          status === 'active' && 'font-medium text-foreground',
          status === 'completed' && 'text-muted-foreground line-through',
          status === 'pending' && 'text-muted-foreground/60',
        )}
      >
        {step.label}
      </span>
    </div>
  )
}
