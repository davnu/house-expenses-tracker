import { describe, it, expect } from 'vitest'
import {
  filterByPayer,
  filterByDateRange,
  filterByCategory,
  filterBySearch,
  filterByStatus,
  isExpensePaid,
  applyFilters,
  groupExpensesByMonth,
} from './expense-utils'
import { SHARED_PAYER } from './constants'
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

// ── groupExpensesByMonth ────────────────────────────

describe('groupExpensesByMonth', () => {
  it('groups expenses by month, newest first by default', () => {
    const result = groupExpensesByMonth(expenses)
    expect(result).toHaveLength(4) // Jun, Jul, Aug, Sep 2025
    expect(result.map(g => g.key)).toEqual(['2025-09', '2025-08', '2025-07', '2025-06'])
  })

  it('sorts oldest first with asc direction', () => {
    const result = groupExpensesByMonth(expenses, 'asc')
    expect(result.map(g => g.key)).toEqual(['2025-06', '2025-07', '2025-08', '2025-09'])
  })

  it('calculates correct total per group', () => {
    const result = groupExpensesByMonth(expenses)
    const sep = result.find(g => g.key === '2025-09')!
    expect(sep.total).toBe(20000) // e5 moving only
    const jul = result.find(g => g.key === '2025-07')!
    expect(jul.total).toBe(180000) // e2 (150000) + e3 (30000)
    const jun = result.find(g => g.key === '2025-06')!
    expect(jun.total).toBe(500000) // e1 down payment
    const aug = result.find(g => g.key === '2025-08')!
    expect(aug.total).toBe(80000) // e4 taxes
  })

  it('preserves expense order within groups', () => {
    const result = groupExpensesByMonth(expenses)
    const jul = result.find(g => g.key === '2025-07')!
    expect(jul.expenses).toHaveLength(2)
    expect(jul.expenses.map(e => e.id)).toEqual(['e2', 'e3'])
  })

  it('returns empty array for empty input', () => {
    expect(groupExpensesByMonth([])).toEqual([])
  })

  it('handles single expense', () => {
    const single = [expenses[0]]
    const result = groupExpensesByMonth(single)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('2025-06')
    expect(result[0].expenses).toHaveLength(1)
    expect(result[0].total).toBe(500000)
  })

  it('marks the current calendar month as isCurrent', () => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentExpense = expense({ id: 'now', date: `${currentMonth}-15` })
    const result = groupExpensesByMonth([currentExpense])
    expect(result).toHaveLength(1)
    expect(result[0].isCurrent).toBe(true)
  })

  it('does not mark old months as current', () => {
    const result = groupExpensesByMonth(expenses)
    expect(result.every(g => !g.isCurrent)).toBe(true)
  })

  it('groups multiple expenses on the same date together', () => {
    const sameDay = [
      expense({ id: 's1', amount: 10000, date: '2025-03-10' }),
      expense({ id: 's2', amount: 20000, date: '2025-03-10' }),
      expense({ id: 's3', amount: 30000, date: '2025-03-10' }),
    ]
    const result = groupExpensesByMonth(sameDay)
    expect(result).toHaveLength(1)
    expect(result[0].expenses).toHaveLength(3)
    expect(result[0].total).toBe(60000)
  })
})

// ── Shared payer ────────────────────────────────────

describe('shared payer filtering', () => {
  const mixedExpenses: Expense[] = [
    expense({ id: 's1', amount: 500000, category: 'down_payment', payer: SHARED_PAYER, description: 'Down payment', date: '2025-06-01' }),
    expense({ id: 's2', amount: 150000, category: 'notary_legal', payer: SHARED_PAYER, description: 'Notary', date: '2025-07-15' }),
    expense({ id: 's3', amount: 30000, category: 'home_inspection', payer: 'alice', description: 'Inspection (personal)', date: '2025-07-20' }),
    expense({ id: 's4', amount: 80000, category: 'taxes', payer: 'bob', description: 'Transfer tax', date: '2025-08-01' }),
  ]

  it('filterByPayer returns shared expenses', () => {
    const result = filterByPayer(mixedExpenses, SHARED_PAYER)
    expect(result).toHaveLength(2)
    expect(result.every((e) => e.payer === SHARED_PAYER)).toBe(true)
  })

  it('filterByPayer returns individual expenses alongside shared', () => {
    const alice = filterByPayer(mixedExpenses, 'alice')
    expect(alice).toHaveLength(1)
    expect(alice[0].id).toBe('s3')
  })

  it('applyFilters works with shared payer filter', () => {
    const result = applyFilters(mixedExpenses, { payer: SHARED_PAYER })
    expect(result).toHaveLength(2)
    expect(result.every((e) => e.payer === SHARED_PAYER)).toBe(true)
  })

  it('applyFilters combines shared payer with date range', () => {
    const result = applyFilters(mixedExpenses, {
      payer: SHARED_PAYER,
      dateStart: '2025-07-01',
      dateEnd: '2025-07-31',
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('s2')
  })

  it('shared + individual expenses together cover the full set', () => {
    const shared = filterByPayer(mixedExpenses, SHARED_PAYER)
    const alice = filterByPayer(mixedExpenses, 'alice')
    const bob = filterByPayer(mixedExpenses, 'bob')
    expect(shared.length + alice.length + bob.length).toBe(mixedExpenses.length)
  })

  it('groupExpensesByMonth includes shared expenses', () => {
    const result = groupExpensesByMonth(mixedExpenses)
    const jun = result.find(g => g.key === '2025-06')!
    expect(jun.expenses).toHaveLength(1)
    expect(jun.expenses[0].payer).toBe(SHARED_PAYER)
    expect(jun.total).toBe(500000)
  })

  it('all-shared expenses list works with filters', () => {
    const allShared: Expense[] = [
      expense({ id: 'as1', amount: 100000, payer: SHARED_PAYER, date: '2025-06-01' }),
      expense({ id: 'as2', amount: 200000, payer: SHARED_PAYER, date: '2025-07-01' }),
    ]
    expect(applyFilters(allShared, {})).toHaveLength(2)
    expect(applyFilters(allShared, { payer: SHARED_PAYER })).toHaveLength(2)
    expect(applyFilters(allShared, { payer: 'alice' })).toHaveLength(0)
  })
})

// ── isExpensePaid ──────────────────────────────────

describe('isExpensePaid', () => {
  it('treats undefined paid field as paid (backward compatibility)', () => {
    expect(isExpensePaid(expense())).toBe(true)
  })

  it('treats paid=true as paid', () => {
    expect(isExpensePaid(expense({ paid: true }))).toBe(true)
  })

  it('treats paid=false as unpaid', () => {
    expect(isExpensePaid(expense({ paid: false }))).toBe(false)
  })
})

// ── filterByStatus ─────────────────────────────────

describe('filterByStatus', () => {
  const mixedPaid: Expense[] = [
    expense({ id: 'p1', paid: true }),
    expense({ id: 'p2', paid: false }),
    expense({ id: 'p3' }), // undefined = paid
    expense({ id: 'p4', paid: false }),
  ]

  it('filters paid expenses', () => {
    const result = filterByStatus(mixedPaid, 'paid')
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.id)).toEqual(['p1', 'p3'])
  })

  it('filters unpaid expenses', () => {
    const result = filterByStatus(mixedPaid, 'unpaid')
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.id)).toEqual(['p2', 'p4'])
  })

  it('all paid when none unpaid', () => {
    const allPaid: Expense[] = [
      expense({ id: 'a1', paid: true }),
      expense({ id: 'a2' }),
    ]
    expect(filterByStatus(allPaid, 'paid')).toHaveLength(2)
    expect(filterByStatus(allPaid, 'unpaid')).toHaveLength(0)
  })

  it('all unpaid when all marked false', () => {
    const allUnpaid: Expense[] = [
      expense({ id: 'u1', paid: false }),
      expense({ id: 'u2', paid: false }),
    ]
    expect(filterByStatus(allUnpaid, 'unpaid')).toHaveLength(2)
    expect(filterByStatus(allUnpaid, 'paid')).toHaveLength(0)
  })
})

// ── applyFilters with status ────────────────────────

describe('applyFilters with status', () => {
  const statusExpenses: Expense[] = [
    expense({ id: 's1', payer: 'alice', category: 'notary_legal', date: '2025-07-15', paid: true }),
    expense({ id: 's2', payer: 'alice', category: 'taxes', date: '2025-07-20', paid: false }),
    expense({ id: 's3', payer: 'bob', category: 'notary_legal', date: '2025-08-01', paid: false }),
    expense({ id: 's4', payer: 'bob', category: 'taxes', date: '2025-08-15' }), // undefined = paid
  ]

  it('applies status filter alone', () => {
    expect(applyFilters(statusExpenses, { status: 'paid' })).toHaveLength(2)
    expect(applyFilters(statusExpenses, { status: 'unpaid' })).toHaveLength(2)
  })

  it('returns all when no status filter', () => {
    expect(applyFilters(statusExpenses, {})).toHaveLength(4)
  })

  it('combines status with payer', () => {
    const result = applyFilters(statusExpenses, { status: 'unpaid', payer: 'alice' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('s2')
  })

  it('combines status with category', () => {
    const result = applyFilters(statusExpenses, { status: 'paid', category: 'taxes' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('s4')
  })

  it('combines status with date range', () => {
    const result = applyFilters(statusExpenses, { status: 'unpaid', dateStart: '2025-08-01' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('s3')
  })

  it('all filters combined', () => {
    const result = applyFilters(statusExpenses, {
      status: 'unpaid',
      payer: 'bob',
      dateStart: '2025-08-01',
      dateEnd: '2025-08-31',
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('s3')
  })
})
