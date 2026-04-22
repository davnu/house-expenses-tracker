import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import type { Expense, Attachment } from '@/types/expense'
import type { ExpenseRepository, ExpenseUpdate } from '@/data/repository'
import { FirestoreRepository } from '@/data/firestore-repository'
import { uploadAttachment, uploadAttachmentThumbnail, deleteAttachment, deleteAttachments } from '@/data/firebase-attachment-store'
import { uploadBatchWithRollback } from '@/data/upload-batch'
import { generateThumbnail } from '@/lib/thumbnail'
import { db } from '@/data/firebase'
import { useHousehold } from './HouseholdContext'
import { useEntitlement } from '@/hooks/use-entitlement'
import { validateExpenseAttachments, AttachmentValidationError } from '@/lib/attachment-validation'

interface ExpenseContextValue {
  expenses: Expense[]
  loading: boolean
  storageUsed: number
  pendingExpenseIds: Set<string>
  pendingAttachmentIds: Set<string>
  /**
   * Upload progress per pending attachment, keyed by attachment id. Value is
   * a 0–1 fraction. Only populated while an attachment is uploading; entries
   * are removed when the upload settles (success or failure). UI consumers
   * can render a progress ring when a key is present and fall back to a
   * spinner when it's not (e.g. during the pre-upload thumbnail step).
   */
  attachmentProgress: Record<string, number>
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  addExpenseWithFiles: (expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => Promise<void>
  updateExpense: (id: string, updates: ExpenseUpdate) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  addAttachmentsToExpense: (expenseId: string, files: File[]) => Promise<void>
  removeAttachment: (expenseId: string, attachmentId: string) => Promise<void>
  refresh: () => Promise<void>
}

const ExpenseContext = createContext<ExpenseContextValue | null>(null)

/**
 * Upload one attachment atomically: main file + thumbnail go up in parallel,
 * and if either fails after the other succeeded, the partial blob is cleaned
 * up before the error propagates. Callers (both addExpenseWithFiles and
 * addAttachmentsToExpense) treat the returned Attachment as all-or-nothing.
 */
async function uploadAttachmentAtomic(
  houseId: string,
  id: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<Attachment> {
  try {
    // Generate thumbnail first (~50ms, image-only), then upload both in parallel.
    const thumbnailBlob = await generateThumbnail(file)
    const [url, thumbnailUrl] = await Promise.all([
      uploadAttachment(houseId, id, file, onProgress),
      thumbnailBlob ? uploadAttachmentThumbnail(houseId, id, thumbnailBlob) : Promise.resolve(undefined),
    ])
    return { id, name: file.name, type: file.type, size: file.size, url, thumbnailUrl }
  } catch (err) {
    // Main succeeded + thumb failed (or vice versa) leaves a partial blob.
    // deleteAttachment removes both paths and no-ops on missing blobs.
    await deleteAttachment(houseId, id, file.name).catch(() => {})
    throw err
  }
}

export function ExpenseProvider({ children }: { children: ReactNode }) {
  const { house } = useHousehold()
  // ExpenseContext sits ABOVE DocumentContext in the provider tree, so it
  // can't read document bytes from useDocuments(). That means its defense-
  // in-depth check can only see its own expense bytes — enforcing the
  // household quota here would silo expenses and produce the bug where a
  // user at 50/50 from docs could still upload expense attachments.
  // The household-quota gate lives at the UI layer (via useStorageQuota,
  // which sits inside DocumentProvider and has cross-feature visibility)
  // and at the server via the storage-quota Cloud Function. This context
  // still gates per-file size, MIME type, and per-expense count via
  // skipHouseholdQuota: true. The entitlement-loading gate stays for
  // programmatic callers during the cold-start window.
  const { isLoading: entitlementLoading } = useEntitlement()
  const [repo, setRepo] = useState<ExpenseRepository | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingExpenseIds, setPendingExpenseIds] = useState<Set<string>>(new Set())
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<Set<string>>(new Set())
  const [attachmentProgress, setAttachmentProgress] = useState<Record<string, number>>({})

  // Progress tick updater: clamps to [0, 1] and only commits when the fraction
  // crosses a perceptible threshold (every ~4%). Firebase's state_changed fires
  // ~20-50× per upload; without throttling, each tick re-renders every
  // ExpenseContext consumer (Dashboard, Expenses, Summary pages). Users can't
  // see sub-percent changes anyway, so this is a pure render-cost win.
  const setProgressThrottled = useCallback((id: string, fraction: number) => {
    setAttachmentProgress((prev) => {
      const prior = prev[id] ?? 0
      const next = Math.max(0, Math.min(1, fraction))
      // Commit on meaningful movement OR completion
      if (next - prior < 0.04 && next < 1) return prev
      return { ...prev, [id]: next }
    })
  }, [])

  const clearProgress = useCallback((ids: Iterable<string>) => {
    setAttachmentProgress((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
  }, [])

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
      refresh().catch((err) => {
        console.error('Failed to load expenses:', err)
        setLoading(false)
      })
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
    // Block programmatic callers during the entitlement cold-start — the UI
    // already has a matching gate via useStorageQuota().isLoading, so users
    // never hit this path, but it closes the race for non-UI callers.
    if (entitlementLoading) {
      throw new Error('entitlement_loading')
    }
    // Per-file/type/count only. Household-quota is enforced by the UI layer
    // (useStorageQuota — cross-feature total) and the Cloud Function
    // (server-authoritative tier enforcement).
    const { rejection } = validateExpenseAttachments(files, {
      skipHouseholdQuota: true,
    })
    if (rejection) throw new AttachmentValidationError(rejection)

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
      // Upload files atomically per-item (each uploadOne handles its own
      // main/thumbnail partial failure), and roll back orphan blobs if any
      // file in the batch fails. Prevents quota drift from ghost uploads.
      const uploaded = await uploadBatchWithRollback(
        files.map((file, i) => ({ id: placeholderAtts[i].id, file })),
        ({ id, file }) => uploadAttachmentAtomic(houseId, id, file, (f) => setProgressThrottled(id, f)),
        (done) => deleteAttachments(houseId, done.map((a) => ({ id: a.id, name: a.name }))),
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
        clearProgress(placeholderAttIds)
      }
    }
  }, [repo, houseId, entitlementLoading, setProgressThrottled, clearProgress])

  const updateExpense = useCallback(async (id: string, updates: ExpenseUpdate) => {
    if (!repo) return
    const previous = expensesRef.current.find((e) => e.id === id)
    if (!previous) return

    // Optimistic: apply updates immediately. Null on `splits` is the "clear"
    // sentinel — reflect it as undefined locally so UI aggregators read it as absent.
    const optimistic = { ...updates } as Partial<Expense>
    if (updates.splits === null) optimistic.splits = undefined

    setExpenses((prev) => prev.map((e) =>
      e.id === id ? { ...e, ...optimistic, updatedAt: new Date().toISOString() } : e
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
    if (files.length === 0) return
    // See addExpenseWithFiles — block during entitlement cold-start.
    if (entitlementLoading) {
      throw new Error('entitlement_loading')
    }
    const expense = expensesRef.current.find((e) => e.id === expenseId)
    if (!expense) return
    // Per-file/type/count only. See addExpenseWithFiles for why household-
    // quota is not enforced here — UI + Cloud Function own that check.
    const { rejection } = validateExpenseAttachments(files, {
      existingCount: expense.attachments?.length ?? 0,
      skipHouseholdQuota: true,
    })
    if (rejection) throw new AttachmentValidationError(rejection)

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
      // Atomic per-item upload + batch-level rollback. See uploadAttachmentAtomic.
      const uploaded = await uploadBatchWithRollback(
        files.map((file, i) => ({ id: placeholders[i].id, file })),
        ({ id, file }) => uploadAttachmentAtomic(houseId, id, file, (f) => setProgressThrottled(id, f)),
        (done) => deleteAttachments(houseId, done.map((a) => ({ id: a.id, name: a.name }))),
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
      clearProgress(placeholderIdSet)
    }
  }, [repo, houseId, entitlementLoading, setProgressThrottled, clearProgress])

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
        attachmentProgress,
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
