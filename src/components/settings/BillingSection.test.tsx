import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

const { entRef, houseRef, openMock } = vi.hoisted(() => ({
  entRef: { current: { entitlement: null, isPro: false, isLoading: false } as EntState },
  houseRef: { current: { id: 'h1', name: 'Casa Verde' } as { id: string; name: string } | null },
  openMock: vi.fn(),
}))

vi.mock('@/hooks/use-entitlement', () => ({
  useEntitlement: () => ({
    entitlement: entRef.current.entitlement,
    limits: {} as never,
    isPro: entRef.current.isPro,
    isLoading: entRef.current.isLoading,
  }),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({ house: houseRef.current }),
}))

vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({ isOpen: false, gate: null, open: openMock, close: vi.fn() }),
}))

import { BillingSection } from './BillingSection'

beforeEach(() => {
  entRef.current = { entitlement: null, isPro: false, isLoading: false }
  houseRef.current = { id: 'h1', name: 'Casa Verde' }
  openMock.mockClear()
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

  it('free tier: shows Free badge, free-tier feature bullets and an unlock CTA', () => {
    render(<BillingSection />)
    // The free-tier subtitle appears uniquely in the Card description.
    // Both the subtitle and the comparison-panel header now contain "Free plan",
    // so we assert on the more anchored phrase.
    expect(screen.getByText(/tracking on your own/i)).toBeTruthy()
    // Free-tier feature bullets — stable keys that won't churn with copy edits
    expect(screen.getByText(/Unlimited expenses/i)).toBeTruthy()
    // Primary CTA unlocks
    expect(screen.getByRole('button', { name: /Unlock Pro for €49/i })).toBeTruthy()
  })

  it('free tier: also shows the "Pro unlocks" comparison panel so users can evaluate before upgrading', () => {
    render(<BillingSection />)
    // Pro comparison panel header
    expect(screen.getByText(/Pro unlocks/i)).toBeTruthy()
    // At least a couple of headline Pro features
    expect(screen.getByText(/Invite your partner or co-buyers/i)).toBeTruthy()
    expect(screen.getByText(/Advanced mortgage/i)).toBeTruthy()
  })

  it('free tier CTA opens the upgrade modal with the generic gate and default (pro) product', async () => {
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Unlock Pro for €49/i }))
    // Called with just the gate — product defaults to 'pro' in the context
    expect(openMock).toHaveBeenCalledWith('generic')
  })

  it('pro tier: shows Pro badge, purchase date and the "buy additional house" button', () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-02-15T00:00:00.000Z', polarOrderId: 'ord_abc123' },
      isPro: true,
      isLoading: false,
    }
    render(<BillingSection />)
    expect(screen.getAllByText(/Pro/).length).toBeGreaterThan(0)
    // Purchase date is formatted — assert the year shows
    expect(screen.getByText(/2026/)).toBeTruthy()
    expect(screen.getByText('ord_abc123')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add another house \(€29\)/i })).toBeTruthy()
  })

  it('pro tier: "Add another house" button opens the modal with product="additional_house" (regression for critical audit bug #1)', async () => {
    entRef.current = {
      entitlement: { tier: 'pro', purchasedAt: '2026-02-15T00:00:00.000Z' },
      isPro: true,
      isLoading: false,
    }
    const user = userEvent.setup()
    render(<BillingSection />)
    await user.click(screen.getByRole('button', { name: /Add another house \(€29\)/i }))
    // The CRITICAL bug was: clicking this opened the modal with default product 'pro',
    // which would've charged €49 for already-Pro houses. Now it explicitly routes to 'additional_house'.
    expect(openMock).toHaveBeenCalledWith('generic', { product: 'additional_house' })
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
    // Helpful "contact us" copy so the user knows what to do if it's wrong
    expect(screen.getByText(/reach out/i)).toBeTruthy()
  })

  it('pro + grandfathered: surfaces "Founding member" as the source', () => {
    entRef.current = {
      entitlement: {
        tier: 'pro',
        purchasedAt: '2026-01-01T00:00:00.000Z',
        grandfathered: true,
      },
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
    // The "Order" dt label should not appear when there's no polarOrderId
    expect(screen.queryByText(/^Order$/)).toBeNull()
  })
})
