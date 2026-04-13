import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import type { DocFolder, HouseDocument } from '@/types/document'
import { DEFAULT_FOLDERS } from '@/types/document'
import type { ExpenseRepository } from '@/data/repository'
import { FirestoreRepository } from '@/data/firestore-repository'
import { uploadDocument, uploadDocumentThumbnail, deleteDocumentFile } from '@/data/firebase-document-store'
import { generateThumbnail } from '@/lib/thumbnail'
import { db } from '@/data/firebase'
import { useAuth } from './AuthContext'
import { useHousehold } from './HouseholdContext'
import { useExpenses } from './ExpenseContext'
import { MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'

interface DocumentContextValue {
  folders: DocFolder[]
  documents: HouseDocument[]
  loading: boolean
  documentStorageUsed: number
  totalStorageUsed: number
  pendingDocumentIds: Set<string>
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
  const { user } = useAuth()
  const { house } = useHousehold()
  const { storageUsed: expenseStorageUsed } = useExpenses()
  const [repo, setRepo] = useState<ExpenseRepository | null>(null)
  const [folders, setFolders] = useState<DocFolder[]>([])
  const [documents, setDocuments] = useState<HouseDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDocumentIds, setPendingDocumentIds] = useState<Set<string>>(new Set())

  const houseId = house?.id

  const foldersRef = useRef(folders)
  foldersRef.current = folders
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
      setFolders([])
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

        // Seed default folders on first load if collection is empty
        if (serverFolders.length === 0 && !foldersLoaded && !seedingRef.current) {
          seedingRef.current = true
          try {
            await Promise.all(
              DEFAULT_FOLDERS.map((def) => repo.addFolder({ ...def, createdBy: user?.uid ?? '' }))
            )
            // onSnapshot will fire again with the seeded folders
          } catch {
            seedingRef.current = false
          }
          foldersLoaded = true
          markReady()
          return
        }

        setFolders(serverFolders)
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
      }
    )

    return () => {
      unsubFolders()
      unsubDocuments()
    }
  }, [houseId, repo, user?.uid])

  const addFolder = useCallback(async (name: string, icon: string, description?: string): Promise<DocFolder> => {
    if (!repo) throw new Error('No repository')
    const maxOrder = foldersRef.current.reduce((max, f) => Math.max(max, f.order), -1)
    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const temp: DocFolder = { id: tempId, name, icon, description, order: maxOrder + 1, createdAt: now, createdBy: user?.uid ?? '' }

    setFolders((prev) => [...prev, temp])

    try {
      const real = await repo.addFolder({ name, icon, description, order: maxOrder + 1, createdBy: user?.uid ?? '' })
      setFolders((prev) => prev.filter((f) => f.id !== tempId))
      return real
    } catch (err) {
      setFolders((prev) => prev.filter((f) => f.id !== tempId))
      throw err
    }
  }, [repo, user?.uid])

  const updateFolder = useCallback(async (id: string, updates: Partial<DocFolder>) => {
    if (!repo) return
    const previous = foldersRef.current.find((f) => f.id === id)
    if (!previous) return

    // Optimistic: apply immediately, onSnapshot will confirm
    setFolders((prev) => prev.map((f) => f.id === id ? { ...f, ...updates } : f))

    try {
      await repo.updateFolder(id, updates)
    } catch (err) {
      setFolders((prev) => prev.map((f) => f.id === id ? previous : f))
      throw err
    }
  }, [repo])

  const deleteFolder = useCallback(async (id: string) => {
    if (!repo || !houseId) return
    const folderDocs = documentsRef.current.filter((d) => d.folderId === id)
    const previousFolders = foldersRef.current
    const previousDocs = documentsRef.current

    // Optimistic: remove folder and its documents
    setFolders((prev) => prev.filter((f) => f.id !== id))
    setDocuments((prev) => prev.filter((d) => d.folderId !== id))

    try {
      for (const doc of folderDocs) {
        await deleteDocumentFile(houseId, doc.id, doc.name)
        await repo.deleteDocument(doc.id)
      }
      await repo.deleteFolder(id)
    } catch (err) {
      setFolders(previousFolders)
      setDocuments(previousDocs)
      throw err
    }
  }, [repo, houseId])

  const uploadDocuments = useCallback(async (folderId: string, files: File[]) => {
    if (!repo || !houseId) return

    const newSize = files.reduce((s, f) => s + f.size, 0)
    const currentTotal = expenseStorageUsed + documentsRef.current.reduce((t, d) => t + d.size, 0)
    if (currentTotal + newSize > MAX_HOUSEHOLD_STORAGE) {
      throw new Error('Household storage limit reached')
    }

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
      await Promise.all(
        files.map(async (file) => {
          const docId = crypto.randomUUID()
          // Generate thumbnail first (~50ms), then upload both in true parallel
          const thumbnailBlob = await generateThumbnail(file)
          const uploads: [Promise<string>, Promise<string | undefined>] = [
            uploadDocument(houseId, docId, file),
            thumbnailBlob
              ? uploadDocumentThumbnail(houseId, docId, thumbnailBlob)
              : Promise.resolve(undefined),
          ]
          const [url, thumbnailUrl] = await Promise.all(uploads)
          await repo.addDocument(docId, {
            folderId,
            name: file.name,
            type: file.type,
            size: file.size,
            url,
            thumbnailUrl,
            uploadedBy: user?.uid ?? '',
          })
          // onSnapshot will pick up the real document
        })
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
    }
  }, [repo, houseId, user?.uid, expenseStorageUsed])

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
