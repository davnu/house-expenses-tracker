import type { Expense, AppSettings } from '@/types/expense'
import type { MortgageConfig } from '@/types/mortgage'
import type { BudgetConfig } from '@/types/budget'
import type { DocFolder, HouseDocument } from '@/types/document'
import type { Todo } from '@/types/todo'
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

  async getBudget(): Promise<BudgetConfig | null> {
    return read<BudgetConfig | null>('house-expenses:budget', null)
  }

  async saveBudget(config: BudgetConfig): Promise<BudgetConfig> {
    const data = { ...config, updatedAt: new Date().toISOString() }
    write('house-expenses:budget', data)
    return data
  }

  async deleteBudget(): Promise<void> {
    localStorage.removeItem('house-expenses:budget')
  }

  // Document stubs — LocalStorage is not used in production (Firestore only)
  async getFolders(): Promise<DocFolder[]> { return [] }
  async addFolder(input: Omit<DocFolder, 'id' | 'createdAt'>): Promise<DocFolder> {
    return { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString() } as DocFolder
  }
  async updateFolder(id: string, updates: Partial<DocFolder>): Promise<DocFolder> {
    return { id, ...updates } as DocFolder
  }
  async deleteFolder(): Promise<void> {}
  async getDocuments(): Promise<HouseDocument[]> { return [] }
  async addDocument(id: string, input: Omit<HouseDocument, 'id' | 'uploadedAt' | 'updatedAt'>): Promise<HouseDocument> {
    const now = new Date().toISOString()
    return { id, ...input, uploadedAt: now, updatedAt: now } as HouseDocument
  }
  async updateDocument(id: string, updates: Partial<HouseDocument>): Promise<HouseDocument> {
    return { id, ...updates } as HouseDocument
  }
  async deleteDocument(): Promise<void> {}

  // Todo stubs — LocalStorage is not used in production (Firestore only)
  async getTodos(): Promise<Todo[]> { return [] }
  async addTodo(input: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>): Promise<Todo> {
    const now = new Date().toISOString()
    return { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now } as Todo
  }
  async updateTodo(id: string, updates: Partial<Todo>): Promise<Todo> {
    return { id, ...updates } as Todo
  }
  async deleteTodo(): Promise<void> {}
}
