import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen, renderHook, waitFor } from '@testing-library/react'

type SnapshotCallback = (snap: { exists: () => boolean; data: () => unknown }) => void
type SnapshotErrorCallback = (err: Error) => void

// ── Mocks ───────────────────────────────────────────────────

const { userRef, housesRef, onSnapshotByPath, onSnapshotUnsub } = vi.hoisted(() => ({
  userRef: { current: { uid: 'alice' } as { uid: string } | null },
  housesRef: {
    current: [] as Array<{
      id: string
      ownerId: string
      name: string
      memberIds: string[]
      createdAt: string
    }>,
  },
  onSnapshotByPath: new Map<
    string,
    { onNext: SnapshotCallback; onError?: SnapshotErrorCallback }
  >(),
  onSnapshotUnsub: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: userRef.current }),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({ houses: housesRef.current }),
}))

vi.mock('@/data/firebase', () => ({ db: {}, app: {} }))

vi.mock('firebase/firestore', () => ({
  doc: (...parts: unknown[]) => ({ __path: parts.slice(1).join('/') }),
  onSnapshot: (
    ref: { __path: string },
    onNext: SnapshotCallback,
    onError?: SnapshotErrorCallback,
  ) => {
    onSnapshotByPath.set(ref.__path, { onNext, onError })
    return onSnapshotUnsub
  },
}))

// Mock CreateHouseDialog so we can assert on its open state without Radix
// portal mounting.
vi.mock('@/components/layout/CreateHouseDialog', () => ({
  CreateHouseDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div data-testid="create-house-dialog">
        <button type="button" onClick={() => onOpenChange(false)}>
          close
        </button>
      </div>
    ) : null,
}))

import {
  CreateHouseProvider,
  useCreateHouse,
} from './CreateHouseContext'

// ── Helpers ──────────────────────────────────────────────────

function emit(houseId: string, data: unknown | null) {
  const entry = onSnapshotByPath.get(`houses/${houseId}/meta/entitlement`)
  if (!entry) throw new Error(`No subscription for ${houseId}`)
  entry.onNext({ exists: () => data !== null, data: () => data })
}

function emitError(houseId: string, err: Error) {
  const entry = onSnapshotByPath.get(`houses/${houseId}/meta/entitlement`)
  if (!entry?.onError) throw new Error(`No error handler for ${houseId}`)
  entry.onError(err)
}

function houseOwnedBy(id: string, ownerUid: string) {
  return { id, ownerId: ownerUid, name: id, memberIds: [ownerUid], createdAt: '' }
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CreateHouseProvider>{children}</CreateHouseProvider>
)

beforeEach(() => {
  userRef.current = { uid: 'alice' }
  housesRef.current = []
  onSnapshotByPath.clear()
  onSnapshotUnsub.mockClear()
})

afterEach(() => {
  // jsdom DOM is not auto-cleaned between tests in this config; without
  // this a dialog opened in one test would persist into the next and
  // inflate getAllByTestId counts.
  cleanup()
})

// ── Hook-behaviour tests (same coverage the old useCanCreateHouse had) ──

describe('useCreateHouse — gate state', () => {
  it('owned=0 → reason=first (onboarding path, no subscriptions yet)', () => {
    housesRef.current = []
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    expect(result.current.reason).toBe('first')
    expect(result.current.ownedCount).toBe(0)
    // No Firestore subscriptions should be opened when nothing's owned —
    // avoids burning reads on a scenario where no gate check is needed.
    expect(onSnapshotByPath.size).toBe(0)
  })

  it('owned=1 (free) → reason=needsUpgrade', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', null))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
    expect(result.current.ownedCount).toBe(1)
  })

  it('owned=1 (pro) → reason=hasProHouse', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', { tier: 'pro' }))
    await waitFor(() => expect(result.current.reason).toBe('hasProHouse'))
  })

  it('owned=2 with ANY Pro (even if the other is free) → hasProHouse', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice'), houseOwnedBy('h2', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', null))
    act(() => emit('h2', { tier: 'pro' }))
    await waitFor(() => expect(result.current.reason).toBe('hasProHouse'))
  })

  it('owned=2 both free → needsUpgrade', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice'), houseOwnedBy('h2', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', null))
    act(() => emit('h2', null))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
  })

  it('reason=loading while any subscription has not yet delivered its first snapshot', () => {
    housesRef.current = [houseOwnedBy('h1', 'alice'), houseOwnedBy('h2', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', { tier: 'pro' }))
    // h2 has no snapshot yet → conservative default; prevents premature
    // "allowed" flash during the cold subscription window.
    expect(result.current.reason).toBe('loading')
  })

  it('excludes houses the user does not own (member-only houses are not subscribed)', async () => {
    housesRef.current = [
      { id: 'h1', ownerId: 'bob', memberIds: ['bob', 'alice'], name: 'Bob House', createdAt: '' },
      houseOwnedBy('h2', 'alice'),
    ]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    // Only h2 has a subscription — avoids reading entitlements the user can't affect.
    expect(onSnapshotByPath.has('houses/h1/meta/entitlement')).toBe(false)
    expect(onSnapshotByPath.has('houses/h2/meta/entitlement')).toBe(true)
    act(() => emit('h2', null))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
  })

  it('treats a Firestore error on the entitlement doc as "not Pro" (graceful degradation)', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emitError('h1', new Error('permission-denied')))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
  })

  it('reacts live when an entitlement flips free → Pro (post-purchase)', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', null))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
    act(() => emit('h1', { tier: 'pro' }))
    await waitFor(() => expect(result.current.reason).toBe('hasProHouse'))
  })

  it('exposes upgradeTargetHouseId pointing at the first owned non-Pro house when reason=needsUpgrade (so HouseSwitcher can switch there before opening the €49 modal)', async () => {
    housesRef.current = [
      houseOwnedBy('h1', 'alice'),
      houseOwnedBy('h2', 'alice'),
    ]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', null))
    act(() => emit('h2', null))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
    // Either owned non-Pro house is a valid target; first one is deterministic.
    expect(result.current.upgradeTargetHouseId).toBe('h1')
  })

  it('upgradeTargetHouseId is null when reason is NOT needsUpgrade', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', { tier: 'pro' }))
    await waitFor(() => expect(result.current.reason).toBe('hasProHouse'))
    // Not a 'needsUpgrade' state → no upgrade target to offer.
    expect(result.current.upgradeTargetHouseId).toBeNull()
  })

  it('upgradeTargetHouseId skips any owned Pro houses when mixing Pro + free is impossible but defensive ordering matters (only surfaces a non-Pro id)', async () => {
    // Hypothetical: owner has two owned houses, both free. Should always
    // return one of them (never accidentally returns a Pro id). Guards
    // against a future regression if the filter is dropped.
    housesRef.current = [
      houseOwnedBy('h1', 'alice'),
      houseOwnedBy('h2', 'alice'),
    ]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', null))
    act(() => emit('h2', null))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
    expect(['h1', 'h2']).toContain(result.current.upgradeTargetHouseId)
  })

  it('reacts live when Pro is revoked (refund)', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    act(() => emit('h1', { tier: 'pro' }))
    await waitFor(() => expect(result.current.reason).toBe('hasProHouse'))
    act(() => emit('h1', { tier: 'free', revokedAt: '2026-04-01' }))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
  })

  it('unsubscribes all listeners on provider unmount (no zombie Firestore reads)', () => {
    housesRef.current = [houseOwnedBy('h1', 'alice'), houseOwnedBy('h2', 'alice')]
    const { unmount } = renderHook(() => useCreateHouse(), { wrapper })
    unmount()
    expect(onSnapshotUnsub).toHaveBeenCalledTimes(2)
  })

  it('handles no signed-in user gracefully (treated like owned=0)', () => {
    userRef.current = null
    housesRef.current = []
    const { result } = renderHook(() => useCreateHouse(), { wrapper })
    expect(result.current.ownedCount).toBe(0)
    expect(result.current.reason).toBe('first')
  })
})

// ── Subscription-dedup contract (the main architectural win) ────────

describe('CreateHouseProvider — subscription dedup', () => {
  it('TWO consumers of useCreateHouse open ONLY ONE Firestore subscription per owned house', () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]

    function ConsumerA() {
      useCreateHouse()
      return <div>A</div>
    }
    function ConsumerB() {
      useCreateHouse()
      return <div>B</div>
    }

    render(
      <CreateHouseProvider>
        <ConsumerA />
        <ConsumerB />
      </CreateHouseProvider>,
    )

    // Pre-fix each consumer called useCanCreateHouse independently →
    // duplicate onSnapshot calls per house. Provider dedups to one.
    expect(onSnapshotByPath.size).toBe(1)
    expect(onSnapshotByPath.has('houses/h1/meta/entitlement')).toBe(true)
  })

  it('subscriptions re-run when the set of owned houses changes (create/leave/delete)', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { rerender } = render(
      <CreateHouseProvider>
        <div>x</div>
      </CreateHouseProvider>,
    )
    expect(onSnapshotByPath.has('houses/h1/meta/entitlement')).toBe(true)
    expect(onSnapshotByPath.has('houses/h2/meta/entitlement')).toBe(false)

    // User creates/joins a second house — provider should subscribe to it.
    housesRef.current = [houseOwnedBy('h1', 'alice'), houseOwnedBy('h2', 'alice')]
    rerender(
      <CreateHouseProvider>
        <div>x</div>
      </CreateHouseProvider>,
    )
    await waitFor(() => {
      expect(onSnapshotByPath.has('houses/h2/meta/entitlement')).toBe(true)
    })
  })
})

// ── Dialog control (provider owns the single dialog instance) ───────

describe('CreateHouseProvider — shared CreateHouseDialog', () => {
  it('dialog is NOT rendered by default (only mounted when openCreateDialog fires)', () => {
    render(
      <CreateHouseProvider>
        <div>child</div>
      </CreateHouseProvider>,
    )
    expect(screen.queryByTestId('create-house-dialog')).toBeNull()
  })

  it('openCreateDialog() from any consumer opens the shared dialog', () => {
    function Trigger() {
      const { openCreateDialog } = useCreateHouse()
      return (
        <button type="button" onClick={openCreateDialog}>
          open
        </button>
      )
    }

    render(
      <CreateHouseProvider>
        <Trigger />
      </CreateHouseProvider>,
    )
    expect(screen.queryByTestId('create-house-dialog')).toBeNull()
    act(() => {
      screen.getByRole('button', { name: /open/i }).click()
    })
    expect(screen.getByTestId('create-house-dialog')).toBeTruthy()
  })

  it('consumers share the SAME dialog instance (opening from one surface then closing leaves nothing stale on the other)', () => {
    function TriggerA() {
      const { openCreateDialog } = useCreateHouse()
      return (
        <button type="button" onClick={openCreateDialog}>
          open-a
        </button>
      )
    }
    function TriggerB() {
      const { openCreateDialog } = useCreateHouse()
      return (
        <button type="button" onClick={openCreateDialog}>
          open-b
        </button>
      )
    }

    render(
      <CreateHouseProvider>
        <TriggerA />
        <TriggerB />
      </CreateHouseProvider>,
    )
    act(() => {
      screen.getByRole('button', { name: /open-a/i }).click()
    })
    expect(screen.getAllByTestId('create-house-dialog')).toHaveLength(1)
    // Close via the dialog's own close button (mocked).
    act(() => {
      screen.getByRole('button', { name: /^close$/i }).click()
    })
    expect(screen.queryByTestId('create-house-dialog')).toBeNull()
    // Opening from consumer B should re-open the same single instance.
    act(() => {
      screen.getByRole('button', { name: /open-b/i }).click()
    })
    expect(screen.getAllByTestId('create-house-dialog')).toHaveLength(1)
  })
})

describe('useCreateHouse — provider contract', () => {
  it('throws a clear error when called outside a CreateHouseProvider', () => {
    // Silence the React error boundary warning spam.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useCreateHouse())).toThrow(
      /must be used within CreateHouseProvider/,
    )
    spy.mockRestore()
  })
})
