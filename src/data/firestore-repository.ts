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
import type { ExpenseRepository } from './repository'

// Firestore rejects undefined values — strip them before writing
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T
}

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
    const data = stripUndefined({ ...input, createdAt: now, updatedAt: now })
    const ref = await addDoc(this.col('expenses'), data)
    return { id: ref.id, ...data } as Expense
  }

  async updateExpense(id: string, updates: Partial<Expense>): Promise<Expense> {
    const ref = this.docRef('expenses', id)
    const toUpdate = stripUndefined({ ...updates, updatedAt: new Date().toISOString() })
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
}
