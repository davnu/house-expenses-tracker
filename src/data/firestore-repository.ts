import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  type Firestore,
} from 'firebase/firestore'
import type { Expense, AppSettings } from '@/types/expense'
import type { MortgageConfig } from '@/types/mortgage'
import type { BudgetConfig } from '@/types/budget'
import type { DocFolder, HouseDocument } from '@/types/document'
import type { Todo } from '@/types/todo'
import type { ExpenseRepository } from './repository'
import { stripInvalid } from '@/lib/utils'

const DEFAULT_SETTINGS: AppSettings = {
  currency: 'EUR',
}

export class FirestoreRepository implements ExpenseRepository {
  private db: Firestore
  private houseId: string

  constructor(db: Firestore, houseId: string) {
    this.db = db
    this.houseId = houseId
  }

  private col(name: string) {
    return collection(this.db, 'houses', this.houseId, name)
  }

  private docRef(colName: string, id: string) {
    return doc(this.db, 'houses', this.houseId, colName, id)
  }

  async getExpenses(): Promise<Expense[]> {
    const snap = await getDocs(query(this.col('expenses')))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense)
  }

  async addExpense(input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense> {
    const now = new Date().toISOString()
    const data = stripInvalid({ ...input, createdAt: now, updatedAt: now })
    const ref = await addDoc(this.col('expenses'), data)
    return { id: ref.id, ...data } as Expense
  }

  async updateExpense(id: string, updates: Partial<Expense>): Promise<Expense> {
    const ref = this.docRef('expenses', id)
    const toUpdate = stripInvalid({ ...updates, updatedAt: new Date().toISOString() })
    await updateDoc(ref, toUpdate)
    const snap = await getDoc(ref)
    return { id: snap.id, ...snap.data() } as Expense
  }

  async deleteExpense(id: string): Promise<void> {
    await deleteDoc(this.docRef('expenses', id))
  }

  async getSettings(): Promise<AppSettings> {
    const ref = this.docRef('meta', 'settings')
    const snap = await getDoc(ref)
    if (!snap.exists()) return DEFAULT_SETTINGS
    return snap.data() as AppSettings
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings()
    const updated = { ...current, ...updates }
    const ref = this.docRef('meta', 'settings')
    await setDoc(ref, updated)
    return updated
  }

  async getMortgage(): Promise<MortgageConfig | null> {
    const ref = this.docRef('meta', 'mortgage')
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return snap.data() as MortgageConfig
  }

  async saveMortgage(config: MortgageConfig): Promise<MortgageConfig> {
    const ref = this.docRef('meta', 'mortgage')
    const data = stripInvalid({ ...config, updatedAt: new Date().toISOString() })
    await setDoc(ref, data)
    return data as MortgageConfig
  }

  async deleteMortgage(): Promise<void> {
    await deleteDoc(this.docRef('meta', 'mortgage'))
  }

  // ── Budget ─────────────────────────────────────────────────────────

  async getBudget(): Promise<BudgetConfig | null> {
    const ref = this.docRef('meta', 'budget')
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return snap.data() as BudgetConfig
  }

  async saveBudget(config: BudgetConfig): Promise<BudgetConfig> {
    const ref = this.docRef('meta', 'budget')
    const data = stripInvalid({ ...config, updatedAt: new Date().toISOString() })
    await setDoc(ref, data)
    return data as BudgetConfig
  }

  async deleteBudget(): Promise<void> {
    await deleteDoc(this.docRef('meta', 'budget'))
  }

  // ── Folders ────────────────────────────────────────────────────────

  async getFolders(): Promise<DocFolder[]> {
    const snap = await getDocs(query(this.col('folders')))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DocFolder)
  }

  async addFolder(input: Omit<DocFolder, 'id' | 'createdAt'>): Promise<DocFolder> {
    const now = new Date().toISOString()
    const data = stripInvalid({ ...input, createdAt: now })
    const ref = await addDoc(this.col('folders'), data)
    return { id: ref.id, ...data } as DocFolder
  }

  async updateFolder(id: string, updates: Partial<DocFolder>): Promise<DocFolder> {
    const ref = this.docRef('folders', id)
    const toUpdate = stripInvalid(updates)
    await updateDoc(ref, toUpdate)
    const snap = await getDoc(ref)
    return { id: snap.id, ...snap.data() } as DocFolder
  }

  async deleteFolder(id: string): Promise<void> {
    await deleteDoc(this.docRef('folders', id))
  }

  // ── Documents ──────────────────────────────────────────────────────

  async getDocuments(): Promise<HouseDocument[]> {
    const snap = await getDocs(query(this.col('documents')))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HouseDocument)
  }

  async addDocument(id: string, input: Omit<HouseDocument, 'id' | 'uploadedAt' | 'updatedAt'>): Promise<HouseDocument> {
    const now = new Date().toISOString()
    const data = stripInvalid({ ...input, uploadedAt: now, updatedAt: now })
    const ref = this.docRef('documents', id)
    await setDoc(ref, data)
    return { id, ...data } as HouseDocument
  }

  async updateDocument(id: string, updates: Partial<HouseDocument>): Promise<HouseDocument> {
    const ref = this.docRef('documents', id)
    const toUpdate = stripInvalid({ ...updates, updatedAt: new Date().toISOString() })
    await updateDoc(ref, toUpdate)
    const snap = await getDoc(ref)
    return { id: snap.id, ...snap.data() } as HouseDocument
  }

  async deleteDocument(id: string): Promise<void> {
    await deleteDoc(this.docRef('documents', id))
  }

  // ── Todos ────────────────────────────────────────────────────────

  async getTodos(): Promise<Todo[]> {
    const snap = await getDocs(query(this.col('todos')))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Todo)
  }

  async addTodo(input: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>): Promise<Todo> {
    const now = new Date().toISOString()
    const data = stripInvalid({ ...input, createdAt: now, updatedAt: now })
    const ref = await addDoc(this.col('todos'), data)
    return { id: ref.id, ...data } as Todo
  }

  async updateTodo(id: string, updates: Partial<Todo>): Promise<Todo> {
    const ref = this.docRef('todos', id)
    const toUpdate = stripInvalid({ ...updates, updatedAt: new Date().toISOString() })
    await updateDoc(ref, toUpdate)
    const snap = await getDoc(ref)
    return { id: snap.id, ...snap.data() } as Todo
  }

  async deleteTodo(id: string): Promise<void> {
    await deleteDoc(this.docRef('todos', id))
  }
}
