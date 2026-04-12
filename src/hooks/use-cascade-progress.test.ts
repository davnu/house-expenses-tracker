import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Home, Paperclip, Users } from 'lucide-react'
import { useCascadeProgress, type CascadeStep } from './use-cascade-progress'

const STEPS: CascadeStep[] = [
  { id: 'a', label: 'Step A', icon: Paperclip },
  { id: 'b', label: 'Step B', icon: Users },
  { id: 'c', label: 'Step C', icon: Home },
]

describe('useCascadeProgress', () => {
  it('initializes all steps as pending with 0% progress', () => {
    const { result } = renderHook(() => useCascadeProgress(STEPS))

    expect(result.current.stepStates).toEqual({ a: 'pending', b: 'pending', c: 'pending' })
    expect(result.current.overallPercent).toBe(0)
    expect(result.current.isComplete).toBe(false)
  })

  it('marks a step as active with partial percent', () => {
    const { result } = renderHook(() => useCascadeProgress(STEPS))

    act(() => result.current.onProgress('a', 'active'))

    expect(result.current.stepStates.a).toBe('active')
    // 0 completed + 0.5 active out of 3 = ~17%
    expect(result.current.overallPercent).toBe(17)
    expect(result.current.isComplete).toBe(false)
  })

  it('marks a step as completed and advances percent', () => {
    const { result } = renderHook(() => useCascadeProgress(STEPS))

    act(() => result.current.onProgress('a', 'active'))
    act(() => result.current.onProgress('a', 'completed'))

    expect(result.current.stepStates.a).toBe('completed')
    // 1 completed out of 3 = 33%
    expect(result.current.overallPercent).toBe(33)
    expect(result.current.isComplete).toBe(false)
  })

  it('progresses through all steps to 100%', () => {
    const { result } = renderHook(() => useCascadeProgress(STEPS))

    for (const step of STEPS) {
      act(() => result.current.onProgress(step.id, 'active'))
      act(() => result.current.onProgress(step.id, 'completed'))
    }

    expect(result.current.overallPercent).toBe(100)
    expect(result.current.isComplete).toBe(true)
    expect(result.current.stepStates).toEqual({ a: 'completed', b: 'completed', c: 'completed' })
  })

  it('gives half credit to active step alongside completed steps', () => {
    const { result } = renderHook(() => useCascadeProgress(STEPS))

    act(() => result.current.onProgress('a', 'completed'))
    act(() => result.current.onProgress('b', 'active'))

    // 1 completed + 0.5 active out of 3 = 50%
    expect(result.current.overallPercent).toBe(50)
  })

  it('ignores unknown step IDs', () => {
    const { result } = renderHook(() => useCascadeProgress(STEPS))
    const before = { ...result.current.stepStates }

    act(() => result.current.onProgress('unknown', 'active'))

    expect(result.current.stepStates).toEqual(before)
  })

  it('resets all state', () => {
    const { result } = renderHook(() => useCascadeProgress(STEPS))

    act(() => result.current.onProgress('a', 'completed'))
    act(() => result.current.onProgress('b', 'active'))
    act(() => result.current.reset())

    expect(result.current.stepStates).toEqual({ a: 'pending', b: 'pending', c: 'pending' })
    expect(result.current.overallPercent).toBe(0)
    expect(result.current.isComplete).toBe(false)
  })
})
