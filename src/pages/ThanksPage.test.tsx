import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const {
  trackMock,
  authCallbackRef,
  profileCallbackRef,
  entitlementCallbackRef,
  updateDocMock,
  reconcileOrderMock,
} = vi.hoisted(() => ({
  trackMock: vi.fn(),
  authCallbackRef: { current: null as ((user: { uid: string } | null) => void) | null },
  profileCallbackRef: { current: null as ((snap: { data: () => { houseId?: string } | undefined }) => void) | null },
  entitlementCallbackRef: { current: null as ((snap: { exists: () => boolean; data: () => { tier?: string } | undefined }) => void) | null },
  updateDocMock: vi.fn(),
  reconcileOrderMock: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  track: trackMock,
  isAppRoute: (p: string) => p.startsWith('/app'),
}))

vi.mock('@/data/firebase', () => ({
  auth: {},
  db: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallbackRef.current = cb
    return () => {
      authCallbackRef.current = null
    }
  },
}))

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  onSnapshot: (
    ref: { path: string },
    onNext: (snap: { exists: () => boolean; data: () => Record<string, unknown> | undefined }) => void,
  ) => {
    if (ref.path.startsWith('users/')) {
      profileCallbackRef.current = onNext as typeof profileCallbackRef.current
    } else if (ref.path.includes('meta/entitlement')) {
      entitlementCallbackRef.current = onNext as typeof entitlementCallbackRef.current
    }
    return () => {
      if (ref.path.startsWith('users/')) profileCallbackRef.current = null
      else entitlementCallbackRef.current = null
    }
  },
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}))

vi.mock('@/lib/billing', () => ({
  reconcileOrder: reconcileOrderMock,
}))

import { ThanksPage } from './ThanksPage'

beforeEach(() => {
  trackMock.mockReset()
  authCallbackRef.current = null
  profileCallbackRef.current = null
  entitlementCallbackRef.current = null
  updateDocMock.mockReset()
  reconcileOrderMock.mockReset()
})
afterEach(cleanup)

describe('ThanksPage', () => {
  it('fires the `upgrade_completed` analytics event on mount (public route)', () => {
    render(<MemoryRouter><ThanksPage /></MemoryRouter>)
    expect(trackMock).toHaveBeenCalledWith('upgrade_completed')
  })

  it('shows the waiting state initially (before entitlement confirms)', () => {
    render(<MemoryRouter><ThanksPage /></MemoryRouter>)
    expect(screen.getByText(/Confirming your purchase/i)).toBeTruthy()
  })

  it('transitions to the welcome-to-Pro celebration once the entitlement doc confirms tier=pro', () => {
    render(<MemoryRouter><ThanksPage /></MemoryRouter>)
    act(() => {
      authCallbackRef.current?.({ uid: 'user-1' })
      profileCallbackRef.current?.({ data: () => ({ houseId: 'house-1' }) })
      entitlementCallbackRef.current?.({ exists: () => true, data: () => ({ tier: 'pro' }) })
    })
    expect(screen.getByText(/Welcome to Pro/i)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Back to your house/i })
    // No gate in URL → fallback to the invite deep-link (most users paid to invite a partner).
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/app?onboard=invite')
  })

  it('routes advanced-mortgage purchasers straight to the mortgage page', () => {
    render(<MemoryRouter initialEntries={['/thanks?gate=advanced_mortgage']}><ThanksPage /></MemoryRouter>)
    act(() => {
      authCallbackRef.current?.({ uid: 'user-1' })
      profileCallbackRef.current?.({ data: () => ({ houseId: 'house-1' }) })
      entitlementCallbackRef.current?.({ exists: () => true, data: () => ({ tier: 'pro' }) })
    })
    const link = screen.getByRole('link', { name: /Back to your house/i })
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/app/mortgage')
  })

  it('routes storage-gate purchasers to the documents page', () => {
    render(<MemoryRouter initialEntries={['/thanks?gate=storage']}><ThanksPage /></MemoryRouter>)
    act(() => {
      authCallbackRef.current?.({ uid: 'user-1' })
      profileCallbackRef.current?.({ data: () => ({ houseId: 'house-1' }) })
      entitlementCallbackRef.current?.({ exists: () => true, data: () => ({ tier: 'pro' }) })
    })
    const link = screen.getByRole('link', { name: /Back to your house/i })
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/app/documents')
  })

  it('falls back to the invite deep-link for unknown/malformed gate values', () => {
    render(<MemoryRouter initialEntries={['/thanks?gate=not_a_real_gate']}><ThanksPage /></MemoryRouter>)
    act(() => {
      authCallbackRef.current?.({ uid: 'user-1' })
      profileCallbackRef.current?.({ data: () => ({ houseId: 'house-1' }) })
      entitlementCallbackRef.current?.({ exists: () => true, data: () => ({ tier: 'pro' }) })
    })
    const link = screen.getByRole('link', { name: /Back to your house/i })
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/app?onboard=invite')
  })

  it('lists the next-step recommendations once Pro is confirmed', () => {
    render(<MemoryRouter><ThanksPage /></MemoryRouter>)
    act(() => {
      authCallbackRef.current?.({ uid: 'user-1' })
      profileCallbackRef.current?.({ data: () => ({ houseId: 'house-1' }) })
      entitlementCallbackRef.current?.({ exists: () => true, data: () => ({ tier: 'pro' }) })
    })
    expect(screen.getByText(/Invite your partner/i)).toBeTruthy()
    expect(screen.getByText(/mortgage page/i)).toBeTruthy()
    expect(screen.getByText(/Documents/i)).toBeTruthy()
  })

  it('falls back to the pending state with a contact link if entitlement never confirms within ~3s', () => {
    vi.useFakeTimers()
    try {
      render(<MemoryRouter><ThanksPage /></MemoryRouter>)
      act(() => {
        authCallbackRef.current?.({ uid: 'user-1' })
        profileCallbackRef.current?.({ data: () => ({ houseId: 'house-1' }) })
        // Entitlement exists but free tier — not pro yet.
        entitlementCallbackRef.current?.({ exists: () => true, data: () => ({ tier: 'free' }) })
      })
      act(() => {
        vi.advanceTimersByTime(3100)
      })
      expect(screen.getByText(/Almost there/i)).toBeTruthy()
      const mailto = screen.getByRole('link', { name: /Contact us/i })
      expect((mailto as HTMLAnchorElement).getAttribute('href')).toContain('mailto:')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not flip to pending if entitlement confirms Pro before the timeout', () => {
    vi.useFakeTimers()
    try {
      render(<MemoryRouter><ThanksPage /></MemoryRouter>)
      act(() => {
        authCallbackRef.current?.({ uid: 'user-1' })
        profileCallbackRef.current?.({ data: () => ({ houseId: 'house-1' }) })
        entitlementCallbackRef.current?.({ exists: () => true, data: () => ({ tier: 'pro' }) })
      })
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.queryByText(/Finalising/i)).toBeNull()
      expect(screen.getByText(/Welcome to Pro/i)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  // ── additional_house flow ─────────────────────────────────────────
  //
  // For product=additional_house the webhook provisions a brand-new house
  // (not the paying house). /thanks can't watch the active house's
  // entitlement — that's the paying house, already Pro, which would flip
  // the page to 'confirmed' on the WRONG house. Instead, /thanks calls
  // `reconcileOrder({ mode: 'additional_house' })`, switches the active
  // house to the returned id, and lands the user inside the new house.

  it('for product=additional_house, does NOT subscribe to the paying house entitlement', async () => {
    reconcileOrderMock.mockResolvedValueOnce({
      status: 'reconciled',
      houseId: 'house-new',
    })
    render(<MemoryRouter initialEntries={['/thanks?product=additional_house']}><ThanksPage /></MemoryRouter>)
    await act(async () => {
      authCallbackRef.current?.({ uid: 'user-1' })
      await Promise.resolve()
    })
    // The paying-house entitlement path must stay dormant — callback never
    // gets wired up for additional_house, so this ref stays null.
    expect(entitlementCallbackRef.current).toBeNull()
  })

  it('for product=additional_house, calls reconcileOrder with mode="additional_house"', async () => {
    reconcileOrderMock.mockResolvedValueOnce({
      status: 'reconciled',
      houseId: 'house-new',
    })
    render(<MemoryRouter initialEntries={['/thanks?product=additional_house']}><ThanksPage /></MemoryRouter>)
    await act(async () => {
      authCallbackRef.current?.({ uid: 'user-1' })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(reconcileOrderMock).toHaveBeenCalledWith({ mode: 'additional_house' })
  })

  it('for product=additional_house with a resolved houseId, switches the active house to it', async () => {
    reconcileOrderMock.mockResolvedValueOnce({
      status: 'reconciled',
      houseId: 'house-new',
    })
    render(<MemoryRouter initialEntries={['/thanks?product=additional_house']}><ThanksPage /></MemoryRouter>)
    await act(async () => {
      authCallbackRef.current?.({ uid: 'user-1' })
      await Promise.resolve()
      await Promise.resolve()
    })
    // Active-house switch — the CTA then drops the user into the new house.
    expect(updateDocMock).toHaveBeenCalled()
    const lastCall = updateDocMock.mock.calls[updateDocMock.mock.calls.length - 1]
    expect(lastCall[0]).toMatchObject({ path: 'users/user-1' })
    expect(lastCall[1]).toEqual({ houseId: 'house-new' })
  })

  it('for product=additional_house with already-pro + houseId (webhook raced us), still switches + confirms', async () => {
    reconcileOrderMock.mockResolvedValueOnce({
      status: 'already-pro',
      houseId: 'house-existing',
    })
    render(<MemoryRouter initialEntries={['/thanks?product=additional_house']}><ThanksPage /></MemoryRouter>)
    await act(async () => {
      authCallbackRef.current?.({ uid: 'user-1' })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(/Welcome to Pro/i)).toBeTruthy()
  })

  it('for product=additional_house, retries reconcileOrder on no-order (handles Polar orders-list eventual consistency)', async () => {
    // Simulate the realistic race: first call returns no-order (Polar
    // hasn't surfaced the just-created order yet), second call returns
    // reconciled. The retry loop must pick it up without the user
    // touching anything.
    reconcileOrderMock
      .mockResolvedValueOnce({ status: 'no-order' })
      .mockResolvedValueOnce({ status: 'reconciled', houseId: 'house-new' })
    vi.useFakeTimers()
    try {
      render(<MemoryRouter initialEntries={['/thanks?product=additional_house']}><ThanksPage /></MemoryRouter>)
      await act(async () => {
        authCallbackRef.current?.({ uid: 'user-1' })
        await Promise.resolve()
      })
      // Advance past the first backoff (500ms).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      // Second attempt succeeds → updateDoc + confirmed state.
      expect(reconcileOrderMock).toHaveBeenCalledTimes(2)
      expect(updateDocMock).toHaveBeenCalled()
      const lastCall = updateDocMock.mock.calls[updateDocMock.mock.calls.length - 1]
      expect(lastCall[1]).toEqual({ houseId: 'house-new' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('for product=additional_house, swallows errors and retries (so a transient network blip does not dead-end the user)', async () => {
    reconcileOrderMock
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({ status: 'reconciled', houseId: 'house-after-retry' })
    vi.useFakeTimers()
    try {
      render(<MemoryRouter initialEntries={['/thanks?product=additional_house']}><ThanksPage /></MemoryRouter>)
      await act(async () => {
        authCallbackRef.current?.({ uid: 'user-1' })
        await Promise.resolve()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(reconcileOrderMock).toHaveBeenCalledTimes(2)
      const lastCall = updateDocMock.mock.calls[updateDocMock.mock.calls.length - 1]
      expect(lastCall[1]).toEqual({ houseId: 'house-after-retry' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('for product=additional_house, flips to pending when all reconcile retries are exhausted (user can contact us)', async () => {
    reconcileOrderMock.mockResolvedValue({ status: 'no-order' })
    vi.useFakeTimers()
    try {
      render(<MemoryRouter initialEntries={['/thanks?product=additional_house']}><ThanksPage /></MemoryRouter>)
      await act(async () => {
        authCallbackRef.current?.({ uid: 'user-1' })
        await Promise.resolve()
      })
      // Advance through all 4 retries (0, 500, 1500, 3500 ms). Add some
      // headroom to flush any trailing microtasks.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })
      expect(reconcileOrderMock).toHaveBeenCalledTimes(4)
      // No houseId ever resolved → no active-house switch.
      expect(updateDocMock).not.toHaveBeenCalled()
      // The pending UI is the escape hatch — a mailto link appears.
      const mailto = screen.getByRole('link', { name: /Contact us/i })
      expect((mailto as HTMLAnchorElement).getAttribute('href')).toContain('mailto:')
    } finally {
      vi.useRealTimers()
    }
  })

  it('for product=additional_house, a mid-flight unmount does NOT write the active-house afterwards (cleanup correctness)', async () => {
    // Slow reconcile response: page unmounts before the promise resolves.
    // The cancel flag must prevent the late resolution from calling
    // updateDoc (which would mutate the user's active house while they're
    // already somewhere else in the app).
    let resolveReconcile: (value: { status: string; houseId: string }) => void = () => {}
    const reconcilePromise = new Promise<{ status: string; houseId: string }>((r) => {
      resolveReconcile = r
    })
    reconcileOrderMock.mockReturnValueOnce(reconcilePromise)

    const { unmount } = render(<MemoryRouter initialEntries={['/thanks?product=additional_house']}><ThanksPage /></MemoryRouter>)
    await act(async () => {
      authCallbackRef.current?.({ uid: 'user-1' })
      await Promise.resolve()
    })
    // Unmount while the call is still in flight.
    unmount()
    // Now resolve what the in-flight call would have returned.
    resolveReconcile({ status: 'reconciled', houseId: 'house-late' })
    await Promise.resolve()
    await Promise.resolve()
    // The late resolution must not have triggered any active-house write.
    expect(updateDocMock).not.toHaveBeenCalled()
  })
})
