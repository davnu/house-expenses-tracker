import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SHARED_PAYER } from '@/lib/constants'
import type { Expense } from '@/types/expense'

// ── Mocks ──

const twoMembers = [
  { uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#2a9d90', role: 'owner' as const, joinedAt: '' },
  { uid: 'bob', displayName: 'Bob', email: 'b@b.com', color: '#e76e50', role: 'member' as const, joinedAt: '' },
]

const { mockMembers } = vi.hoisted(() => ({
  mockMembers: {
    current: [] as typeof twoMembers,
  },
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    members: mockMembers.current,
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

import { PersonSplitCard } from './PersonSplitCard'

beforeEach(() => {
  mockMembers.current = [...twoMembers]
})
afterEach(cleanup)

// ── Test helpers ──

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 100000,
    category: 'notary_legal',
    payer: 'alice',
    description: '',
    date: '2025-07-15',
    createdAt: '2025-07-15T00:00:00Z',
    updatedAt: '2025-07-15T00:00:00Z',
    ...overrides,
  }
}

// ── Tests ──

describe('PersonSplitCard', () => {
  describe('returns null (no card rendered)', () => {
    it('returns null for single-member household', () => {
      mockMembers.current = [twoMembers[0]]
      const { container } = render(
        <PersonSplitCard expenses={[expense()]} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('returns null when there are no expenses', () => {
      const { container } = render(
        <PersonSplitCard expenses={[]} />
      )
      expect(container.innerHTML).toBe('')
    })
  })

  describe('all-shared informational card', () => {
    it('renders informational card when all expenses are shared', () => {
      const expenses = [
        expense({ id: 'e1', amount: 500000, payer: SHARED_PAYER }),
        expense({ id: 'e2', amount: 200000, payer: SHARED_PAYER }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      // Should render a card (not null)
      expect(container.innerHTML).not.toBe('')
      // Should show the total
      expect(container.textContent).toContain('7,000.00')
      // Should show the contextual message
      expect(container.textContent).toContain('All expenses shared between household members')
      // Should NOT show "Expense Split" title (lightweight card)
      expect(container.textContent).not.toContain('Expense Split')
    })
  })

  describe('shared-dominant layout (shared > 50%)', () => {
    it('shows shared as primary with individual contributions below', () => {
      const expenses = [
        expense({ id: 'e1', amount: 800000, payer: SHARED_PAYER }),
        expense({ id: 'e2', amount: 200000, payer: 'alice' }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      expect(container.textContent).toContain('Expense Split')
      expect(container.textContent).toContain('Shared')
      expect(container.textContent).toContain('Individual contributions')
      expect(container.textContent).toContain('Alice')
    })

    it('shows correct percentages', () => {
      const expenses = [
        expense({ id: 'e1', amount: 750000, payer: SHARED_PAYER }),
        expense({ id: 'e2', amount: 250000, payer: 'bob' }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      expect(container.textContent).toContain('75%')
      expect(container.textContent).toContain('25%')
    })
  })

  describe('equal-weight layout (shared <= 50%)', () => {
    it('shows flat legend when shared is exactly 50%', () => {
      const expenses = [
        expense({ id: 'e1', amount: 500000, payer: SHARED_PAYER }),
        expense({ id: 'e2', amount: 500000, payer: 'alice' }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      expect(container.textContent).toContain('Expense Split')
      // Should NOT show the "Individual contributions" sub-label
      expect(container.textContent).not.toContain('Individual contributions')
      // Both should appear as equal segments
      expect(container.textContent).toContain('Shared')
      expect(container.textContent).toContain('Alice')
      expect(container.textContent).toContain('50%')
    })

    it('shows flat legend when shared is minority', () => {
      const expenses = [
        expense({ id: 'e1', amount: 200000, payer: SHARED_PAYER }),
        expense({ id: 'e2', amount: 500000, payer: 'alice' }),
        expense({ id: 'e3', amount: 300000, payer: 'bob' }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      expect(container.textContent).not.toContain('Individual contributions')
      expect(container.textContent).toContain('Shared')
      expect(container.textContent).toContain('Alice')
      expect(container.textContent).toContain('Bob')
    })

    it('shows flat legend when there are no shared expenses', () => {
      const expenses = [
        expense({ id: 'e1', amount: 600000, payer: 'alice' }),
        expense({ id: 'e2', amount: 400000, payer: 'bob' }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      expect(container.textContent).not.toContain('Shared')
      expect(container.textContent).not.toContain('Individual contributions')
      expect(container.textContent).toContain('Alice')
      expect(container.textContent).toContain('Bob')
      expect(container.textContent).toContain('60%')
      expect(container.textContent).toContain('40%')
    })
  })

  describe('edge cases', () => {
    it('handles orphaned payer (member who left) — shows "Former member" slice', () => {
      const expenses = [
        expense({ id: 'e1', amount: 500000, payer: SHARED_PAYER }),
        expense({ id: 'e2', amount: 300000, payer: 'deleted-member' }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      // Orphaned expenses are grouped into a "Former member" slice
      expect(container.textContent).toContain('Former member')
      expect(container.textContent).toContain('Shared')
      // Both amounts are accounted for in the split
      expect(container.textContent).toContain('5,000.00')
      expect(container.textContent).toContain('3,000.00')
    })

    it('groups multiple orphaned payers into one "Former member" slice', () => {
      const expenses = [
        expense({ id: 'e1', amount: 400000, payer: 'alice' }),
        expense({ id: 'e2', amount: 300000, payer: 'deleted-1' }),
        expense({ id: 'e3', amount: 200000, payer: 'deleted-2' }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      // Both orphaned payers should be combined into one entry
      expect(container.textContent).toContain('Former member')
      expect(container.textContent).toContain('5,000.00')
      expect(container.textContent).toContain('Alice')
    })

    it('only includes payers with non-zero totals in slices', () => {
      const expenses = [
        expense({ id: 'e1', amount: 1000000, payer: 'alice' }),
      ]
      const { container } = render(
        <PersonSplitCard expenses={expenses} />
      )

      // Bob has no expenses — should not appear
      expect(container.textContent).toContain('Alice')
      expect(container.textContent).not.toContain('Bob')
      expect(container.textContent).toContain('100%')
    })
  })
})
