import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import type { Expense, Attachment } from '@/types/expense'
import type { ExpenseRepository } from '@/data/repository'
import { FirestoreRepository } from '@/data/firestore-repository'
import { uploadAttachment, uploadAttachmentThumbnail, deleteAttachment, deleteAttachments } from '@/data/firebase-attachment-store'
import { generateThumbnail } from '@/lib/thumbnail'
import { db } from '@/data/firebase'
import { useHousehold } from './HouseholdContext'
import { MAX_FILES_PER_EXPENSE, MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'

interface ExpenseContextValue {
  expenses: Expense[]
  loading: boolean
  storageUsed: number
  pendingExpenseIds: Set<string>
  pendingAttachmentIds: Set<string>
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
  const [pendingExpenseIds, setPendingExpenseIds] = useState<Set<string>>(new Set())
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<Set<string>>(new Set())

  const houseId = house?.id

  // Ref for latest expenses to avoid stale closures in optimistic update callbacks
  const expensesRef = useRef(expenses)
  expensesRef.current = expenses

  const storageUsed = useMemo(() => {
    return expenses.reduce((total, exp) => {
      return total + (exp.attachments ?? []).reduce((sum, a) => sum + a.size, 0)
    }, 0)
  }, [expenses])

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

  const addExpense = useCallback(async (input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!repo) return
    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const tempExpense: Expense = { id: tempId, ...input, createdAt: now, updatedAt: now }

    setPendingExpenseIds((prev) => new Set([...prev, tempId]))
    setExpenses((prev) => [...prev, tempExpense])

    try {
      const real = await repo.addExpense(input)
      setExpenses((prev) => prev.map((e) => e.id === tempId ? real : e))
    } catch (err) {
      setExpenses((prev) => prev.filter((e) => e.id !== tempId))
      throw err
    } finally {
      setPendingExpenseIds((prev) => {
        const next = new Set(prev)
        next.delete(tempId)
        return next
      })
    }
  }, [repo])

  const addExpenseWithFiles = useCallback(async (input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => {
    if (!repo || !houseId) return
    if (files.length > MAX_FILES_PER_EXPENSE) {
      throw new Error(`Maximum ${MAX_FILES_PER_EXPENSE} files per expense`)
    }
    const currentStorageUsed = expensesRef.current.reduce((total, exp) =>
      total + (exp.attachments ?? []).reduce((sum, a) => sum + a.size, 0), 0)
    const newSize = files.reduce((s, f) => s + f.size, 0)
    if (currentStorageUsed + newSize > MAX_HOUSEHOLD_STORAGE) {
      throw new Error('Household storage limit reached')
    }

    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const placeholderAtts: Attachment[] = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      type: f.type,
      size: f.size,
    }))
    const placeholderAttIds = new Set(placeholderAtts.map((p) => p.id))
    const tempExpense: Expense = {
      id: tempId, ...input,
      attachments: placeholderAtts.length > 0 ? placeholderAtts : undefined,
      createdAt: now, updatedAt: now,
    }

    // Optimistic: show expense + pending attachment pills immediately
    setPendingExpenseIds((prev) => new Set([...prev, tempId]))
    if (placeholderAttIds.size > 0) {
      setPendingAttachmentIds((prev) => new Set([...prev, ...placeholderAttIds]))
    }
    setExpenses((prev) => [...prev, tempExpense])

    try {
      // Upload files, reusing placeholder IDs
      const uploaded: Attachment[] = await Promise.all(
        files.map(async (file, i) => {
          const id = placeholderAtts[i].id
          // Generate thumbnail first (~50ms), then upload both in true parallel
          const thumbnailBlob = await generateThumbnail(file)
          const uploads: [Promise<string>, Promise<string | undefined>] = [
            uploadAttachment(houseId, id, file),
            thumbnailBlob
              ? uploadAttachmentThumbnail(houseId, id, thumbnailBlob)
              : Promise.resolve(undefined),
          ]
          const [url, thumbnailUrl] = await Promise.all(uploads)
          return { id, name: file.name, type: file.type, size: file.size, url, thumbnailUrl }
        })
      )
      const real = await repo.addExpense({ ...input, attachments: uploaded.length > 0 ? uploaded : undefined })
      setExpenses((prev) => prev.map((e) => e.id === tempId ? real : e))
    } catch (err) {
      setExpenses((prev) => prev.filter((e) => e.id !== tempId))
      throw err
    } finally {
      setPendingExpenseIds((prev) => {
        const next = new Set(prev)
        next.delete(tempId)
        return next
      })
      if (placeholderAttIds.size > 0) {
        setPendingAttachmentIds((prev) => {
          const next = new Set(prev)
          placeholderAttIds.forEach((id) => next.delete(id))
          return next
        })
      }
    }
  }, [repo, houseId])

  const updateExpense = useCallback(async (id: string, updates: Partial<Expense>) => {
    if (!repo) return
    const previous = expensesRef.current.find((e) => e.id === id)
    if (!previous) return

    // Optimistic: apply updates immediately
    setExpenses((prev) => prev.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    ))

    try {
      const saved = await repo.updateExpense(id, updates)
      setExpenses((prev) => prev.map((e) => e.id === id ? saved : e))
    } catch (err) {
      setExpenses((prev) => prev.map((e) => e.id === id ? previous : e))
      throw err
    }
  }, [repo])

  const deleteExpense = useCallback(async (id: string) => {
    if (!repo || !houseId) return
    const expense = expensesRef.current.find((e) => e.id === id)
    if (!expense) return

    // Optimistic: remove from list immediately
    setExpenses((prev) => prev.filter((e) => e.id !== id))

    try {
      if (expense.attachments?.length) {
        await deleteAttachments(houseId, expense.attachments)
      }
      await repo.deleteExpense(id)
    } catch (err) {
      setExpenses((prev) => [...prev, expense])
      throw err
    }
  }, [repo, houseId])

  const addAttachmentsToExpense = useCallback(async (expenseId: string, files: File[]) => {
    if (!repo || !houseId) return
    const expense = expensesRef.current.find((e) => e.id === expenseId)
    if (!expense) return
    const existingCount = expense.attachments?.length ?? 0
    if (existingCount + files.length > MAX_FILES_PER_EXPENSE) {
      throw new Error(`Maximum ${MAX_FILES_PER_EXPENSE} files per expense`)
    }
    const currentStorageUsed = expensesRef.current.reduce((total, exp) =>
      total + (exp.attachments ?? []).reduce((sum, a) => sum + a.size, 0), 0)
    const newSize = files.reduce((s, f) => s + f.size, 0)
    if (currentStorageUsed + newSize > MAX_HOUSEHOLD_STORAGE) {
      throw new Error('Household storage limit reached')
    }

    // Create placeholder attachments shown immediately with a spinner
    const placeholders: Attachment[] = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      type: f.type,
      size: f.size,
    }))
    const placeholderIdSet = new Set(placeholders.map((p) => p.id))

    // Optimistic: show placeholders in UI
    setExpenses((prev) => prev.map((e) =>
      e.id === expenseId
        ? { ...e, attachments: [...(e.attachments ?? []), ...placeholders] }
        : e
    ))
    setPendingAttachmentIds((prev) => new Set([...prev, ...placeholderIdSet]))

    try {
      // Upload files, reusing placeholder IDs so the pills stay in place
      const uploaded: Attachment[] = await Promise.all(
        files.map(async (file, i) => {
          const id = placeholders[i].id
          const thumbnailBlob = await generateThumbnail(file)
          const uploads: [Promise<string>, Promise<string | undefined>] = [
            uploadAttachment(houseId, id, file),
            thumbnailBlob
              ? uploadAttachmentThumbnail(houseId, id, thumbnailBlob)
              : Promise.resolve(undefined),
          ]
          const [url, thumbnailUrl] = await Promise.all(uploads)
          return { id, name: file.name, type: file.type, size: file.size, url, thumbnailUrl }
        })
      )

      // Replace placeholders with real attachments (now with URLs)
      const allAttachments = [...(expense.attachments ?? []), ...uploaded]
      setExpenses((prev) => prev.map((e) =>
        e.id === expenseId ? { ...e, attachments: allAttachments } : e
      ))

      // Persist to Firestore
      await repo.updateExpense(expenseId, { attachments: allAttachments })
    } catch (err) {
      // Rollback: restore original attachments
      setExpenses((prev) => prev.map((e) =>
        e.id === expenseId ? { ...e, attachments: expense.attachments } : e
      ))
      throw err
    } finally {
      setPendingAttachmentIds((prev) => {
        const next = new Set(prev)
        placeholderIdSet.forEach((id) => next.delete(id))
        return next
      })
    }
  }, [repo, houseId])

  const removeAttachment = useCallback(async (expenseId: string, attachmentId: string) => {
    if (!repo || !houseId) return
    const expense = expensesRef.current.find((e) => e.id === expenseId)
    if (!expense) return
    const att = expense.attachments?.find((a) => a.id === attachmentId)

    // Optimistic: remove from UI immediately
    setExpenses((prev) => prev.map((e) =>
      e.id === expenseId
        ? { ...e, attachments: (e.attachments ?? []).filter((a) => a.id !== attachmentId) }
        : e
    ))

    try {
      if (att) await deleteAttachment(houseId, attachmentId, att.name)
      const updated = (expense.attachments ?? []).filter((a) => a.id !== attachmentId)
      await repo.updateExpense(expenseId, { attachments: updated.length > 0 ? updated : undefined })
    } catch (err) {
      // Rollback: restore original attachments
      setExpenses((prev) => prev.map((e) =>
        e.id === expenseId ? { ...e, attachments: expense.attachments } : e
      ))
      throw err
    }
  }, [repo, houseId])

  return (
    <ExpenseContext.Provider
      value={{
        expenses,
        loading,
        storageUsed,
        pendingExpenseIds,
        pendingAttachmentIds,
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
