import type { Expense, AppSettings } from '@/types/expense'
import type { MortgageConfig } from '@/types/mortgage'
import type { ExpenseRepository } from './repository'
import { deleteAttachmentBlobs } from './attachment-store'

const KEYS = {
  expenses: 'house-expenses:expenses',
  settings: 'house-expenses:settings',
}

const DEFAULT_SETTINGS: AppSettings = {
  currency: 'EUR',
}

function read<T>(key: string, fallback: T): T {
  const data = localStorage.getItem(key)
  if (!data) return fallback
  return JSON.parse(data) as T
}

function write<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data))
}

export class LocalStorageRepository implements ExpenseRepository {
  async getExpenses(): Promise<Expense[]> {
    return read<Expense[]>(KEYS.expenses, [])
  }

  async addExpense(input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense> {
    const expenses = await this.getExpenses()
    const now = new Date().toISOString()
    const expense: Expense = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    expenses.push(expense)
    write(KEYS.expenses, expenses)
    return expense
  }

  async updateExpense(id: string, updates: Partial<Expense>): Promise<Expense> {
    const expenses = await this.getExpenses()
    const index = expenses.findIndex((e) => e.id === id)
    if (index === -1) throw new Error(`Expense ${id} not found`)
    expenses[index] = { ...expenses[index], ...updates, updatedAt: new Date().toISOString() }
    write(KEYS.expenses, expenses)
    return expenses[index]
  }

  async deleteExpense(id: string): Promise<void> {
    const expenses = await this.getExpenses()
    const expense = expenses.find((e) => e.id === id)
    if (expense?.attachments?.length) {
      await deleteAttachmentBlobs(expense.attachments.map((a) => a.id))
    }
    write(KEYS.expenses, expenses.filter((e) => e.id !== id))
  }

  async getSettings(): Promise<AppSettings> {
    return read<AppSettings>(KEYS.settings, DEFAULT_SETTINGS)
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const settings = await this.getSettings()
    const updated = { ...settings, ...updates }
    write(KEYS.settings, updated)
    return updated
  }

  async getMortgage(): Promise<MortgageConfig | null> {
    return read<MortgageConfig | null>('house-expenses:mortgage', null)
  }

  async saveMortgage(config: MortgageConfig): Promise<MortgageConfig> {
    write('house-expenses:mortgage', config)
    return config
  }

  async deleteMortgage(): Promise<void> {
    localStorage.removeItem('house-expenses:mortgage')
  }
}
