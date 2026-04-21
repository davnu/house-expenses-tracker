import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SHARED_PAYER } from '@/lib/constants'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

// ── Mocks (hoisted) ──

const twoMembers = [
  { uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#2a9d90', role: 'owner' as const, joinedAt: '' },
  { uid: 'bob', displayName: 'Bob', email: 'b@b.com', color: '#e76e50', role: 'member' as const, joinedAt: '' },
]

const { mockMembers } = vi.hoisted(() => ({
  mockMembers: { current: [] as typeof twoMembers },
}))

const generateInviteMock = vi.fn()

// Entitlement + upgrade dialog — tests exercise Pro behavior so the invite
// flow is fully available. Invite-dialog free-tier path has its own test
// coverage in InviteHousemateDialog.test.tsx.
vi.mock('@/hooks/use-entitlement', () => ({
  useEntitlement: () => ({
    entitlement: { tier: 'pro', purchasedAt: '' },
    limits: {
      maxMembers: Infinity,
      maxStorageMB: 500,
      hasHouseholdInvites: true,
      hasAdvancedMortgage: true,
      hasBudget: true,
      hasExport: true,
      hasPrintSummary: true,
      hasMortgageWhatIf: true,
    },
    isPro: true,
    isLoading: false,
  }),
}))
vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({ isOpen: false, gate: null, open: vi.fn(), close: vi.fn() }),
  UpgradeDialogProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    members: mockMembers.current,
    house: { id: 'h1', name: 'Casa Verde' },
    houseSplit: mockMembers.current.length > 0
      ? mockMembers.current.map((m) => ({
          uid: m.uid,
          shareBps: Math.floor(10000 / mockMembers.current.length),
        }))
      : [],
    generateInvite: generateInviteMock,
    getMemberName: (uid: string) => {
      if (uid === SHARED_PAYER) return 'Shared'
      return mockMembers.current.find((m) => m.uid === uid)?.displayName ?? 'Unknown'
    },
    getMemberColor: (uid: string) => {
      if (uid === SHARED_PAYER) return '#6366f1'
      return mockMembers.current.find((m) => m.uid === uid)?.color ?? '#6b7280'
    },
  }),
}))

vi.mock('@/context/ExpenseContext', () => ({
  useExpenses: () => ({ storageUsed: 0 }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'alice' } }),
}))

import { ExpenseForm } from './ExpenseForm'

afterEach(cleanup)

const noopSubmit = vi.fn().mockResolvedValue(undefined)

// ── Tests ──

describe('ExpenseForm attachments section', () => {
  beforeEach(() => {
    mockMembers.current = [...twoMembers]
  })

  it('shows the attachments label with security info tooltip', () => {
    const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
    expect(screen.getByText('Attachments')).toBeTruthy()
    // InfoTooltip renders an info icon button
    const infoButton = container.querySelector('.text-muted-foreground.hover\\:text-foreground')
    expect(infoButton).not.toBeNull()
  })

  it('hides attachments section when hideAttachments is true', () => {
    render(<ExpenseForm onSubmit={noopSubmit} hideAttachments />)
    expect(screen.queryByText('Attachments')).toBeNull()
  })
})

describe('ExpenseForm payer behavior', () => {
  describe('multi-member household', () => {
    beforeEach(() => {
      mockMembers.current = [...twoMembers]
    })

    it('shows "Paid by" field with PayerSelect', () => {
      render(<ExpenseForm onSubmit={noopSubmit} />)
      expect(screen.getByText('Paid by')).toBeTruthy()
    })

    it('defaults payer to "Shared"', () => {
      const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
      const trigger = container.querySelector('#payer') as HTMLElement
      expect(trigger).not.toBeNull()
      expect(trigger.textContent).toContain('Shared')
    })

    it('shows hint text for shared default', () => {
      render(<ExpenseForm onSubmit={noopSubmit} />)
      expect(screen.getByText('Paid from shared household funds')).toBeTruthy()
    })

    it('preserves payer when editing an existing expense', () => {
      const { container } = render(
        <ExpenseForm
          onSubmit={noopSubmit}
          defaultValues={{ payer: 'bob', amount: '100', category: 'taxes', date: '2025-01-01' }}
          submitLabel="Save Changes"
        />
      )
      const trigger = container.querySelector('#payer') as HTMLElement
      expect(trigger.textContent).toContain('Bob')
    })

    it('shows personal hint when member is selected via defaultValues', () => {
      render(
        <ExpenseForm
          onSubmit={noopSubmit}
          defaultValues={{ payer: 'alice' }}
        />
      )
      expect(screen.getByText('Paid personally by Alice')).toBeTruthy()
    })
  })

  describe('single-member household', () => {
    beforeEach(() => {
      mockMembers.current = [twoMembers[0]]
      generateInviteMock.mockReset()
    })

    it('still shows the "Paid by" label so the field is discoverable', () => {
      render(<ExpenseForm onSubmit={noopSubmit} />)
      expect(screen.getByText('Paid by')).toBeTruthy()
    })

    it('does not render the multi-member combobox', () => {
      const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
      expect(container.querySelector('#payer[role="combobox"]')).toBeNull()
    })

    it('keeps a hidden input so the form value still flows through react-hook-form', () => {
      const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
      const hidden = container.querySelector('input[type="hidden"][name="payer"]')
      expect(hidden).not.toBeNull()
    })

    it('shows the user\'s display name (not "You") for symmetry with the multi-member view', () => {
      render(<ExpenseForm onSubmit={noopSubmit} />)
      expect(screen.getByText('Alice')).toBeTruthy()
    })

    it('does not render an always-visible explainer hint outside the panel', () => {
      render(<ExpenseForm onSubmit={noopSubmit} />)
      expect(screen.queryByText(/buying with someone else/i)).toBeNull()
      // The panel-only explainer is also absent until expanded
      expect(screen.queryByText(/add someone to your household/i)).toBeNull()
    })

    it('clicking the chip toggles an inline panel, not a modal', async () => {
      const user = userEvent.setup()
      render(<ExpenseForm onSubmit={noopSubmit} />)
      const chip = screen.getByRole('button', { name: /invite to split/i })
      expect(chip.getAttribute('aria-expanded')).toBe('false')
      await user.click(chip)
      expect(chip.getAttribute('aria-expanded')).toBe('true')
      // Inline explainer is now visible — modal title is NOT
      expect(screen.getByText(/add someone to your household/i)).toBeTruthy()
      expect(screen.queryByText('Invite a housemate')).toBeNull()
    })

    it('clicking the chip again collapses the panel', async () => {
      const user = userEvent.setup()
      render(<ExpenseForm onSubmit={noopSubmit} />)
      const chip = screen.getByRole('button', { name: /invite to split/i })
      await user.click(chip)
      await user.click(chip)
      expect(chip.getAttribute('aria-expanded')).toBe('false')
      expect(screen.queryByText(/add someone to your household/i)).toBeNull()
    })

    it('panel CTA opens the dialog and the inline panel collapses', async () => {
      generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
      const submit = vi.fn().mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(<ExpenseForm onSubmit={submit} />)
      await user.click(screen.getByRole('button', { name: /invite to split/i }))
      await user.click(screen.getByRole('button', { name: /get invite link/i }))
      // Dialog appears (Radix portals it; Radix also marks the form region aria-hidden,
      // so we can't getByRole the chip from here — we verify collapse via the panel's
      // explainer text being absent and the form-not-submitted invariant).
      expect(await screen.findByText('Invite a housemate')).toBeTruthy()
      expect(submit).not.toHaveBeenCalled()
      expect(screen.queryByText(/add someone to your household/i)).toBeNull()
    })

    it('opening the dialog does NOT auto-generate an invite (lazy generation)', async () => {
      generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
      const user = userEvent.setup()
      render(<ExpenseForm onSubmit={noopSubmit} />)
      await user.click(screen.getByRole('button', { name: /invite to split/i }))
      await user.click(screen.getByRole('button', { name: /get invite link/i }))
      await screen.findByText('Invite a housemate')
      expect(generateInviteMock).not.toHaveBeenCalled()
    })

    it('keeps form state when the invite dialog opens and closes', async () => {
      generateInviteMock.mockResolvedValue('https://example.com/invite/abc')
      const user = userEvent.setup()
      render(<ExpenseForm onSubmit={noopSubmit} />)
      const amount = document.getElementById('amount') as HTMLInputElement
      await user.type(amount, '123.45')
      await user.click(screen.getByRole('button', { name: /invite to split/i }))
      await user.click(screen.getByRole('button', { name: /get invite link/i }))
      await screen.findByText('Invite a housemate')
      await user.keyboard('{Escape}')
      // Amount must still be there — the form did not unmount
      expect((document.getElementById('amount') as HTMLInputElement).value).toBe('123.45')
    })

    it('explainer panel renders full-width as a sibling of the grid, not nested inside the Paid-by column', async () => {
      const user = userEvent.setup()
      const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
      const chip = screen.getByRole('button', { name: /invite to split/i })
      await user.click(chip)
      const panelId = chip.getAttribute('aria-controls')!
      const panel = container.querySelector(`#${panelId}`)
      expect(panel).not.toBeNull()
      // Structural assertion: panel is NOT inside the same grid as the chip.
      // This is what guarantees full-row width — otherwise the long sentence
      // wraps awkwardly inside a column (the bug we are guarding against).
      const chipGrid = chip.closest('.grid')
      expect(chipGrid).not.toBeNull()
      expect(chipGrid?.contains(panel)).toBe(false)
    })

    it('submits with the user uid as payer, even with the invite panel open', async () => {
      const submit = vi.fn().mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(<ExpenseForm onSubmit={submit} />)
      // Open the invite panel
      await user.click(screen.getByRole('button', { name: /invite to split/i }))
      expect(screen.getByText(/add someone to your household/i)).toBeTruthy()
      // Fill required field and submit
      await user.type(document.getElementById('amount') as HTMLInputElement, '50')
      await user.click(screen.getByRole('button', { name: /add expense/i }))
      await waitFor(() => expect(submit).toHaveBeenCalled())
      const [payload] = submit.mock.calls[0]
      expect(payload.payer).toBe('alice') // user.uid from auth mock
      expect(payload.amount).toBe(5000) // 50.00 * 100 cents
    })

    it('closes the helper panel after a successful submit (clean state for next entry)', async () => {
      const submit = vi.fn().mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(<ExpenseForm onSubmit={submit} />)
      await user.click(screen.getByRole('button', { name: /invite to split/i }))
      expect(screen.getByText(/add someone to your household/i)).toBeTruthy()
      await user.type(document.getElementById('amount') as HTMLInputElement, '12')
      await user.click(screen.getByRole('button', { name: /add expense/i }))
      await waitFor(() => expect(submit).toHaveBeenCalled())
      // Panel auto-collapses after submit
      expect(screen.queryByText(/add someone to your household/i)).toBeNull()
      const chip = screen.getByRole('button', { name: /invite to split/i })
      expect(chip.getAttribute('aria-expanded')).toBe('false')
    })

    it('falls back gracefully when display name is empty (loading window)', () => {
      // Replace the only member with one that has no displayName — simulates the
      // brief window where the household context is mid-load.
      mockMembers.current = [{ ...twoMembers[0], displayName: '' }]
      const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
      // The chip and label still render; nothing throws.
      expect(screen.getByText('Paid by')).toBeTruthy()
      expect(screen.getByRole('button', { name: /invite to split/i })).toBeTruthy()
      // The "you" pill is still in the DOM (just visually empty)
      expect(container.querySelector('.h-2\\.5.w-2\\.5.rounded-full')).not.toBeNull()
    })
  })
})

describe('ExpenseForm split chip', () => {
  beforeEach(() => {
    mockMembers.current = [...twoMembers]
  })

  it('does not render the split chip when payer is Shared (no amounts to configure)', async () => {
    const user = userEvent.setup()
    render(<ExpenseForm onSubmit={noopSubmit} />)
    const amount = document.getElementById('amount') as HTMLInputElement
    await user.type(amount, '100')
    // Default payer is Shared → no chip
    expect(screen.queryByText(/tap to adjust/i)).toBeNull()
  })

  it('does not render the split chip when amount is empty', () => {
    render(<ExpenseForm onSubmit={noopSubmit} defaultValues={{ payer: 'split' }} />)
    expect(screen.queryByText(/tap to adjust/i)).toBeNull()
  })

  it('renders the split chip when payer is Split payment and amount is positive', async () => {
    const user = userEvent.setup()
    render(<ExpenseForm onSubmit={noopSubmit} defaultValues={{ payer: 'split' }} />)
    const amount = document.getElementById('amount') as HTMLInputElement
    await user.type(amount, '100')
    expect(screen.getByText(/tap to adjust/i)).toBeTruthy()
  })

  it('auto-opens the split editor on first pick of Split payment', async () => {
    const user = userEvent.setup()
    render(<ExpenseForm onSubmit={noopSubmit} defaultValues={{ amount: '100' }} />)
    // Pick Split payment
    const trigger = document.getElementById('payer') as HTMLElement
    await user.click(trigger)
    const splitOption = await screen.findByRole('option', { name: /split payment|pago dividido|paiement à plusieurs|mehreren|meerdere|por vários/i })
    await user.click(splitOption)
    // Dialog title appears (editor auto-opened)
    expect(await screen.findByText(/who paid how much|cuánto pagó|payé combien|wer hat wie viel|wie betaalde|quem pagou/i)).toBeTruthy()
  })

  it('clears splits on amount change and shows a reopen notice', async () => {
    const user = userEvent.setup()
    render(
      <ExpenseForm
        onSubmit={noopSubmit}
        defaultValues={{ amount: '100', payer: 'split' }}
        defaultSplits={[
          { uid: 'alice', shareCents: 7000 },
          { uid: 'bob', shareCents: 3000 },
        ]}
      />,
    )
    const amount = document.getElementById('amount') as HTMLInputElement
    // Sanity: chip starts in custom state
    expect(screen.getByText(/custom amounts/i)).toBeTruthy()
    // Changing the amount clears the stale splits and surfaces a notice
    await user.clear(amount)
    await user.type(amount, '200')
    expect(screen.getByText(/reopen|vuelve a abrir|rouvrez|erneut öffnen|open opnieuw|abre de novo/i)).toBeTruthy()
    // Previous custom amounts are gone — chip shows the "set amounts" action
    expect(screen.queryByText(/custom amounts/i)).toBeNull()
  })
})
