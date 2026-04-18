import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SHARED_PAYER } from '@/lib/constants'
import type { CostSplitShare, Expense, House, HouseMember } from '@/types/expense'

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

const { state } = vi.hoisted(() => ({
  state: {
    members: [] as HouseMember[],
    house: null as House | null,
    houseSplit: [] as CostSplitShare[],
    updateCostSplit: vi.fn(),
    expenses: [] as Expense[],
  },
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    members: state.members,
    house: state.house,
    houseSplit: state.houseSplit,
    updateCostSplit: state.updateCostSplit,
    getMemberName: (uid: string) => {
      if (uid === SHARED_PAYER) return 'Shared'
      return state.members.find((m) => m.uid === uid)?.displayName ?? 'Former member'
    },
    getMemberColor: (uid: string) => {
      if (uid === SHARED_PAYER) return '#6366f1'
      return state.members.find((m) => m.uid === uid)?.color ?? '#6b7280'
    },
  }),
}))

vi.mock('@/context/ExpenseContext', () => ({
  useExpenses: () => ({ expenses: state.expenses }),
}))

import { CostSharingCard } from './CostSharingCard'

const twoMembers: HouseMember[] = [
  { uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#2a9d90', role: 'owner', joinedAt: '' },
  { uid: 'bob', displayName: 'Bob', email: 'b@b.com', color: '#e76e50', role: 'member', joinedAt: '' },
]
const equalSplit: CostSplitShare[] = [
  { uid: 'alice', shareBps: 5000 },
  { uid: 'bob', shareBps: 5000 },
]

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: overrides.id ?? 'e1',
    amount: overrides.amount ?? 100000,
    category: overrides.category ?? 'other',
    payer: overrides.payer ?? SHARED_PAYER,
    description: '',
    date: '2026-01-01',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

beforeEach(() => {
  state.members = [...twoMembers]
  state.house = { id: 'h1', name: 'Home', ownerId: 'alice', memberIds: ['alice', 'bob'], createdAt: '' }
  state.houseSplit = equalSplit
  state.updateCostSplit = vi.fn()
  state.expenses = []
})
afterEach(cleanup)

describe('CostSharingCard', () => {
  it('is hidden for single-member household', () => {
    state.members = [twoMembers[0]]
    const { container } = render(<CostSharingCard />)
    expect(container.innerHTML).toBe('')
  })

  it('renders Equally as selected when no custom split stored', () => {
    render(<CostSharingCard />)
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios[0].checked).toBe(true) // Equally
    expect(radios[1].checked).toBe(false) // Custom
  })

  it('renders Custom as selected when a non-equal ratio is stored', () => {
    state.house = { ...state.house!, costSplit: [{ uid: 'alice', shareBps: 7000 }, { uid: 'bob', shareBps: 3000 }] }
    state.houseSplit = [{ uid: 'alice', shareBps: 7000 }, { uid: 'bob', shareBps: 3000 }]
    render(<CostSharingCard />)
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios[0].checked).toBe(false)
    expect(radios[1].checked).toBe(true)
  })

  it('disables Save in Custom mode until inputs sum to 100', async () => {
    const user = userEvent.setup()
    render(<CostSharingCard />)
    // Switch to Custom
    const radios = screen.getAllByRole('radio')
    await user.click(radios[1])
    // Per-member inputs appear. Enter 60 for alice, 30 for bob (sums to 90)
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    await user.clear(inputs[0])
    await user.type(inputs[0], '60')
    await user.clear(inputs[1])
    await user.type(inputs[1], '30')
    const save = screen.getByRole('button', { name: /^save|^guardar|^enregistrer|^speichern|^opslaan/i }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    // Bump bob to 40 → sums to 100
    await user.clear(inputs[1])
    await user.type(inputs[1], '40')
    expect((screen.getByRole('button', { name: /^save|^guardar|^enregistrer|^speichern|^opslaan/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('Save in Equal mode clears stored split (calls updateCostSplit with null)', async () => {
    // Start with a stored custom ratio so the "Equally" selection is a change
    state.house = { ...state.house!, costSplit: [{ uid: 'alice', shareBps: 7000 }, { uid: 'bob', shareBps: 3000 }] }
    state.houseSplit = [{ uid: 'alice', shareBps: 7000 }, { uid: 'bob', shareBps: 3000 }]
    const user = userEvent.setup()
    render(<CostSharingCard />)
    const radios = screen.getAllByRole('radio')
    await user.click(radios[0]) // flip to Equally
    const save = screen.getByRole('button', { name: /^save|^guardar|^enregistrer|^speichern|^opslaan/i })
    await user.click(save)
    expect(state.updateCostSplit).toHaveBeenCalledWith(null)
  })

  it('Save in Custom mode passes a valid CostSplitShare[] summing to 10000', async () => {
    const user = userEvent.setup()
    render(<CostSharingCard />)
    const radios = screen.getAllByRole('radio')
    await user.click(radios[1])
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    await user.clear(inputs[0])
    await user.type(inputs[0], '65')
    await user.clear(inputs[1])
    await user.type(inputs[1], '35')
    const save = screen.getByRole('button', { name: /^save|^guardar|^enregistrer|^speichern|^opslaan/i })
    await user.click(save)
    const arg = state.updateCostSplit.mock.calls[0][0] as CostSplitShare[]
    const sum = arg.reduce((s, e) => s + e.shareBps, 0)
    expect(sum).toBe(10000)
    expect(arg.find((x) => x.uid === 'alice')?.shareBps).toBe(6500)
  })

  it('shows a live preview row with before → after when a different ratio is drafted', async () => {
    // Seed some expenses so the preview has numbers to work with
    state.expenses = [expense({ amount: 100000 })] // €1000, all shared
    const user = userEvent.setup()
    render(<CostSharingCard />)
    const radios = screen.getAllByRole('radio')
    await user.click(radios[1])
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    await user.clear(inputs[0])
    await user.type(inputs[0], '70')
    await user.clear(inputs[1])
    await user.type(inputs[1], '30')
    // Preview row for Alice should show €500.00 → €700.00
    const container = screen.getByText(/preview|vista previa|aperçu|vorschau|voorbeeld|pré-visualização/i).closest('div')
    expect(container).not.toBeNull()
    expect(container!.textContent).toContain('500.00')
    expect(container!.textContent).toContain('700.00')
  })
})
