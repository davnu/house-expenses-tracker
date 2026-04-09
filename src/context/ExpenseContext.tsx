import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Expense, Attachment } from '@/types/expense'
import type { ExpenseRepository } from '@/data/repository'
import { FirestoreRepository } from '@/data/firestore-repository'
import { uploadAttachment, deleteAttachment, deleteAttachments } from '@/data/firebase-attachment-store'
import { db } from '@/data/firebase'
import { useHousehold } from './HouseholdContext'

interface ExpenseContextValue {
  expenses: Expense[]
  loading: boolean
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  addExpenseWithFiles: (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => Promise<void>
  updateExpense: (id: string, updates: Partial<Expense>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  addAttachmentsToExpense: (expenseId: string, files: File[]) => Promise<void>
  removeAttachment: (expenseId: string, attachmentId: string) => Promise<void>
  refresh: () => Promise<void>
}

const ExpenseContext = createContext<ExpenseContextValue | null>(null)

export function ExpenseProvider({ children }: { children: ReactNode }) {
  const { house } = useHousehold()
  const [repo, setRepo] = useState<ExpenseRepository | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const houseId = house?.id

  useEffect(() => {
    if (houseId) {
      setRepo(new FirestoreRepository(db, houseId))
    } else {
      setRepo(null)
      setExpenses([])
    }
  }, [houseId])

  const refresh = useCallback(async () => {
    if (!repo) return
    const exp = await repo.getExpenses()
    setExpenses(exp)
    setLoading(false)
  }, [repo])

  useEffect(() => {
    if (repo) {
      setLoading(true)
      refresh()
    }
  }, [repo, refresh])

  const filesToAttachments = useCallback(async (files: File[]): Promise<Attachment[]> => {
    if (!houseId) throw new Error('No house')
    return Promise.all(
      files.map(async (file) => {
        const id = crypto.randomUUID()
        const url = await uploadAttachment(houseId, id, file)
        return { id, name: file.name, type: file.type, size: file.size, url }
      })
    )
  }, [houseId])

  const addExpense = useCallback(async (input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!repo) return
    await repo.addExpense(input)
    await refresh()
  }, [repo, refresh])

  const addExpenseWithFiles = useCallback(async (input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => {
    if (!repo) return
    const attachments = files.length > 0 ? await filesToAttachments(files) : undefined
    await repo.addExpense({ ...input, attachments })
    await refresh()
  }, [repo, refresh, filesToAttachments])

  const updateExpense = useCallback(async (id: string, updates: Partial<Expense>) => {
    if (!repo) return
    await repo.updateExpense(id, updates)
    await refresh()
  }, [repo, refresh])

  const deleteExpense = useCallback(async (id: string) => {
    if (!repo || !houseId) return
    const expense = expenses.find((e) => e.id === id)
    if (expense?.attachments?.length) {
      await deleteAttachments(houseId, expense.attachments)
    }
    await repo.deleteExpense(id)
    await refresh()
  }, [repo, houseId, expenses, refresh])

  const addAttachmentsToExpense = useCallback(async (expenseId: string, files: File[]) => {
    if (!repo) return
    const expense = expenses.find((e) => e.id === expenseId)
    if (!expense) return
    const newAttachments = await filesToAttachments(files)
    const all = [...(expense.attachments ?? []), ...newAttachments]
    await repo.updateExpense(expenseId, { attachments: all })
    await refresh()
  }, [repo, expenses, refresh, filesToAttachments])

  const removeAttachment = useCallback(async (expenseId: string, attachmentId: string) => {
    if (!repo || !houseId) return
    const expense = expenses.find((e) => e.id === expenseId)
    if (!expense) return
    const att = expense.attachments?.find((a) => a.id === attachmentId)
    if (att) {
      await deleteAttachment(houseId, attachmentId, att.name)
    }
    const updated = (expense.attachments ?? []).filter((a) => a.id !== attachmentId)
    await repo.updateExpense(expenseId, { attachments: updated.length > 0 ? updated : undefined })
    await refresh()
  }, [repo, houseId, expenses, refresh])

  return (
    <ExpenseContext.Provider
      value={{
        expenses,
        loading,
        addExpense,
        addExpenseWithFiles,
        updateExpense,
        deleteExpense,
        addAttachmentsToExpense,
        removeAttachment,
        refresh,
      }}
    >
      {children}
    </ExpenseContext.Provider>
  )
}

export function useExpenses() {
  const ctx = useContext(ExpenseContext)
  if (!ctx) throw new Error('useExpenses must be used within ExpenseProvider')
  return ctx
}
