import type { Expense, AppSettings } from '@/types/expense'

export interface ExpenseRepository {
  getExpenses(): Promise<Expense[]>
  addExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense>
  updateExpense(id: string, updates: Partial<Expense>): Promise<Expense>
  deleteExpense(id: string): Promise<void>

  getSettings(): Promise<AppSettings>
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>
}
