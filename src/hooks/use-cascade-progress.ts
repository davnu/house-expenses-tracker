import { useState, useCallback } from 'react'
import type { LucideIcon } from 'lucide-react'

export type StepStatus = 'pending' | 'active' | 'completed'

export interface CascadeStep {
  id: string
  label: string
  icon: LucideIcon
}

export type CascadeProgressCallback = (
  stepId: string,
  status: 'active' | 'completed',
) => void

export function useCascadeProgress(steps: CascadeStep[]) {
  const [stepStates, setStepStates] = useState<Record<string, StepStatus>>(() => {
    const initial: Record<string, StepStatus> = {}
    for (const step of steps) initial[step.id] = 'pending'
    return initial
  })

  const onProgress: CascadeProgressCallback = useCallback(
    (stepId, status) => {
      setStepStates((prev) => {
        if (!(stepId in prev)) return prev
        return { ...prev, [stepId]: status }
      })
    },
    [],
  )

  const completedCount = steps.filter((s) => stepStates[s.id] === 'completed').length
  const hasActive = steps.some((s) => stepStates[s.id] === 'active')
  const total = steps.length

  // Completed steps get full credit, active step gets half credit
  const overallPercent =
    total === 0
      ? 0
      : Math.round(((completedCount + (hasActive ? 0.5 : 0)) / total) * 100)

  const isComplete = completedCount === total

  const reset = useCallback(() => {
    setStepStates(() => {
      const fresh: Record<string, StepStatus> = {}
      for (const step of steps) fresh[step.id] = 'pending'
      return fresh
    })
  }, [steps])

  return { stepStates, overallPercent, onProgress, isComplete, reset }
}
