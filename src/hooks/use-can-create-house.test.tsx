import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

type SnapshotCallback = (snap: { exists: () => boolean; data: () => unknown }) => void
type SnapshotErrorCallback = (err: Error) => void

// ── Mocks ───────────────────────────────────────────────────

const { userRef, housesRef, onSnapshotByPath, onSnapshotUnsub } = vi.hoisted(() => ({
  userRef: { current: { uid: 'alice' } as { uid: string } | null },
  housesRef: {
    current: [] as Array<{ id: string; ownerId: string; name: string; memberIds: string[]; createdAt: string }>,
  },
  // Keyed by entitlement doc path so each house's subscription can be driven independently.
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

import { useCanCreateHouse } from './use-can-create-house'

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

beforeEach(() => {
  userRef.current = { uid: 'alice' }
  housesRef.current = []
  onSnapshotByPath.clear()
  onSnapshotUnsub.mockClear()
})

// ── Tests ────────────────────────────────────────────────────

describe('useCanCreateHouse', () => {
  it('owned=0 → always allowed (first-house onboarding path)', () => {
    housesRef.current = []
    const { result } = renderHook(() => useCanCreateHouse())
    expect(result.current.canCreate).toBe(true)
    expect(result.current.reason).toBe('first')
    expect(result.current.ownedCount).toBe(0)
  })

  it('owned=1 (free) → blocked with reason needsUpgrade', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCanCreateHouse())
    act(() => emit('h1', null)) // entitlement doc does not exist → free
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
    expect(result.current.canCreate).toBe(false)
    expect(result.current.ownedCount).toBe(1)
  })

  it('owned=1 (pro) → allowed with reason hasProHouse', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCanCreateHouse())
    act(() => emit('h1', { tier: 'pro' }))
    await waitFor(() => expect(result.current.reason).toBe('hasProHouse'))
    expect(result.current.canCreate).toBe(true)
  })

  it('owned=2 with one Pro (even if the other is free) → allowed', async () => {
    housesRef.current = [
      houseOwnedBy('h1', 'alice'),
      houseOwnedBy('h2', 'alice'),
    ]
    const { result } = renderHook(() => useCanCreateHouse())
    act(() => emit('h1', null))
    act(() => emit('h2', { tier: 'pro' }))
    await waitFor(() => expect(result.current.canCreate).toBe(true))
    expect(result.current.reason).toBe('hasProHouse')
  })

  it('owned=2 both free → blocked', async () => {
    housesRef.current = [
      houseOwnedBy('h1', 'alice'),
      houseOwnedBy('h2', 'alice'),
    ]
    const { result } = renderHook(() => useCanCreateHouse())
    act(() => emit('h1', null))
    act(() => emit('h2', null))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
    expect(result.current.canCreate).toBe(false)
  })

  it('loading (not all snapshots arrived yet) → blocked with reason loading', () => {
    housesRef.current = [
      houseOwnedBy('h1', 'alice'),
      houseOwnedBy('h2', 'alice'),
    ]
    const { result } = renderHook(() => useCanCreateHouse())
    // Only emit for h1, leave h2 hanging
    act(() => emit('h1', { tier: 'pro' }))
    // Even though h1 is Pro, we don't flip to canCreate=true until everything has loaded
    // — conservative default to prevent a flash of "allowed" during the cold subscription window.
    expect(result.current.reason).toBe('loading')
    expect(result.current.canCreate).toBe(false)
  })

  it('excludes houses the user does not own (member-only houses)', async () => {
    // Alice is a member of h1 but owner of h2. The gate only considers owned houses.
    housesRef.current = [
      { id: 'h1', ownerId: 'bob', memberIds: ['bob', 'alice'], name: 'Bob House', createdAt: '' },
      houseOwnedBy('h2', 'alice'),
    ]
    const { result } = renderHook(() => useCanCreateHouse())
    // Only h2 should have a subscription — h1 is not owned by alice.
    expect(onSnapshotByPath.has('houses/h1/meta/entitlement')).toBe(false)
    expect(onSnapshotByPath.has('houses/h2/meta/entitlement')).toBe(true)
    act(() => emit('h2', null))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
  })

  it('treats a Firestore error on the entitlement doc as "not Pro" (graceful degradation)', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCanCreateHouse())
    act(() => emitError('h1', new Error('permission-denied')))
    await waitFor(() => expect(result.current.reason).toBe('needsUpgrade'))
    expect(result.current.canCreate).toBe(false)
  })

  it('reacts live when an entitlement flips free → Pro (post-purchase)', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCanCreateHouse())
    act(() => emit('h1', null))
    await waitFor(() => expect(result.current.canCreate).toBe(false))
    // Webhook writes Pro → onSnapshot pushes the update
    act(() => emit('h1', { tier: 'pro' }))
    await waitFor(() => expect(result.current.canCreate).toBe(true))
  })

  it('reacts live when Pro is revoked (refund)', async () => {
    housesRef.current = [houseOwnedBy('h1', 'alice')]
    const { result } = renderHook(() => useCanCreateHouse())
    act(() => emit('h1', { tier: 'pro' }))
    await waitFor(() => expect(result.current.canCreate).toBe(true))
    // Refund flips tier back to free
    act(() => emit('h1', { tier: 'free', revokedAt: '2026-04-01' }))
    await waitFor(() => expect(result.current.canCreate).toBe(false))
  })

  it('unsubscribes all listeners on unmount', () => {
    housesRef.current = [
      houseOwnedBy('h1', 'alice'),
      houseOwnedBy('h2', 'alice'),
    ]
    const { unmount } = renderHook(() => useCanCreateHouse())
    unmount()
    expect(onSnapshotUnsub).toHaveBeenCalledTimes(2)
  })

  it('handles no signed-in user gracefully', () => {
    userRef.current = null
    housesRef.current = []
    const { result } = renderHook(() => useCanCreateHouse())
    // Treated like owned=0 → allowed, but in practice the UI gates auth first.
    expect(result.current.ownedCount).toBe(0)
    expect(result.current.canCreate).toBe(true)
  })
})
