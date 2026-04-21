import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

// ── Firestore + Household mocks ──
type SnapshotCallback = (snap: { exists: () => boolean; data: () => unknown }) => void
type SnapshotErrorCallback = (err: Error) => void

const { houseRef, onSnapshotMock, onSnapshotUnsub } = vi.hoisted(() => ({
  houseRef: { current: { id: 'h1' } as { id: string } | null },
  onSnapshotMock: vi.fn(),
  onSnapshotUnsub: vi.fn(),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({ house: houseRef.current }),
}))

vi.mock('@/data/firebase', () => ({ db: {}, app: {} }))

vi.mock('firebase/firestore', () => ({
  doc: (...parts: unknown[]) => ({ __path: parts.slice(1).join('/') }),
  onSnapshot: (_ref: unknown, onNext: SnapshotCallback, onError?: SnapshotErrorCallback) => {
    onSnapshotMock(onNext, onError)
    return onSnapshotUnsub
  },
}))

import { EntitlementProvider, useEntitlementContext } from './EntitlementContext'
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/entitlement-limits'

function emit(data: unknown | null) {
  const [onNext] = onSnapshotMock.mock.calls[onSnapshotMock.mock.calls.length - 1] ?? []
  if (!onNext) throw new Error('No onSnapshot subscribed')
  ;(onNext as SnapshotCallback)({ exists: () => data !== null, data: () => data })
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <EntitlementProvider>{children}</EntitlementProvider>
)

beforeEach(() => {
  houseRef.current = { id: 'h1' }
  onSnapshotMock.mockClear()
  onSnapshotUnsub.mockClear()
})

afterEach(() => {
  houseRef.current = null
})

describe('EntitlementProvider', () => {
  it('subscribes once per active house and shares state across the tree', () => {
    // Render a small tree with multiple consumers — all get the same context.
    function Consumer({ id }: { id: string }) {
      const ctx = useEntitlementContext()
      return <div data-testid={id}>{ctx?.isPro ? 'pro' : 'free'}</div>
    }
    const { getByTestId } = render(
      <EntitlementProvider>
        <Consumer id="a" />
        <Consumer id="b" />
        <Consumer id="c" />
      </EntitlementProvider>
    )
    // Only ONE subscription despite three consumers — the core perf win.
    expect(onSnapshotMock).toHaveBeenCalledTimes(1)

    act(() => emit({ tier: 'pro' }))
    // All three consumers flip simultaneously via the single context update.
    expect(getByTestId('a').textContent).toBe('pro')
    expect(getByTestId('b').textContent).toBe('pro')
    expect(getByTestId('c').textContent).toBe('pro')
  })

  it('returns null from useEntitlementContext outside the provider (safe default)', () => {
    const { result } = renderHook(() => useEntitlementContext())
    expect(result.current).toBeNull()
  })

  it('starts in loading state and defaults to free limits until first snapshot', () => {
    const { result } = renderHook(() => useEntitlementContext(), { wrapper })
    expect(result.current?.isLoading).toBe(true)
    // While loading, limits fall back to FREE so Pro features don't leak briefly
    expect(result.current?.limits).toEqual(FREE_LIMITS)
    expect(result.current?.isPro).toBe(false)
  })

  it('transitions to Pro limits on a pro snapshot', async () => {
    const { result } = renderHook(() => useEntitlementContext(), { wrapper })
    act(() => emit({ tier: 'pro' }))
    await waitFor(() => expect(result.current?.isPro).toBe(true))
    expect(result.current?.limits).toEqual(PRO_LIMITS)
  })

  it('falls back to free on a Firestore error', async () => {
    const { result } = renderHook(() => useEntitlementContext(), { wrapper })
    const call = onSnapshotMock.mock.calls[0]
    const onError = call?.[1] as SnapshotErrorCallback
    act(() => onError(new Error('permission-denied')))
    await waitFor(() => expect(result.current?.isLoading).toBe(false))
    expect(result.current?.isPro).toBe(false)
    expect(result.current?.entitlement).toBe(null)
  })

  it('re-subscribes when the active house changes', () => {
    const { rerender } = renderHook(() => useEntitlementContext(), { wrapper })
    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
    houseRef.current = { id: 'h2' }
    rerender()
    expect(onSnapshotUnsub).toHaveBeenCalledTimes(1)
    expect(onSnapshotMock).toHaveBeenCalledTimes(2)
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useEntitlementContext(), { wrapper })
    unmount()
    expect(onSnapshotUnsub).toHaveBeenCalledTimes(1)
  })

  it('no house → no subscription, no loading spinner stuck forever', () => {
    houseRef.current = null
    const { result } = renderHook(() => useEntitlementContext(), { wrapper })
    expect(onSnapshotMock).not.toHaveBeenCalled()
    expect(result.current?.isLoading).toBe(false)
  })
})
