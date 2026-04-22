import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { useTranslation } from 'react-i18next'
import type { DocFolder, HouseDocument } from '@/types/document'
import { getDefaultFolders } from '@/types/document'
import type { ExpenseRepository } from '@/data/repository'
import { FirestoreRepository } from '@/data/firestore-repository'
import { uploadDocument, uploadDocumentThumbnail, deleteDocumentFile, deleteDocumentFiles } from '@/data/firebase-document-store'
import { uploadBatchWithRollback } from '@/data/upload-batch'
import { generateThumbnail } from '@/lib/thumbnail'
import { db } from '@/data/firebase'
import { useAuth } from './AuthContext'
import { useHousehold } from './HouseholdContext'
import { useExpenses } from './ExpenseContext'
import { useEntitlement } from '@/hooks/use-entitlement'
import { maxBytesForLimits } from '@/lib/entitlement-limits'
import { validateDocumentFiles, AttachmentValidationError } from '@/lib/attachment-validation'

interface DocumentContextValue {
  folders: DocFolder[]
  documents: HouseDocument[]
  loading: boolean
  documentStorageUsed: number
  totalStorageUsed: number
  pendingDocumentIds: Set<string>
  /** Upload progress per pending placeholder id; 0–1 fraction. See ExpenseContext.attachmentProgress. */
  documentProgress: Record<string, number>
  addFolder: (name: string, icon: string, description?: string) => Promise<DocFolder>
  updateFolder: (id: string, updates: Partial<DocFolder>) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  uploadDocuments: (folderId: string, files: File[]) => Promise<void>
  renameDocument: (id: string, name: string) => Promise<void>
  updateDocumentNotes: (id: string, notes: string) => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  moveDocument: (id: string, targetFolderId: string) => Promise<void>
}

const DocumentContext = createContext<DocumentContextValue | null>(null)

export function DocumentProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { house } = useHousehold()
  const { storageUsed: expenseStorageUsed } = useExpenses()
  const { limits, isLoading: entitlementLoading } = useEntitlement()
  const maxHouseholdBytes = maxBytesForLimits(limits)
  const [repo, setRepo] = useState<ExpenseRepository | null>(null)
  const [rawFolders, setRawFolders] = useState<DocFolder[]>([])
  const [documents, setDocuments] = useState<HouseDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDocumentIds, setPendingDocumentIds] = useState<Set<string>>(new Set())
  const [documentProgress, setDocumentProgress] = useState<Record<string, number>>({})

  // See ExpenseContext.setProgressThrottled: sub-4% movements are imperceptible,
  // and Firebase fires state_changed on every chunk — without throttling we
  // pay a re-render of every DocumentContext consumer per tick.
  const setProgressThrottled = useCallback((id: string, fraction: number) => {
    setDocumentProgress((prev) => {
      const prior = prev[id] ?? 0
      const next = Math.max(0, Math.min(1, fraction))
      if (next - prior < 0.04 && next < 1) return prev
      return { ...prev, [id]: next }
    })
  }, [])

  const clearProgress = useCallback((ids: Iterable<string>) => {
    setDocumentProgress((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
  }, [])

  const houseId = house?.id

  // Resolve translated names for default folders; custom folders pass through as-is.
  // Depends on `t` which changes reference on language switch → auto-recomputes.
  // Note: translationKey can be null (cleared on rename) or undefined (custom folders) —
  // both are falsy, so the folder passes through with its literal stored name.
  const folders = useMemo(() => rawFolders.map((f) => {
    if (!f.translationKey) return f
    return {
      ...f,
      name: t(`defaultFolders.${f.translationKey}.name`),
      description: t(`defaultFolders.${f.translationKey}.description`),
    }
  }), [rawFolders, t])

  // Refs track raw data for optimistic updates and rollbacks
  const foldersRef = useRef(rawFolders)
  foldersRef.current = rawFolders
  const documentsRef = useRef(documents)
  documentsRef.current = documents

  // Track whether we've already seeded default folders to prevent double-seeding
  const seedingRef = useRef(false)

  const documentStorageUsed = useMemo(
    () => documents.reduce((total, d) => total + d.size, 0),
    [documents]
  )

  const totalStorageUsed = expenseStorageUsed + documentStorageUsed

  // Create repo when house changes
  useEffect(() => {
    if (houseId) {
      setRepo(new FirestoreRepository(db, houseId))
    } else {
      setRepo(null)
      setRawFolders([])
      setDocuments([])
      setLoading(false)
    }
  }, [houseId])

  // Real-time listeners for folders + documents (follows HouseholdContext pattern)
  useEffect(() => {
    if (!houseId || !repo) {
      setLoading(false)
      return
    }

    setLoading(true)
    let foldersLoaded = false
    let documentsLoaded = false

    const markReady = () => {
      if (foldersLoaded && documentsLoaded) setLoading(false)
    }

    // Folders listener
    const unsubFolders = onSnapshot(
      query(collection(db, 'houses', houseId, 'folders')),
      async (snap) => {
        const serverFolders = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DocFolder)

        // Seed default folders on first load if collection is empty (fallback for legacy houses)
        if (serverFolders.length === 0 && !foldersLoaded && !seedingRef.current) {
          seedingRef.current = true
          try {
            const seeded = await Promise.all(
              getDefaultFolders().map((def) => repo.addFolder({ ...def, createdBy: user?.uid ?? '' }))
            )
            setRawFolders(seeded)
          } catch (err) {
            console.error('Default folder seeding failed:', err)
            seedingRef.current = false
          }
          foldersLoaded = true
          markReady()
          return
        }

        setRawFolders(serverFolders)
        foldersLoaded = true
        markReady()
      },
      (error) => {
        console.error('Folders listener error:', error)
        foldersLoaded = true
        markReady()
      }
    )

    // Documents listener
    const unsubDocuments = onSnapshot(
      query(collection(db, 'houses', houseId, 'documents')),
      (snap) => {
        const serverDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HouseDocument)

        // Merge with pending placeholders (temp IDs that haven't been persisted yet)
        setDocuments((prev) => {
          const pendingDocs = prev.filter((d) => d.id.startsWith('temp-'))
          const serverIds = new Set(serverDocs.map((d) => d.id))
          // Keep placeholders that aren't yet on the server
          const stillPending = pendingDocs.filter((d) => !serverIds.has(d.id))
          return [...serverDocs, ...stillPending]
        })
        documentsLoaded = true
        markReady()
      },
      (error) => {
        console.error('Documents listener error:', error)
        documentsLoaded = true
        markReady()
      }
    )

    return () => {
      unsubFolders()
      unsubDocuments()
      seedingRef.current = false
    }
  }, [houseId, repo, user?.uid])

  const addFolder = useCallback(async (name: string, icon: string, description?: string): Promise<DocFolder> => {
    if (!repo) throw new Error('No repository')
    const maxOrder = foldersRef.current.reduce((max, f) => Math.max(max, f.order), -1)
    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const temp: DocFolder = { id: tempId, name, icon, description, order: maxOrder + 1, createdAt: now, createdBy: user?.uid ?? '' }

    setRawFolders((prev) => [...prev, temp])

    try {
      const real = await repo.addFolder({ name, icon, description, order: maxOrder + 1, createdBy: user?.uid ?? '' })
      setRawFolders((prev) => prev.filter((f) => f.id !== tempId))
      return real
    } catch (err) {
      setRawFolders((prev) => prev.filter((f) => f.id !== tempId))
      throw err
    }
  }, [repo, user?.uid])

  const updateFolder = useCallback(async (id: string, updates: Partial<DocFolder>) => {
    if (!repo) return
    const previous = foldersRef.current.find((f) => f.id === id)
    if (!previous) return

    // For default folders (with translationKey), compare submitted name/description
    // against their current translated values. Only clear translationKey if the user
    // actually changed them — changing just the icon should preserve translation.
    // Uses null (not undefined) because stripInvalid strips undefined but preserves null,
    // and Firestore accepts null — this overwrites the stored key in the database.
    if (previous.translationKey) {
      const translatedName = t(`defaultFolders.${previous.translationKey}.name`)
      const translatedDesc = t(`defaultFolders.${previous.translationKey}.description`)
      const nameChanged = 'name' in updates && updates.name !== translatedName
      const descChanged = 'description' in updates && updates.description !== translatedDesc
      if (nameChanged || descChanged) {
        updates = { ...updates, translationKey: null }
      } else {
        // Name/description unchanged — strip them to avoid overwriting raw Firestore data
        // with the current language's translated string
        const cleaned = { ...updates }
        if ('name' in cleaned && cleaned.name === translatedName) delete cleaned.name
        if ('description' in cleaned && cleaned.description === translatedDesc) delete cleaned.description
        updates = cleaned
      }
    }

    // Optimistic: apply immediately, onSnapshot will confirm
    setRawFolders((prev) => prev.map((f) => f.id === id ? { ...f, ...updates } : f))

    try {
      await repo.updateFolder(id, updates)
    } catch (err) {
      setRawFolders((prev) => prev.map((f) => f.id === id ? previous : f))
      throw err
    }
  }, [repo, t])

  const deleteFolder = useCallback(async (id: string) => {
    if (!repo || !houseId) return
    const folderDocs = documentsRef.current.filter((d) => d.folderId === id)
    const previousFolders = foldersRef.current
    const previousDocs = documentsRef.current

    // Optimistic: remove folder and its documents
    setRawFolders((prev) => prev.filter((f) => f.id !== id))
    setDocuments((prev) => prev.filter((d) => d.folderId !== id))

    try {
      for (const doc of folderDocs) {
        await deleteDocumentFile(houseId, doc.id, doc.name)
        await repo.deleteDocument(doc.id)
      }
      await repo.deleteFolder(id)
    } catch (err) {
      setRawFolders(previousFolders)
      setDocuments(previousDocs)
      throw err
    }
  }, [repo, houseId])

  const uploadDocuments = useCallback(async (folderId: string, files: File[]) => {
    if (!repo || !houseId) return
    if (files.length === 0) return

    // Block uploads during the cold-start window where entitlement hasn't
    // resolved yet — otherwise a Pro user hitting upload in the first few
    // hundred ms silently gets the free-tier 50 MB cap from the fallback.
    if (entitlementLoading) {
      throw new Error('entitlement_loading')
    }

    const currentTotal = expenseStorageUsed + documentsRef.current.reduce((t, d) => t + d.size, 0)
    // Defense-in-depth: DocumentDropZone validates first, but re-check here
    // so the contract holds for any future caller (bulk import, mobile
    // wrapper, etc.). Pass the tier's quota so Pro houses aren't capped at
    // the free-tier default.
    const { rejection } = validateDocumentFiles(files, {
      householdStorageUsed: currentTotal,
      maxHouseholdBytes,
    })
    if (rejection) throw new AttachmentValidationError(rejection)

    // Create placeholders with temp IDs for immediate UI feedback
    const placeholders: HouseDocument[] = files.map((f) => ({
      id: `temp-${crypto.randomUUID()}`,
      folderId,
      name: f.name,
      type: f.type,
      size: f.size,
      url: '',
      uploadedBy: user?.uid ?? '',
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
    const placeholderIds = new Set(placeholders.map((p) => p.id))

    setDocuments((prev) => [...prev, ...placeholders])
    setPendingDocumentIds((prev) => new Set([...prev, ...placeholderIds]))

    try {
      // Atomic per-item upload + batch-level rollback of successful blobs.
      // If any item fails, already-uploaded Storage blobs are deleted so the
      // household quota doesn't drift from actual bytes in Storage.
      // Pair the placeholder id with the real doc id so onProgress can update
      // the placeholder the UI is rendering, not the post-upload doc id.
      await uploadBatchWithRollback(
        files.map((file, i) => ({ docId: crypto.randomUUID(), placeholderId: placeholders[i].id, file })),
        async ({ docId, placeholderId, file }) => {
          try {
            const thumbnailBlob = await generateThumbnail(file)
            const [url, thumbnailUrl] = await Promise.all([
              uploadDocument(houseId, docId, file, (f) => setProgressThrottled(placeholderId, f)),
              thumbnailBlob ? uploadDocumentThumbnail(houseId, docId, thumbnailBlob) : Promise.resolve(undefined),
            ])
            await repo.addDocument(docId, {
              folderId,
              name: file.name,
              type: file.type,
              size: file.size,
              url,
              thumbnailUrl,
              uploadedBy: user?.uid ?? '',
            })
            return { id: docId, name: file.name }
          } catch (err) {
            // Clean up whatever partially succeeded within this item
            // (main or thumb blob). The Firestore write is transactional —
            // if addDocument threw, no doc was created, so nothing to undo.
            await deleteDocumentFile(houseId, docId, file.name).catch(() => {})
            throw err
          }
        },
        (done) => deleteDocumentFiles(houseId, done),
      )

      // Remove placeholders — onSnapshot already added the real docs
      setDocuments((prev) => prev.filter((d) => !placeholderIds.has(d.id)))
    } catch (err) {
      setDocuments((prev) => prev.filter((d) => !placeholderIds.has(d.id)))
      throw err
    } finally {
      setPendingDocumentIds((prev) => {
        const next = new Set(prev)
        placeholderIds.forEach((id) => next.delete(id))
        return next
      })
      clearProgress(placeholderIds)
    }
  }, [repo, houseId, user?.uid, expenseStorageUsed, maxHouseholdBytes, entitlementLoading, setProgressThrottled, clearProgress])

  const renameDocument = useCallback(async (id: string, name: string) => {
    if (!repo) return
    const previous = documentsRef.current.find((d) => d.id === id)
    if (!previous) return

    setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, name } : d))

    try {
      await repo.updateDocument(id, { name })
    } catch (err) {
      setDocuments((prev) => prev.map((d) => d.id === id ? previous : d))
      throw err
    }
  }, [repo])

  const updateDocumentNotes = useCallback(async (id: string, notes: string) => {
    if (!repo) return
    const previous = documentsRef.current.find((d) => d.id === id)
    if (!previous) return

    setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, notes } : d))

    try {
      await repo.updateDocument(id, { notes: notes || undefined })
    } catch (err) {
      setDocuments((prev) => prev.map((d) => d.id === id ? previous : d))
      throw err
    }
  }, [repo])

  const deleteDocument = useCallback(async (id: string) => {
    if (!repo || !houseId) return
    const doc = documentsRef.current.find((d) => d.id === id)
    if (!doc) return

    setDocuments((prev) => prev.filter((d) => d.id !== id))

    try {
      await deleteDocumentFile(houseId, doc.id, doc.name)
      await repo.deleteDocument(id)
    } catch (err) {
      setDocuments((prev) => [...prev, doc])
      throw err
    }
  }, [repo, houseId])

  const moveDocument = useCallback(async (id: string, targetFolderId: string) => {
    if (!repo) return
    if (!foldersRef.current.some((f) => f.id === targetFolderId)) return
    const previous = documentsRef.current.find((d) => d.id === id)
    if (!previous) return

    setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, folderId: targetFolderId } : d))

    try {
      await repo.updateDocument(id, { folderId: targetFolderId })
    } catch (err) {
      setDocuments((prev) => prev.map((d) => d.id === id ? previous : d))
      throw err
    }
  }, [repo])

  return (
    <DocumentContext.Provider
      value={{
        folders,
        documents,
        loading,
        documentStorageUsed,
        totalStorageUsed,
        pendingDocumentIds,
        documentProgress,
        addFolder,
        updateFolder,
        deleteFolder,
        uploadDocuments,
        renameDocument,
        updateDocumentNotes,
        deleteDocument,
        moveDocument,
      }}
    >
      {children}
    </DocumentContext.Provider>
  )
}

export function useDocuments() {
  const ctx = useContext(DocumentContext)
  if (!ctx) throw new Error('useDocuments must be used within DocumentProvider')
  return ctx
}
