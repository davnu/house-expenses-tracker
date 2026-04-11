import { describe, it, expect } from 'vitest'
import {
  filterByPayer,
  filterByDateRange,
  filterByCategory,
  filterBySearch,
  applyFilters,
} from './expense-utils'
import type { Expense } from '@/types/expense'

// ── Test data ────────────────────────────────────────

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 100000,
    category: 'notary_legal',
    payer: 'alice',
    description: 'Notary fees for apartment',
    date: '2025-07-15',
    createdAt: '2025-07-15T00:00:00Z',
    updatedAt: '2025-07-15T00:00:00Z',
    ...overrides,
  }
}

const expenses: Expense[] = [
  expense({ id: 'e1', amount: 500000, category: 'down_payment', payer: 'alice', description: 'Down payment deposit', date: '2025-06-01' }),
  expense({ id: 'e2', amount: 150000, category: 'notary_legal', payer: 'bob', description: 'Notary fees', date: '2025-07-15' }),
  expense({ id: 'e3', amount: 30000, category: 'home_inspection', payer: 'alice', description: 'Home inspection report', date: '2025-07-20' }),
  expense({ id: 'e4', amount: 80000, category: 'taxes', payer: 'bob', description: 'Property transfer tax', date: '2025-08-01' }),
  expense({ id: 'e5', amount: 20000, category: 'moving', payer: 'alice', description: 'Moving company', date: '2025-09-10' }),
]

// ── filterByPayer ────────────────────────────────────

describe('filterByPayer', () => {
  it('returns only expenses from the specified payer', () => {
    const result = filterByPayer(expenses, 'alice')
    expect(result).toHaveLength(3)
    expect(result.every((e) => e.payer === 'alice')).toBe(true)
  })

  it('returns empty for non-existent payer', () => {
    expect(filterByPayer(expenses, 'charlie')).toHaveLength(0)
  })

  it('returns all when filtering for all unique payers combined', () => {
    const alice = filterByPayer(expenses, 'alice')
    const bob = filterByPayer(expenses, 'bob')
    expect(alice.length + bob.length).toBe(expenses.length)
  })
})

// ── filterByDateRange ────────────────────────────────

describe('filterByDateRange', () => {
  it('filters within a date range', () => {
    const result = filterByDateRange(expenses, '2025-07-01', '2025-07-31')
    expect(result).toHaveLength(2) // e2 and e3
    expect(result.map((e) => e.id)).toEqual(['e2', 'e3'])
  })

  it('includes edges (start and end dates)', () => {
    const result = filterByDateRange(expenses, '2025-07-15', '2025-07-20')
    expect(result).toHaveLength(2) // exactly e2 and e3
  })

  it('returns all when range covers everything', () => {
    const result = filterByDateRange(expenses, '2025-01-01', '2025-12-31')
    expect(result).toHaveLength(5)
  })

  it('returns empty when range matches nothing', () => {
    const result = filterByDateRange(expenses, '2024-01-01', '2024-12-31')
    expect(result).toHaveLength(0)
  })

  it('handles empty start (no lower bound)', () => {
    const result = filterByDateRange(expenses, '', '2025-07-15')
    expect(result).toHaveLength(2) // e1 and e2
  })

  it('handles empty end (no upper bound)', () => {
    const result = filterByDateRange(expenses, '2025-08-01', '')
    expect(result).toHaveLength(2) // e4 and e5
  })

  it('handles both empty (returns all)', () => {
    const result = filterByDateRange(expenses, '', '')
    expect(result).toHaveLength(5)
  })
})

// ── filterByCategory ─────────────────────────────────

describe('filterByCategory', () => {
  it('returns only matching category', () => {
    const result = filterByCategory(expenses, 'notary_legal')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e2')
  })

  it('returns empty for unused category', () => {
    expect(filterByCategory(expenses, 'furniture')).toHaveLength(0)
  })
})

// ── filterBySearch ───────────────────────────────────

describe('filterBySearch', () => {
  it('matches description (case insensitive)', () => {
    const result = filterBySearch(expenses, 'notary')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e2')
  })

  it('matches partial description', () => {
    const result = filterBySearch(expenses, 'deposit')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e1')
  })

  it('matches category label when provided', () => {
    const labels: Record<string, string> = {
      down_payment: 'Down Payment',
      notary_legal: 'Notary & Legal',
      home_inspection: 'Home Inspection & Survey',
      taxes: 'Taxes & Stamp Duty',
      moving: 'Moving Costs',
    }
    const result = filterBySearch(expenses, 'stamp', labels)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e4')
  })

  it('returns all for empty query', () => {
    expect(filterBySearch(expenses, '')).toHaveLength(5)
  })

  it('returns empty when nothing matches', () => {
    expect(filterBySearch(expenses, 'zzzzz')).toHaveLength(0)
  })

  it('is case insensitive', () => {
    expect(filterBySearch(expenses, 'MOVING')).toHaveLength(1)
    expect(filterBySearch(expenses, 'moving')).toHaveLength(1)
    expect(filterBySearch(expenses, 'Moving')).toHaveLength(1)
  })
})

// ── applyFilters (combined) ──────────────────────────

describe('applyFilters', () => {
  it('returns all with no filters', () => {
    expect(applyFilters(expenses, {})).toHaveLength(5)
  })

  it('applies category filter', () => {
    const result = applyFilters(expenses, { category: 'taxes' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e4')
  })

  it('applies payer filter', () => {
    const result = applyFilters(expenses, { payer: 'bob' })
    expect(result).toHaveLength(2)
  })

  it('applies date range filter', () => {
    const result = applyFilters(expenses, { dateStart: '2025-07-01', dateEnd: '2025-07-31' })
    expect(result).toHaveLength(2)
  })

  it('combines multiple filters (intersection)', () => {
    const result = applyFilters(expenses, {
      payer: 'alice',
      dateStart: '2025-07-01',
      dateEnd: '2025-09-30',
    })
    expect(result).toHaveLength(2) // e3 (inspection) and e5 (moving)
  })

  it('returns empty when filters exclude everything', () => {
    const result = applyFilters(expenses, {
      payer: 'alice',
      category: 'taxes', // alice has no tax expenses
    })
    expect(result).toHaveLength(0)
  })

  it('applies only dateStart (no dateEnd)', () => {
    const result = applyFilters(expenses, { dateStart: '2025-08-01' })
    expect(result).toHaveLength(2) // e4 and e5
  })

  it('applies only dateEnd (no dateStart)', () => {
    const result = applyFilters(expenses, { dateEnd: '2025-07-15' })
    expect(result).toHaveLength(2) // e1 and e2
  })
})
