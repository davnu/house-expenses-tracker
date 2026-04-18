import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    members: mockMembers.current,
    houseSplit: mockMembers.current.length > 0
      ? mockMembers.current.map((m) => ({
          uid: m.uid,
          shareBps: Math.floor(10000 / mockMembers.current.length),
        }))
      : [],
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
    })

    it('hides "Paid by" field entirely', () => {
      const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
      expect(screen.queryByText('Paid by')).toBeNull()
      // No PayerSelect trigger (the category <select> still exists, so check by id)
      expect(container.querySelector('#payer[role="combobox"]')).toBeNull()
    })

    it('still renders a hidden input for payer', () => {
      const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
      const hidden = container.querySelector('input[type="hidden"][name="payer"]')
      expect(hidden).not.toBeNull()
    })

    it('category field spans full width', () => {
      const { container } = render(<ExpenseForm onSubmit={noopSubmit} />)
      // The grid containing category should not have sm:grid-cols-2 when single member
      const categoryGrid = container.querySelector('#category')?.closest('.grid')
      expect(categoryGrid?.className).not.toContain('sm:grid-cols-2')
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
