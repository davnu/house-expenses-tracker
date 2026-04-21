import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HouseEntitlement } from '@/types/entitlement'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

// ── Mocks ──
interface EntState {
  entitlement: HouseEntitlement | null
  isPro: boolean
  isLoading: boolean
}

type CreateHouseReason = 'first' | 'hasProHouse' | 'needsUpgrade' | 'loading'

const {
  entRef,
  houseRef,
  userRef,
  openMock,
  openCreateDialogMock,
  startCheckoutMock,
  createHouseRef,
  CheckoutNotConfiguredErr,
} = vi.hoisted(() => ({
  entRef: { current: { entitlement: null, isPro: false, isLoading: false } as EntState },
  houseRef: {
    current: { id: 'h1', name: 'Casa Verde', ownerId: 'alice' } as
      | { id: string; name: string; ownerId: string }
      | null,
  },
  userRef: { current: { uid: 'alice' } as { uid: string } | null },
  openMock: vi.fn(),
  openCreateDialogMock: vi.fn(),
  startCheckoutMock: vi.fn(),
  createHouseRef: {
    current: {
      reason: 'hasProHouse' as CreateHouseReason,
      ownedCount: 1,
    },
  },
  CheckoutNotConfiguredErr: class CheckoutNotConfigured extends Error {
    constructor() { super('Checkout is not yet configured'); this.name = 'CheckoutNotConfigured' }
  },
}))

vi.mock('@/hooks/use-entitlement', () => ({
  useEntitlement: () => ({
    entitlement: entRef.current.entitlement,
    limits: {} as never,
    isPro: entRef.current.isPro,
    isLoading: entRef.current.isLoading,
  }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: userRef.current }),
}))

vi.mock('@/context/CreateHouseContext', () => ({
  useCreateHouse: () => ({
    reason: createHouseRef.current.reason,
    ownedCount: createHouseRef.current.ownedCount,
    openCreateDialog: openCreateDialogMock,
  }),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({ house: houseRef.current }),
}))

vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({ isOpen: false, gate: null, open: openMock, close: vi.fn() }),
}))

vi.mock('@/lib/billing', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing')>('@/lib/billing')
  return {
    ...actual,
    startCheckout: startCheckoutMock,
    CheckoutNotConfigured: CheckoutNotConfiguredErr,
  }
})

import { BillingSection } from './BillingSection'

function setReason(reason: CreateHouseReason, ownedCount = 1) {
  createHouseRef.current = { reason, ownedCount }
}

beforeEach(() => {
  entRef.current = { entitlement: null, isPro: false, isLoading: false }
  houseRef.current = { id: 'h1', name: 'Casa Verde', ownerId: 'alice' }
  userRef.current = { uid: 'alice' }
  openMock.mockClear()
  openCreateDialogMock.mockClear()
  startCheckoutMock.mockClear()
  // Default: Pro user viewing their own Pro house.
  setReason('hasProHouse', 1)
})

afterEach(cleanup)

// ── Tests ──

describe('BillingSection', () => {
  it('renders nothing while loading (avoid free/pro flash)', () => {
    entRef.current = { entitlement: null, isPro: false, isLoading: true }
    const { container } = render(<BillingSection />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing without an active house', () => {
    houseRef.current = null
    const { container } = render(<BillingSection />)
    expect(container.textContent).toBe('')
  })

  it('renders the card title "Your plan & houses" (renamed to signal the card owns house-creation actions too)', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-02-15T00:00:00.000Z' },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    // Regression guard — the old title was just "Your plan". shadcn's
    // CardTitle renders as a <div>, so we can't query by role='heading';
    // test on the literal title text instead.
    expect(screen.getByText('Your plan & houses')).toBeTruthy()
  })

  it('shows "Houses on your plan: N" inventory framing when the user owns ≥1 house', () => {
    setReason('hasProHouse', 2)
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    render(<BillingSection />)
    expect(screen.getByText(/2 houses on your plan/i)).toBeTruthy()
  })

  it('hides the inventory line when ownedCount is 0 (avoids "0 houses" reading as a broken state)', () => {
    setReason('first', 0)
    render(<BillingSection />)
    expect(screen.queryByText(/houses on your plan/i)).toBeNull()
  })

  it('free tier (owner): shows Free badge, free-tier feature bullets and an unlock CTA', () => {
    setReason('needsUpgrade', 1)
    render(<BillingSection />)
    expect(screen.getByText(/tracking on your own/i)).toBeTruthy()
    expect(screen.getByText(/Unlimited expenses/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Unlock Pro for €49/i })).toBeTruthy()
  })

  it('free tier: also shows the "Pro unlocks" comparison panel', () => {
    setReason('needsUpgrade', 1)
    render(<BillingSection />)
    expect(screen.getByText(/Pro unlocks/i)).toBeTruthy()
    expect(screen.getByText(/Invite your partner or co-buyers/i)).toBeTruthy()
    expect(screen.getByText(/Advanced mortgage/i)).toBeTruthy()
  })

  it('free tier CTA opens the upgrade modal with the generic gate and default (pro) product', async () => {
    setReason('needsUpgrade', 1)
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Unlock Pro for €49/i }))
    expect(openMock).toHaveBeenCalledWith('generic')
  })

  it('pro tier: shows Pro badge, purchase date and the "Add another house" button', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-02-15T00:00:00.000Z', polarOrderId: 'ord_abc123' },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    expect(screen.getAllByText(/Pro/).length).toBeGreaterThan(0)
    expect(screen.getByText(/2026/)).toBeTruthy()
    expect(screen.getByText('ord_abc123')).toBeTruthy()
    // The button carries the accessible name via aria-label. €29 is the only
    // price shown — no struck-through reference price (EU/UCPD rules on fake
    // anchor prices; see comment in src/lib/billing.ts::PRICES).
    const btn = screen.getByRole('button', { name: /Add another house.*€29/i })
    expect(btn).toBeTruthy()
  })

  it('pro tier: the add-another-house button does NOT render a strikethrough anchor price', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-02-15T00:00:00.000Z' },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    // Regression guard: a prior design struck €49 next to €29 to imply a
    // discount. That's an anchor-price pattern DE/FR consumer protection law
    // treats as misleading (€49 was never the additional_house price). The
    // button must not include an <s> element, and its aria-label must not
    // reference a "regular" or "previous" price.
    expect(document.querySelector('s')).toBeNull()
    const btn = screen.getByRole('button', { name: /Add another house/i })
    const ariaLabel = btn.getAttribute('aria-label') ?? ''
    expect(ariaLabel).not.toMatch(/€49|regular|habitual|regulär|normale/i)
  })

  it('pro tier: the add-another-house button is the PRIMARY variant (only CTA in the row)', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-02-15T00:00:00.000Z' },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    const btn = screen.getByRole('button', {
      name: /Add another house.*€29/i,
    }) as HTMLButtonElement
    // shadcn's default variant renders with bg-primary. Pin the class so a
    // future visual regression (ever-so-slightly downgraded styling) is
    // caught in CI.
    expect(btn.className).toMatch(/bg-primary/)
  })

  it('pro tier: clicking "Add another house" expands the INLINE form (no UpgradeModal opens)', async () => {
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    // Expanded state → name input + Continue button visible.
    expect(screen.getByLabelText(/Name your new house/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Continue to checkout/i })).toBeTruthy()
    // Upgrade modal was NOT opened — the point of the inline flow is to skip it.
    expect(openMock).not.toHaveBeenCalled()
  })

  it('pro tier: expanded form autofocuses the name input (user clicked → wants to type)', async () => {
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText(/Name your new house/i))
    })
  })

  it('pro tier: inline form CTA is disabled until the user types a name', async () => {
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    const cta = screen.getByRole('button', { name: /Continue to checkout/i }) as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    await user.type(screen.getByLabelText(/Name your new house/i), 'Second home')
    expect(cta.disabled).toBe(false)
  })

  it('pro tier: whitespace-only name keeps the CTA disabled (server would reject anyway)', async () => {
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    await user.type(screen.getByLabelText(/Name your new house/i), '     ')
    const cta = screen.getByRole('button', { name: /Continue to checkout/i }) as HTMLButtonElement
    expect(cta.disabled).toBe(true)
  })

  it('pro tier: submitting the inline form calls startCheckout with the trimmed name + additional_house product', async () => {
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    startCheckoutMock.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    await user.type(screen.getByLabelText(/Name your new house/i), '  Lisbon apartment  ')
    await user.click(screen.getByRole('button', { name: /Continue to checkout/i }))
    expect(startCheckoutMock).toHaveBeenCalledWith('h1', 'additional_house', 'create_house', {
      newHouseName: 'Lisbon apartment',
    })
  })

  it('pro tier: collapsing the inline form clears the typed name (no stale state on re-expand)', async () => {
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    await user.type(screen.getByLabelText(/Name your new house/i), 'Draft name')
    // Collapse via the close icon (aria-labelled with the generic cancel string)
    await user.click(screen.getAllByRole('button', { name: /Cancel/i })[0])
    // Re-expand — input should be empty.
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    const input = screen.getByLabelText(/Name your new house/i) as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('pro tier: inline form surfaces the "checkout coming soon" banner when startCheckout throws CheckoutNotConfigured', async () => {
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    startCheckoutMock.mockRejectedValueOnce(new CheckoutNotConfiguredErr())
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    await user.type(screen.getByLabelText(/Name your new house/i), 'Second home')
    await user.click(screen.getByRole('button', { name: /Continue to checkout/i }))
    await waitFor(() => {
      expect(screen.getByText(/Checkout is being set up/i)).toBeTruthy()
    })
  })

  it('pro tier: inline form surfaces generic error messages verbatim on failure', async () => {
    entRef.current = { entitlement: { tier: 'pro' }, isPro: true, isLoading: false }
    startCheckoutMock.mockRejectedValueOnce(new Error('Network down'))
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house/i }))
    await user.type(screen.getByLabelText(/Name your new house/i), 'Second home')
    await user.click(screen.getByRole('button', { name: /Continue to checkout/i }))
    await waitFor(() => {
      expect(screen.getByText(/Network down/i)).toBeTruthy()
    })
  })

  it('pro tier: shows the "no subscription" reassurance note', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-02-15T00:00:00.000Z' },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    expect(screen.getByText(/one-time purchase/i)).toBeTruthy()
  })

  it('pro tier does NOT show the free-tier upgrade CTA', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-02-15T00:00:00.000Z' },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    expect(screen.queryByRole('button', { name: /Unlock Pro for €49/i })).toBeNull()
  })

  it('revoked entitlement (refund/chargeback): shows an amber notice with the revocation date', () => {
    setReason('needsUpgrade', 1)
    entRef.current = {
      entitlement: {
        tier: 'free',
        revokedAt: '2026-03-01T00:00:00.000Z',
        revokedReason: 'order.refunded',
      },
      isPro: false,
      isLoading: false,
    }
    render(<BillingSection />)
    expect(screen.getByText(/Pro was revoked for this house/i)).toBeTruthy()
    expect(screen.getByText(/2026/)).toBeTruthy()
    expect(screen.getByText(/reach out/i)).toBeTruthy()
  })

  it('pro + grandfathered: surfaces "Founding member" as the source', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-01-01T00:00:00.000Z', grandfathered: true },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    expect(screen.getByText(/Founding member/i)).toBeTruthy()
  })

  it('pro with no order id hides the order field (no broken empty label)', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-01-01T00:00:00.000Z', grandfathered: true },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    expect(screen.queryByText(/^Order$/)).toBeNull()
  })

  // ── Create-new-house routing — branch coverage ────────────────────

  it('reason="first" (member-only user owning 0 houses): shows "Create New House" and routes to the FREE dialog', async () => {
    setReason('first', 0)
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Create New House/i }))
    expect(openCreateDialogMock).toHaveBeenCalledTimes(1)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('reason="needsUpgrade": HIDES the inline add-another form (main Upgrade CTA is the path)', () => {
    setReason('needsUpgrade', 1)
    render(<BillingSection />)
    expect(screen.getByRole('button', { name: /Unlock Pro for €49/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add another house/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Create New House/i })).toBeNull()
  })

  it('reason="loading": renders a skeleton PLACEHOLDER (reserves space, no layout shift)', () => {
    setReason('loading', 1)
    render(<BillingSection />)
    // No functional buttons render yet, but the space is reserved so the
    // card doesn't jump when the subscription resolves.
    expect(screen.queryByRole('button', { name: /Create New House/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add another house/i })).toBeNull()
    // The skeleton is aria-hidden — pin its animation class as a regression
    // guard for the layout-shift fix.
    const skeleton = document.querySelector('[aria-hidden="true"].animate-pulse')
    expect(skeleton).toBeTruthy()
  })

  // ── Cross-product: isPro × reason × ownership ─────────────────────

  it('!isPro + non-owner (member-only viewing someone else\'s free house): HIDES Upgrade CTA (nonsensical for non-owners)', () => {
    // This user was shown "Unlock Pro for €49" before the ownership gate —
    // clicking it would produce a server permission-denied since they can't
    // upgrade a house they don't own. Now the button isn't even rendered.
    houseRef.current = { id: 'h1', name: 'Bob\'s House', ownerId: 'bob' }
    userRef.current = { uid: 'alice' }
    setReason('first', 0)
    render(<BillingSection />)
    expect(screen.queryByRole('button', { name: /Unlock Pro for €49/i })).toBeNull()
    // But the free create-house affordance remains — they can make their first owned house.
    expect(screen.getByRole('button', { name: /Create New House/i })).toBeTruthy()
  })

  it('!isPro + non-owner + hasProHouse: shows ONLY the add-another CTA (no duplicate price signals)', () => {
    // Pro user viewing a free house they joined. The regression this pins:
    // previously BOTH "Unlock Pro for €49" AND "Add another house (€29)"
    // showed here — conflicting price signals. The ownership gate now
    // hides the first, leaving only the coherent €29 action.
    houseRef.current = { id: 'h1', name: 'Bob\'s House', ownerId: 'bob' }
    userRef.current = { uid: 'alice' }
    setReason('hasProHouse', 1)
    render(<BillingSection />)
    expect(screen.queryByRole('button', { name: /Unlock Pro for €49/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Add another house.*€29/i })).toBeTruthy()
  })

  it('!isPro + owner + hasProHouse: shows BOTH Upgrade-for-€49 (this house) AND Add-another-€29 (new house)', () => {
    // Legitimate: user owns this free house AND owns another Pro house
    // elsewhere. Both buttons make sense — upgrade this one for €49, OR
    // add a brand-new third house for €29. Two distinct intents.
    houseRef.current = { id: 'h1', name: 'My free house', ownerId: 'alice' }
    userRef.current = { uid: 'alice' }
    setReason('hasProHouse', 2) // owner of 2 houses, one is Pro
    render(<BillingSection />)
    expect(screen.getByRole('button', { name: /Unlock Pro for €49/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add another house.*€29/i })).toBeTruthy()
  })

  it('!isPro + owner + hasProHouse: add-another button uses OUTLINE style (Upgrade is primary in this row)', () => {
    houseRef.current = { id: 'h1', name: 'My free house', ownerId: 'alice' }
    userRef.current = { uid: 'alice' }
    setReason('hasProHouse', 2)
    render(<BillingSection />)
    const addBtn = screen.getByRole('button', { name: /Add another house.*€29/i }) as HTMLButtonElement
    // When Upgrade is visible, add-another steps down to outline so the
    // primary Upgrade CTA remains visually dominant.
    expect(addBtn.className).not.toMatch(/bg-primary(?!\/)/)
  })

  it('isPro + first (Pro user who then left their only house, now owns 0): shows "Create New House"', () => {
    // Rare but possible: Pro user whose active house was deleted. Owned=0
    // now, but they still might own another house that went Pro. Easiest
    // visual check — the free affordance doesn't vanish just because
    // isPro flipped somehow.
    entRef.current = { entitlement: null, isPro: true, isLoading: false }
    setReason('first', 0)
    render(<BillingSection />)
    expect(screen.getByRole('button', { name: /Create New House/i })).toBeTruthy()
  })

  it('no signed-in user: hides Upgrade CTA (defensive — ownership check can\'t resolve)', () => {
    userRef.current = null
    setReason('needsUpgrade', 1)
    render(<BillingSection />)
    expect(screen.queryByRole('button', { name: /Unlock Pro for €49/i })).toBeNull()
  })
})
