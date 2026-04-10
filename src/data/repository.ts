import type { Expense, AppSettings } from '@/types/expense'
import type { MortgageConfig } from '@/types/mortgage'

export interface ExpenseRepository {
  getExpenses(): Promise<Expense[]>
  addExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense>
  updateExpense(id: string, updates: Partial<Expense>): Promise<Expense>
  deleteExpense(id: string): Promise<void>

  getSettings(): Promise<AppSettings>
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>

  getMortgage(): Promise<MortgageConfig | null>
  saveMortgage(config: MortgageConfig): Promise<MortgageConfig>
  deleteMortgage(): Promise<void>
}
