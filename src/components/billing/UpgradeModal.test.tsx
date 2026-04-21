import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── jsdom polyfills (needed for vaul drawer on mobile and radix dialog) ──

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  window.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  }))
})

// ── Mocks ──

const { houseRef, dialogStateRef, startCheckoutMock, CheckoutNotConfiguredErr } = vi.hoisted(() => ({
  houseRef: { current: { id: 'h1', name: 'Casa Verde' } as { id: string; name: string } | null },
  dialogStateRef: {
    current: { isOpen: true, gate: 'invite' as string | null, product: 'pro' as 'pro' | 'additional_house' },
  },
  startCheckoutMock: vi.fn(),
  CheckoutNotConfiguredErr: class CheckoutNotConfigured extends Error {
    constructor() { super('Checkout is not yet configured'); this.name = 'CheckoutNotConfigured' }
  },
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({ house: houseRef.current }),
}))

const closeMock = vi.fn()
vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({
    isOpen: dialogStateRef.current.isOpen,
    gate: dialogStateRef.current.gate,
    product: dialogStateRef.current.product,
    open: vi.fn(),
    close: closeMock,
  }),
  UpgradeDialogProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/lib/billing', () => ({
  startCheckout: startCheckoutMock,
  CheckoutNotConfigured: CheckoutNotConfiguredErr,
  PRICES: {
    pro: { amount: 4900, currency: 'EUR', display: '€49' },
    additional_house: { amount: 2900, currency: 'EUR', display: '€29' },
  },
}))

import { UpgradeModal } from './UpgradeModal'

afterEach(() => {
  cleanup()
  startCheckoutMock.mockReset()
  closeMock.mockReset()
  houseRef.current = { id: 'h1', name: 'Casa Verde' }
  dialogStateRef.current = { isOpen: true, gate: 'invite', product: 'pro' }
})

// ── Tests ──

describe('UpgradeModal', () => {
  it('renders nothing when isOpen is false', () => {
    dialogStateRef.current = { isOpen: false, gate: null, product: 'pro' }
    render(<UpgradeModal />)
    // Dialog content should not be in the document
    expect(screen.queryByText('€49')).toBeNull()
  })

  it('shows the invite-specific copy when gate is "invite"', () => {
    dialogStateRef.current = { isOpen: true, gate: 'invite', product: 'pro' }
    render(<UpgradeModal />)
    expect(screen.getByText(/Invite your partner to this house/i)).toBeTruthy()
  })

  it('shows the advanced-mortgage copy when gate is "advanced_mortgage"', () => {
    dialogStateRef.current = { isOpen: true, gate: 'advanced_mortgage', product: 'pro' }
    render(<UpgradeModal />)
    expect(screen.getByText(/Unlock your full mortgage/i)).toBeTruthy()
  })

  it('falls back to generic copy when gate is null', () => {
    dialogStateRef.current = { isOpen: true, gate: null, product: 'pro' }
    render(<UpgradeModal />)
    expect(screen.getByText(/Unlock CasaTab Pro/i)).toBeTruthy()
  })

  it('displays the €49 price for the "pro" product with NO fake strikethrough anchor', () => {
    render(<UpgradeModal />)
    expect(screen.getByText('€49')).toBeTruthy()
    // Regression guard for the removed fake €79 anchor — legal risk per audit
    expect(screen.queryByText('€79')).toBeNull()
  })

  it('shows the additional-house footnote with €29 (when product is "pro")', () => {
    render(<UpgradeModal />)
    expect(screen.getByText(/€29/)).toBeTruthy()
  })

  it('clicks the primary CTA and calls startCheckout with the current house + product "pro"', async () => {
    startCheckoutMock.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<UpgradeModal />)
    // Gate=invite now shows the value-led CTA "Invite your partner"
    await user.click(screen.getByRole('button', { name: /Invite your partner/i }))
    // 4th arg is the options bucket (for additional_house newHouseName) —
    // undefined for the pro product. Kept in the assertion so regressions
    // that start leaking modal state into Pro checkout fail loudly.
    expect(startCheckoutMock).toHaveBeenCalledWith('h1', 'pro', 'invite', undefined)
  })

  it('when product is "additional_house", displays €29 as the primary price', () => {
    dialogStateRef.current = { isOpen: true, gate: 'generic', product: 'additional_house' }
    render(<UpgradeModal />)
    // Primary price (big) is €29, not €49. The €49 footnote isn't shown either.
    const priceHeadings = screen.getAllByText('€29')
    expect(priceHeadings.length).toBeGreaterThan(0)
    // Additional-house copy
    expect(screen.getByText(/Add another house/i)).toBeTruthy()
  })

  it('when product is "additional_house", disables the CTA until the user names the new house', () => {
    dialogStateRef.current = { isOpen: true, gate: 'generic', product: 'additional_house' }
    render(<UpgradeModal />)
    // No name typed yet — CTA must refuse to start checkout; otherwise the
    // webhook has nothing to provision the new house with.
    const cta = screen.getByRole('button', { name: /Unlock Pro for €29/i }) as HTMLButtonElement
    expect(cta.disabled).toBe(true)
  })

  it('when product is "additional_house", forwards the trimmed new-house name to startCheckout', async () => {
    dialogStateRef.current = { isOpen: true, gate: 'generic', product: 'additional_house' }
    startCheckoutMock.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<UpgradeModal />)
    // Type a name (with padding) — we expect it to be trimmed before being
    // sent to the callable so Polar receipt / house doc match exactly.
    const input = screen.getByLabelText(/Name your new house/i)
    await user.type(input, '  Lisbon apartment  ')
    await user.click(screen.getByRole('button', { name: /Unlock Pro for €29/i }))
    expect(startCheckoutMock).toHaveBeenCalledWith('h1', 'additional_house', 'generic', {
      newHouseName: 'Lisbon apartment',
    })
  })

  it('when product is "additional_house", autofocuses the name input on open', () => {
    dialogStateRef.current = { isOpen: true, gate: 'generic', product: 'additional_house' }
    render(<UpgradeModal />)
    // Users land with the cursor ready to type — no extra tab hop.
    const input = screen.getByLabelText(/Name your new house/i)
    expect(document.activeElement).toBe(input)
  })

  it('does NOT show the name input for product="pro" (regression: only additional_house collects a name)', () => {
    dialogStateRef.current = { isOpen: true, gate: 'invite', product: 'pro' }
    render(<UpgradeModal />)
    // The input only exists in the additional_house branch — must never
    // appear for a Pro upgrade, otherwise a Pro upgrade would collect a
    // name that goes nowhere and the user gets confused.
    expect(screen.queryByLabelText(/Name your new house/i)).toBeNull()
  })

  it('clears the typed name when the modal closes + reopens (no state leak across opens)', async () => {
    dialogStateRef.current = { isOpen: true, gate: 'generic', product: 'additional_house' }
    const user = userEvent.setup()
    const { rerender } = render(<UpgradeModal />)
    const initialInput = screen.getByLabelText(/Name your new house/i) as HTMLInputElement
    await user.type(initialInput, 'Villa Draft')
    expect(initialInput.value).toBe('Villa Draft')

    // Close the modal and reopen — the name should NOT persist (a stale
    // "Villa Draft" would silently rename the next additional-house purchase).
    dialogStateRef.current = { isOpen: false, gate: null, product: 'pro' }
    rerender(<UpgradeModal />)
    dialogStateRef.current = { isOpen: true, gate: 'generic', product: 'additional_house' }
    rerender(<UpgradeModal />)

    const freshInput = screen.getByLabelText(/Name your new house/i) as HTMLInputElement
    expect(freshInput.value).toBe('')
  })

  it('for additional_house, trims-only input (whitespace-only) keeps the CTA disabled', async () => {
    dialogStateRef.current = { isOpen: true, gate: 'generic', product: 'additional_house' }
    const user = userEvent.setup()
    render(<UpgradeModal />)
    await user.type(screen.getByLabelText(/Name your new house/i), '     ')
    const cta = screen.getByRole('button', { name: /Unlock Pro for €29/i }) as HTMLButtonElement
    // A name of "     " would pass a naive length check but fail on the
    // server's sanitizeHouseName — this keeps the guard client-side too.
    expect(cta.disabled).toBe(true)
  })

  it('when product is "additional_house", hides the Pro feature list (already Pro)', () => {
    dialogStateRef.current = { isOpen: true, gate: 'generic', product: 'additional_house' }
    render(<UpgradeModal />)
    // The "Advanced mortgage" bullet shouldn't appear — user already has Pro
    expect(screen.queryByText(/Advanced mortgage: rate changes/i)).toBeNull()
  })

  it('shows the "checkout coming soon" notice when startCheckout throws CheckoutNotConfigured', async () => {
    startCheckoutMock.mockRejectedValueOnce(new CheckoutNotConfiguredErr())
    const user = userEvent.setup()
    render(<UpgradeModal />)
    await user.click(screen.getByRole('button', { name: /Invite your partner/i }))
    await waitFor(() => {
      expect(screen.getByText(/Checkout is being set up/i)).toBeTruthy()
    })
  })

  it('shows the error message when startCheckout throws a generic error', async () => {
    startCheckoutMock.mockRejectedValueOnce(new Error('Network unreachable'))
    const user = userEvent.setup()
    render(<UpgradeModal />)
    await user.click(screen.getByRole('button', { name: /Invite your partner/i }))
    await waitFor(() => {
      expect(screen.getByText(/Network unreachable/i)).toBeTruthy()
    })
  })

  it('disables the CTA while the checkout request is in flight', async () => {
    // Keep the promise pending so the button stays in loading state
    let _resolve: () => void = () => {}
    startCheckoutMock.mockImplementationOnce(
      () => new Promise<void>((r) => { _resolve = r })
    )
    const user = userEvent.setup()
    render(<UpgradeModal />)
    const cta = screen.getByRole('button', { name: /Invite your partner/i })
    await user.click(cta)
    await waitFor(() => {
      expect((cta as HTMLButtonElement).disabled).toBe(true)
    })
    _resolve()
  })

  it('disables the CTA when there is no active house (cannot purchase)', () => {
    houseRef.current = null
    render(<UpgradeModal />)
    const cta = screen.getByRole('button', { name: /Invite your partner/i })
    expect((cta as HTMLButtonElement).disabled).toBe(true)
  })

  it('surfaces all Pro features in the benefit list (invites, mortgage, budget, export, storage)', () => {
    render(<UpgradeModal />)
    // The features list is copy-rich — assert on the strings from en.json
    expect(screen.getByText(/Invite your partner or co-buyers/i)).toBeTruthy()
    expect(screen.getByText(/Advanced mortgage/i)).toBeTruthy()
    expect(screen.getByText(/Set category budgets/i)).toBeTruthy()
    expect(screen.getByText(/Export everything/i)).toBeTruthy()
    expect(screen.getByText(/500 MB of storage/i)).toBeTruthy()
  })

  it('shows gate-specific copy for every gate variant (budget, export, what_if, storage)', () => {
    // Assert on the dialog TITLE specifically (by role=heading) so the value-led
    // CTA button text — which sometimes echoes the title — doesn't create a
    // multiple-match collision.
    const cases: Array<[string, RegExp]> = [
      ['budget', /Set a budget for your house/i],
      ['export', /Export your data/i],
      ['what_if', /'what if\?' on your mortgage/i],
      ['storage', /More room for your files/i],
    ]
    for (const [gate, expected] of cases) {
      cleanup()
      dialogStateRef.current = { isOpen: true, gate, product: 'pro' }
      render(<UpgradeModal />)
      // Radix Dialog renders the title as role="heading"
      expect(screen.getByRole('heading', { name: expected })).toBeTruthy()
    }
  })

  it('uses value-led CTA copy ("Invite your partner") when gate=invite, price as microcopy', () => {
    dialogStateRef.current = { isOpen: true, gate: 'invite', product: 'pro' }
    render(<UpgradeModal />)
    expect(screen.getByRole('button', { name: /Invite your partner/i })).toBeTruthy()
    expect(screen.getByText(/One-time €49 · lifetime access/i)).toBeTruthy()
  })

  it('uses value-led CTA copy ("Set a budget") when gate=budget', () => {
    dialogStateRef.current = { isOpen: true, gate: 'budget', product: 'pro' }
    render(<UpgradeModal />)
    expect(screen.getByRole('button', { name: /Set a budget/i })).toBeTruthy()
  })

  it('surfaces the price-context microcopy (a top-tier-designer detail)', () => {
    dialogStateRef.current = { isOpen: true, gate: 'invite', product: 'pro' }
    render(<UpgradeModal />)
    expect(screen.getByText(/Less than the notary signing fee/i)).toBeTruthy()
  })

  it('regression guard: no fake €79 strikethrough anchor (EU price-display law)', () => {
    dialogStateRef.current = { isOpen: true, gate: 'invite', product: 'pro' }
    render(<UpgradeModal />)
    expect(screen.queryByText('€79')).toBeNull()
  })

  it('shows create_house-specific copy when opened from the "Create another house" gate', () => {
    dialogStateRef.current = { isOpen: true, gate: 'create_house', product: 'pro' }
    render(<UpgradeModal />)
    // Title is distinct from the product-override "Add another house" used for
    // additional_house — this path is free user upgrading to unlock multi-house.
    expect(screen.getByRole('heading', { name: /Add another house/i })).toBeTruthy()
    // The CTA routes to €49 Pro upgrade (not €29), since a free user needs Pro first
    expect(screen.getByRole('button', { name: /Upgrade for €49/i })).toBeTruthy()
  })
})
