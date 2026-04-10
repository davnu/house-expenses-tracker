import type { Expense, ExpenseCategory } from '@/types/expense'

export function filterByPayer(expenses: Expense[], uid: string): Expense[] {
  return expenses.filter((e) => e.payer === uid)
}

export function filterByDateRange(expenses: Expense[], start: string, end: string): Expense[] {
  return expenses.filter((e) => e.date >= start && e.date <= end)
}

export function filterByCategory(expenses: Expense[], category: ExpenseCategory): Expense[] {
  return expenses.filter((e) => e.category === category)
}

export interface DashboardFilters {
  dateStart?: string
  dateEnd?: string
  payer?: string
  category?: ExpenseCategory
}

export function applyFilters(expenses: Expense[], filters: DashboardFilters): Expense[] {
  let result = expenses
  if (filters.dateStart && filters.dateEnd) {
    result = filterByDateRange(result, filters.dateStart, filters.dateEnd)
  }
  if (filters.payer) {
    result = filterByPayer(result, filters.payer)
  }
  if (filters.category) {
    result = filterByCategory(result, filters.category)
  }
  return result
}
