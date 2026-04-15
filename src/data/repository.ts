import type { Expense, AppSettings } from '@/types/expense'
import type { MortgageConfig } from '@/types/mortgage'
import type { BudgetConfig } from '@/types/budget'
import type { DocFolder, HouseDocument } from '@/types/document'
import type { Todo } from '@/types/todo'

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

  getBudget(): Promise<BudgetConfig | null>
  saveBudget(config: BudgetConfig): Promise<BudgetConfig>
  deleteBudget(): Promise<void>

  getFolders(): Promise<DocFolder[]>
  addFolder(folder: Omit<DocFolder, 'id' | 'createdAt'>): Promise<DocFolder>
  updateFolder(id: string, updates: Partial<DocFolder>): Promise<DocFolder>
  deleteFolder(id: string): Promise<void>

  getDocuments(): Promise<HouseDocument[]>
  addDocument(id: string, doc: Omit<HouseDocument, 'id' | 'uploadedAt' | 'updatedAt'>): Promise<HouseDocument>
  updateDocument(id: string, updates: Partial<HouseDocument>): Promise<HouseDocument>
  deleteDocument(id: string): Promise<void>

  getTodos(): Promise<Todo[]>
  addTodo(todo: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>): Promise<Todo>
  updateTodo(id: string, updates: Partial<Todo>): Promise<Todo>
  deleteTodo(id: string): Promise<void>
}
