import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

// ── Mocks ──
const { entitlementRef, houseRef, openMock } = vi.hoisted(() => ({
  entitlementRef: { current: { isPro: false, isLoading: false } },
  houseRef: { current: { id: 'h1', name: 'Casa Verde' } as { id: string; name: string } | null },
  openMock: vi.fn(),
}))

vi.mock('@/hooks/use-entitlement', () => ({
  useEntitlement: () => ({
    entitlement: entitlementRef.current.isPro ? { tier: 'pro' } : null,
    limits: {} as never,
    isPro: entitlementRef.current.isPro,
    isLoading: entitlementRef.current.isLoading,
  }),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({ house: houseRef.current }),
}))

vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({ isOpen: false, gate: null, open: openMock, close: vi.fn() }),
}))

import { UpgradeBanner } from './UpgradeBanner'

beforeEach(() => {
  localStorage.clear()
  entitlementRef.current = { isPro: false, isLoading: false }
  houseRef.current = { id: 'h1', name: 'Casa Verde' }
  openMock.mockClear()
})

afterEach(cleanup)

// ── Tests ──

describe('UpgradeBanner', () => {
  it('renders the banner for a free-tier house with an unlock CTA', () => {
    render(<UpgradeBanner />)
    expect(screen.getByText(/Get more out of CasaTab/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /See what's in Pro/i })).toBeTruthy()
  })

  it('renders nothing while entitlement is loading (avoid upsell flicker on refresh)', () => {
    entitlementRef.current = { isPro: false, isLoading: true }
    const { container } = render(<UpgradeBanner />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing when the house is already Pro', () => {
    entitlementRef.current = { isPro: true, isLoading: false }
    const { container } = render(<UpgradeBanner />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing when there is no active house', () => {
    houseRef.current = null
    const { container } = render(<UpgradeBanner />)
    expect(container.textContent).toBe('')
  })

  it('clicking the CTA opens the upgrade modal with the generic gate', async () => {
    const user = userEvent.setup()
    render(<UpgradeBanner />)
    await user.click(screen.getByRole('button', { name: /See what's in Pro/i }))
    expect(openMock).toHaveBeenCalledWith('generic')
  })

  it('dismiss button hides the banner and persists dismissal to localStorage per-house', async () => {
    const user = userEvent.setup()
    const { container } = render(<UpgradeBanner />)

    await user.click(screen.getByLabelText(/close/i))

    expect(container.textContent).toBe('')
    // Dismissal is stored in the consolidated JSON map (see banner-dismissal.ts)
    const raw = localStorage.getItem('billing:banner-dismissed:v1')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string) as Record<string, string>
    expect(parsed.h1).toBeDefined()
  })

  it('persists dismissal across a full remount (simulates page refresh)', () => {
    // Seed the new map-format with a recent timestamp for h1
    localStorage.setItem(
      'billing:banner-dismissed:v1',
      JSON.stringify({ h1: new Date().toISOString() })
    )
    const { container } = render(<UpgradeBanner />)
    expect(container.textContent).toBe('')
  })

  it('migrates legacy per-house localStorage keys (back-compat with previous release)', () => {
    // Previous format: one key per house with value '1'
    localStorage.setItem('billing:banner-dismissed:h1', '1')
    const { container } = render(<UpgradeBanner />)
    // Dismissal from legacy key is honoured
    expect(container.textContent).toBe('')
    // Legacy key has been migrated and cleaned up
    expect(localStorage.getItem('billing:banner-dismissed:h1')).toBeNull()
  })

  it('dismissal is scoped per-house — another house still shows the banner', async () => {
    const user = userEvent.setup()
    render(<UpgradeBanner />)
    await user.click(screen.getByLabelText(/close/i))
    cleanup()

    // Switch to a different house
    houseRef.current = { id: 'h2', name: 'Other House' }
    render(<UpgradeBanner />)
    // Banner should be visible for h2 even though h1 was dismissed
    expect(screen.getByText(/Get more out of CasaTab/i)).toBeTruthy()
  })

  it('initialises dismissed state from localStorage on mount', () => {
    localStorage.setItem('billing:banner-dismissed:h1', '1')
    const { container } = render(<UpgradeBanner />)
    expect(container.textContent).toBe('')
  })
})
