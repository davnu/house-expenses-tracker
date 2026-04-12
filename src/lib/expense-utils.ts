import type { Expense, ExpenseCategory } from '@/types/expense'

// ── Month grouping ──────────────────────────────────

export interface ExpenseGroup {
  /** YYYY-MM key, e.g. "2026-04" */
  key: string
  /** Whether this group represents the current calendar month */
  isCurrent: boolean
  /** Expenses within this month, preserving input order */
  expenses: Expense[]
  /** Sum of expense amounts (cents) in this group */
  total: number
}

/**
 * Groups a pre-sorted expense array by calendar month.
 * Returns groups ordered by month (newest-first for 'desc', oldest-first for 'asc').
 * Expenses within each group keep their original order from the input array.
 */
export function groupExpensesByMonth(
  expenses: Expense[],
  sortDir: 'asc' | 'desc' = 'desc'
): ExpenseGroup[] {
  const map = new Map<string, Expense[]>()
  for (const expense of expenses) {
    const key = expense.date.slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(expense)
  }

  const sortedKeys = [...map.keys()].sort((a, b) =>
    sortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
  )

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return sortedKeys.map(key => {
    const monthExpenses = map.get(key)!
    return {
      key,
      isCurrent: key === currentMonth,
      expenses: monthExpenses,
      total: monthExpenses.reduce((s, e) => s + e.amount, 0),
    }
  })
}

// ── Filters ─────────────────────────────────────────

export function filterByPayer(expenses: Expense[], uid: string): Expense[] {
  return expenses.filter((e) => e.payer === uid)
}

export function filterByDateRange(expenses: Expense[], start: string, end: string): Expense[] {
  return expenses.filter((e) => (!start || e.date >= start) && (!end || e.date <= end))
}

export function filterByCategory(expenses: Expense[], category: ExpenseCategory): Expense[] {
  return expenses.filter((e) => e.category === category)
}

export function filterBySearch(expenses: Expense[], query: string, categoryLabels?: Record<string, string>): Expense[] {
  if (!query) return expenses
  const lower = query.toLowerCase()
  return expenses.filter((e) =>
    e.description.toLowerCase().includes(lower) ||
    (categoryLabels?.[e.category] ?? e.category).toLowerCase().includes(lower)
  )
}

export interface DashboardFilters {
  dateStart?: string
  dateEnd?: string
  payer?: string
  category?: ExpenseCategory
}

export function applyFilters(expenses: Expense[], filters: DashboardFilters): Expense[] {
  let result = expenses
  if (filters.dateStart || filters.dateEnd) {
    result = filterByDateRange(result, filters.dateStart ?? '', filters.dateEnd ?? '')
  }
  if (filters.payer) {
    result = filterByPayer(result, filters.payer)
  }
  if (filters.category) {
    result = filterByCategory(result, filters.category)
  }
  return result
}
