import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SHARED_PAYER, SPLIT_PAYER } from '@/lib/constants'
import type { Expense, CostSplitShare } from '@/types/expense'

const twoMembers = [
  { uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#2a9d90', role: 'owner' as const, joinedAt: '' },
  { uid: 'bob', displayName: 'Bob', email: 'b@b.com', color: '#e76e50', role: 'member' as const, joinedAt: '' },
]
const equalSplit: CostSplitShare[] = [
  { uid: 'alice', shareBps: 5000 },
  { uid: 'bob', shareBps: 5000 },
]

const { mockHousehold } = vi.hoisted(() => ({
  mockHousehold: {
    members: [] as typeof twoMembers,
    houseSplit: [] as CostSplitShare[],
  },
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    members: mockHousehold.members,
    houseSplit: mockHousehold.houseSplit,
    getMemberName: (uid: string) => {
      if (uid === SHARED_PAYER) return 'Shared'
      return mockHousehold.members.find((m) => m.uid === uid)?.displayName ?? 'Former member'
    },
    getMemberColor: (uid: string) => {
      if (uid === SHARED_PAYER) return '#6366f1'
      return mockHousehold.members.find((m) => m.uid === uid)?.color ?? '#6b7280'
    },
  }),
}))

import { PersonSplitCard } from './PersonSplitCard'

beforeEach(() => {
  mockHousehold.members = [...twoMembers]
  mockHousehold.houseSplit = equalSplit
})
afterEach(cleanup)

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 100000,
    category: 'notary_legal',
    payer: SHARED_PAYER,
    description: '',
    date: '2025-07-15',
    createdAt: '2025-07-15T00:00:00Z',
    updatedAt: '2025-07-15T00:00:00Z',
    ...overrides,
  }
}

describe('PersonSplitCard — who paid', () => {
  describe('visibility', () => {
    it('renders nothing for single-member household', () => {
      mockHousehold.members = [twoMembers[0]]
      const { container } = render(<PersonSplitCard expenses={[expense()]} />)
      expect(container.innerHTML).toBe('')
    })

    it('renders nothing when there are no expenses', () => {
      const { container } = render(<PersonSplitCard expenses={[]} />)
      expect(container.innerHTML).toBe('')
    })
  })

  describe('shared-only expenses', () => {
    it('shows only a Shared row, nothing under individual names', () => {
      const expenses = [
        expense({ id: 'e1', amount: 500000, payer: SHARED_PAYER }),
        expense({ id: 'e2', amount: 300000, payer: SHARED_PAYER }),
      ]
      const { container } = render(<PersonSplitCard expenses={expenses} />)
      expect(container.textContent).toContain('Shared')
      // 8,000.00 total — appears as card total + Shared row
      expect(container.textContent).toContain('8,000.00')
      // Neither Alice nor Bob should appear as a row
      expect(container.textContent).not.toContain('Alice')
      expect(container.textContent).not.toContain('Bob')
    })
  })

  describe('single-payer expenses', () => {
    it('attributes each expense under the payer\'s name', () => {
      const expenses = [
        expense({ id: 'e1', amount: 600000, payer: 'alice' }),
        expense({ id: 'e2', amount: 400000, payer: 'bob' }),
      ]
      const { container } = render(<PersonSplitCard expenses={expenses} />)
      expect(container.textContent).toContain('Alice')
      expect(container.textContent).toContain('Bob')
      expect(container.textContent).toContain('6,000.00')
      expect(container.textContent).toContain('4,000.00')
      // No shared bucket appears when no shared expenses
      expect(container.textContent).not.toContain('Shared')
    })
  })

  describe('split payment expenses', () => {
    it('attributes split-payment amounts to each contributor', () => {
      // €1,000 paid jointly: Alice €600, Bob €400
      const expenses = [
        expense({
          id: 'e1',
          amount: 100000,
          payer: SPLIT_PAYER,
          splits: [
            { uid: 'alice', shareCents: 60000 },
            { uid: 'bob', shareCents: 40000 },
          ],
        }),
      ]
      const { container } = render(<PersonSplitCard expenses={expenses} />)
      expect(container.textContent).toContain('Alice')
      expect(container.textContent).toContain('Bob')
      expect(container.textContent).toContain('600.00')
      expect(container.textContent).toContain('400.00')
    })
  })

  describe('mixed expenses', () => {
    it('per-member totals combine single + split, and Shared stays separate', () => {
      const expenses = [
        expense({ id: 'e1', amount: 200000, payer: 'alice' }),
        expense({
          id: 'e2',
          amount: 100000,
          payer: SPLIT_PAYER,
          splits: [
            { uid: 'alice', shareCents: 70000 },
            { uid: 'bob', shareCents: 30000 },
          ],
        }),
        expense({ id: 'e3', amount: 500000, payer: SHARED_PAYER }),
      ]
      const { container } = render(<PersonSplitCard expenses={expenses} />)
      // Alice total: €2,000 + €700 = €2,700
      expect(container.textContent).toContain('2,700.00')
      // Bob total: €300
      expect(container.textContent).toContain('300.00')
      // Shared pool: €5,000
      expect(container.textContent).toContain('Shared')
      expect(container.textContent).toContain('5,000.00')
    })
  })

  describe('orphaned payer (former member)', () => {
    it('surfaces former member in the breakdown without crashing', () => {
      const expenses = [
        expense({ id: 'e1', amount: 50000, payer: 'ghost' }),
        expense({ id: 'e2', amount: 30000, payer: 'alice' }),
      ]
      const { container } = render(<PersonSplitCard expenses={expenses} />)
      expect(container.textContent).toContain('Former member')
      expect(container.textContent).toContain('Alice')
    })
  })

  describe('Shared bucket is sourced from SHARED_PAYER only', () => {
    it('malformed SPLIT expense never leaks into Shared', () => {
      // SPLIT expense with no splits — data-integrity case. The amount should
      // NOT appear under "Shared" since no one marked it as joint funds.
      // (The library's fallback distributes it per household ratio instead.)
      const expenses = [
        expense({
          id: 'bad',
          amount: 200000,
          payer: SPLIT_PAYER,
          splits: [],
        }),
      ]
      const { container } = render(<PersonSplitCard expenses={expenses} />)
      // No Shared row should appear since sumSharedPool is authoritative
      expect(container.textContent).not.toContain('Shared')
    })
  })
})
