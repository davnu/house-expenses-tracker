import type { ExpenseCategory } from './expense'

export interface BudgetConfig {
  totalBudget: number                                    // cents — overall cap
  categories: Partial<Record<ExpenseCategory, number>>   // category → cents
  updatedAt: string                                      // ISO 8601
}
