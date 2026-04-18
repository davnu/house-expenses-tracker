import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SHARED_PAYER, SPLIT_PAYER } from '@/lib/constants'
import type { Expense } from '@/types/expense'

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

const members = [
  { uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#2a9d90', role: 'owner' as const, joinedAt: '' },
  { uid: 'bob', displayName: 'Bob', email: 'b@b.com', color: '#e76e50', role: 'member' as const, joinedAt: '' },
]

const { mockMembers } = vi.hoisted(() => ({
  mockMembers: { current: [] as typeof members },
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    members: mockMembers.current,
    getMemberName: (uid: string) => {
      if (uid === SHARED_PAYER) return 'Shared'
      if (uid === SPLIT_PAYER) return 'Split payment'
      return mockMembers.current.find((m) => m.uid === uid)?.displayName ?? 'Former member'
    },
    getMemberColor: (uid: string) => {
      if (uid === SHARED_PAYER) return '#6366f1'
      if (uid === SPLIT_PAYER) return '#0369a1'
      return mockMembers.current.find((m) => m.uid === uid)?.color ?? '#6b7280'
    },
  }),
}))

import { RecentExpenses } from './RecentExpenses'

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 10000,
    category: 'other',
    payer: 'alice',
    description: '',
    date: '2026-04-01',
    createdAt: '2026-04-01',
    updatedAt: '2026-04-01',
    ...overrides,
  }
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  mockMembers.current = [...members]
})
afterEach(cleanup)

describe('RecentExpenses — SPLIT_PAYER handling', () => {
  it('renders a multi-dot cluster for a Split payment expense (not "Former member")', () => {
    const expenses = [
      expense({
        id: 'sp',
        amount: 50000,
        payer: SPLIT_PAYER,
        splits: [
          { uid: 'alice', shareCents: 25000 },
          { uid: 'bob', shareCents: 25000 },
        ],
      }),
    ]
    const { container } = renderWithRouter(<RecentExpenses expenses={expenses} />)
    // Tooltip mentions both members and amounts
    const clustered = container.querySelector('[title*="Alice"][title*="Bob"]')
    expect(clustered).not.toBeNull()
    // No "Former member" leakage
    expect(container.innerHTML).not.toContain('Former member')
  })

  it('single-payer expenses still render one dot with the member color', () => {
    const expenses = [expense({ id: 'a', amount: 10000, payer: 'alice' })]
    const { container } = renderWithRouter(<RecentExpenses expenses={expenses} />)
    const dot = container.querySelector('[title="Alice"]')
    expect(dot).not.toBeNull()
  })

  it('Shared expenses render a single dot labeled "Shared"', () => {
    const expenses = [expense({ id: 's', amount: 10000, payer: SHARED_PAYER })]
    const { container } = renderWithRouter(<RecentExpenses expenses={expenses} />)
    const dot = container.querySelector('[title="Shared"]')
    expect(dot).not.toBeNull()
  })
})
