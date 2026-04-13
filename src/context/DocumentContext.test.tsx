import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { HouseDocument, DocFolder } from '@/types/document'
import type { ReactNode } from 'react'
import { MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'

// ── Mocks (hoisted) ──

const { mockRepo, mockUploadDocument, mockUploadDocumentThumbnail, mockDeleteDocumentFile, mockGenerateThumbnail } = vi.hoisted(() => {
  const mockRepo = {
    getExpenses: vi.fn(),
    addExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getMortgage: vi.fn(),
    saveMortgage: vi.fn(),
    deleteMortgage: vi.fn(),
    addFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    addDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  }
  return {
    mockRepo,
    mockUploadDocument: vi.fn(),
    mockUploadDocumentThumbnail: vi.fn(),
    mockDeleteDocumentFile: vi.fn(),
    mockGenerateThumbnail: vi.fn(),
  }
})

// Capture onSnapshot callbacks so tests can trigger them
let folderSnapshotCallback: ((snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null = null
let documentSnapshotCallback: ((snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null = null

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  onSnapshot: vi.fn((_query: unknown, callback: (snap: unknown) => void) => {
    // Determine which collection by inspecting call order:
    // First call = folders, second call = documents
    const typedCallback = callback as unknown as typeof folderSnapshotCallback
    if (!folderSnapshotCallback) {
      folderSnapshotCallback = typedCallback
    } else {
      documentSnapshotCallback = typedCallback
    }
    // Fire immediately with empty data
    callback({ docs: [] })
    return vi.fn() // unsubscribe
  }),
}))

vi.mock('@/data/firestore-repository', () => ({
  FirestoreRepository: vi.fn().mockImplementation(function () { return mockRepo }),
}))

vi.mock('@/data/firebase', () => ({ db: {} }))

vi.mock('@/data/firebase-document-store', () => ({
  uploadDocument: mockUploadDocument,
  uploadDocumentThumbnail: mockUploadDocumentThumbnail,
  deleteDocumentFile: mockDeleteDocumentFile,
}))

vi.mock('@/lib/thumbnail', () => ({
  generateThumbnail: mockGenerateThumbnail,
}))

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'alice' } }),
}))

vi.mock('./HouseholdContext', () => ({
  useHousehold: () => ({
    house: { id: 'house-1', name: 'Test House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
  }),
}))

vi.mock('./ExpenseContext', () => ({
  useExpenses: () => ({ storageUsed: 0 }),
}))

import { DocumentProvider, useDocuments } from './DocumentContext'

// ── Helpers ──

function wrapper({ children }: { children: ReactNode }) {
  return <DocumentProvider>{children}</DocumentProvider>
}

function makeFolder(overrides: Partial<DocFolder> = {}): DocFolder {
  return {
    id: 'folder-1',
    name: 'Test Folder',
    icon: '📁',
    order: 0,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'alice',
    ...overrides,
  }
}

function makeDoc(overrides: Partial<HouseDocument> = {}): HouseDocument {
  return {
    id: 'doc-1',
    folderId: 'folder-1',
    name: 'test.pdf',
    type: 'application/pdf',
    size: 5000,
    url: 'https://example.com/test.pdf',
    uploadedBy: 'alice',
    uploadedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function firestoreDoc(obj: Record<string, unknown> & { id: string }) {
  const { id, ...rest } = obj
  return { id, data: () => rest }
}

async function setupHook(folders: DocFolder[] = [], docs: HouseDocument[] = []) {
  // Reset snapshot callbacks
  folderSnapshotCallback = null
  documentSnapshotCallback = null

  const result = renderHook(() => useDocuments(), { wrapper })

  // Wait for initial load
  await act(async () => {})

  // Inject test data via snapshot callbacks
  if (folders.length > 0 || docs.length > 0) {
    await act(async () => {
      folderSnapshotCallback?.({ docs: folders.map(f => firestoreDoc(f as unknown as Record<string, unknown> & { id: string })) })
      documentSnapshotCallback?.({ docs: docs.map(d => firestoreDoc(d as unknown as Record<string, unknown> & { id: string })) })
    })
  }

  return result
}

// ── Tests ──

describe('DocumentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    folderSnapshotCallback = null
    documentSnapshotCallback = null
    mockGenerateThumbnail.mockResolvedValue(null)
    mockUploadDocument.mockResolvedValue('https://example.com/uploaded.pdf')
    mockDeleteDocumentFile.mockResolvedValue(undefined)
    mockRepo.addFolder.mockImplementation(async (input: Partial<DocFolder>) => ({
      id: 'real-folder-id',
      ...input,
      createdAt: '2026-04-12T00:00:00Z',
    }))
    mockRepo.addDocument.mockImplementation(async (id: string, input: Partial<HouseDocument>) => ({
      id,
      ...input,
      uploadedAt: '2026-04-12T00:00:00Z',
      updatedAt: '2026-04-12T00:00:00Z',
    }))
    mockRepo.updateDocument.mockImplementation(async (id: string, updates: Partial<HouseDocument>) => ({
      id,
      ...updates,
      updatedAt: '2026-04-12T00:00:00Z',
    }))
    mockRepo.updateFolder.mockResolvedValue(undefined)
    mockRepo.deleteFolder.mockResolvedValue(undefined)
    mockRepo.deleteDocument.mockResolvedValue(undefined)
  })

  // ── Storage quota ──

  describe('uploadDocuments — storage quota', () => {
    it('throws when upload would exceed household storage limit', async () => {
      const { result } = await setupHook([makeFolder()])

      // Mock useExpenses to report near-full storage
      // Since we can't easily change the mock mid-test, create a large file
      const hugeSize = MAX_HOUSEHOLD_STORAGE + 1

      await expect(
        act(async () => {
          const file = new File([new ArrayBuffer(hugeSize)], 'huge.pdf', { type: 'application/pdf' })
          // Override file size since ArrayBuffer constructor may fail for huge sizes
          Object.defineProperty(file, 'size', { value: hugeSize })
          await result.current.uploadDocuments('folder-1', [file])
        })
      ).rejects.toThrow('storage limit')

      expect(mockUploadDocument).not.toHaveBeenCalled()
    })
  })

  // ── Optimistic updates ──

  describe('renameDocument', () => {
    it('applies rename optimistically, then persists', async () => {
      const doc = makeDoc({ id: 'doc-1', name: 'old-name.pdf' })
      const { result } = await setupHook([makeFolder()], [doc])

      await act(async () => {
        await result.current.renameDocument('doc-1', 'new-name.pdf')
      })

      // Optimistic update applied
      const renamed = result.current.documents.find(d => d.id === 'doc-1')
      expect(renamed?.name).toBe('new-name.pdf')
      expect(mockRepo.updateDocument).toHaveBeenCalledWith('doc-1', { name: 'new-name.pdf' })
    })

    it('rolls back on error', async () => {
      mockRepo.updateDocument.mockRejectedValueOnce(new Error('Network error'))
      const doc = makeDoc({ id: 'doc-1', name: 'original.pdf' })
      const { result } = await setupHook([makeFolder()], [doc])

      await expect(
        act(async () => {
          await result.current.renameDocument('doc-1', 'new-name.pdf')
        })
      ).rejects.toThrow('Network error')

      // Rolled back to original
      const rolledBack = result.current.documents.find(d => d.id === 'doc-1')
      expect(rolledBack?.name).toBe('original.pdf')
    })

    it('does nothing for non-existent document', async () => {
      const { result } = await setupHook([makeFolder()])

      await act(async () => {
        await result.current.renameDocument('nonexistent', 'new-name.pdf')
      })

      expect(mockRepo.updateDocument).not.toHaveBeenCalled()
    })
  })

  describe('moveDocument', () => {
    it('moves document to target folder optimistically', async () => {
      const folders = [makeFolder({ id: 'folder-1' }), makeFolder({ id: 'folder-2', name: 'Other', order: 1 })]
      const doc = makeDoc({ id: 'doc-1', folderId: 'folder-1' })
      const { result } = await setupHook(folders, [doc])

      await act(async () => {
        await result.current.moveDocument('doc-1', 'folder-2')
      })

      const moved = result.current.documents.find(d => d.id === 'doc-1')
      expect(moved?.folderId).toBe('folder-2')
      expect(mockRepo.updateDocument).toHaveBeenCalledWith('doc-1', { folderId: 'folder-2' })
    })

    it('rolls back on error', async () => {
      mockRepo.updateDocument.mockRejectedValueOnce(new Error('Move failed'))
      const folders = [makeFolder({ id: 'folder-1' }), makeFolder({ id: 'folder-2', name: 'Other', order: 1 })]
      const doc = makeDoc({ id: 'doc-1', folderId: 'folder-1' })
      const { result } = await setupHook(folders, [doc])

      await expect(
        act(async () => {
          await result.current.moveDocument('doc-1', 'folder-2')
        })
      ).rejects.toThrow('Move failed')

      const rolledBack = result.current.documents.find(d => d.id === 'doc-1')
      expect(rolledBack?.folderId).toBe('folder-1')
    })

    it('does nothing when target folder does not exist', async () => {
      const doc = makeDoc({ id: 'doc-1', folderId: 'folder-1' })
      const { result } = await setupHook([makeFolder()], [doc])

      await act(async () => {
        await result.current.moveDocument('doc-1', 'nonexistent-folder')
      })

      expect(mockRepo.updateDocument).not.toHaveBeenCalled()
    })
  })

  describe('deleteDocument', () => {
    it('removes document optimistically and deletes storage file', async () => {
      const doc = makeDoc({ id: 'doc-1', name: 'test.pdf' })
      const { result } = await setupHook([makeFolder()], [doc])

      expect(result.current.documents).toHaveLength(1)

      await act(async () => {
        await result.current.deleteDocument('doc-1')
      })

      expect(result.current.documents).toHaveLength(0)
      expect(mockDeleteDocumentFile).toHaveBeenCalledWith('house-1', 'doc-1', 'test.pdf')
      expect(mockRepo.deleteDocument).toHaveBeenCalledWith('doc-1')
    })

    it('rolls back on error', async () => {
      mockRepo.deleteDocument.mockRejectedValueOnce(new Error('Delete failed'))
      const doc = makeDoc({ id: 'doc-1' })
      const { result } = await setupHook([makeFolder()], [doc])

      await expect(
        act(async () => {
          await result.current.deleteDocument('doc-1')
        })
      ).rejects.toThrow('Delete failed')

      // Document restored
      expect(result.current.documents).toHaveLength(1)
    })
  })

  describe('deleteFolder', () => {
    it('deletes folder and all its documents', async () => {
      const folder = makeFolder({ id: 'folder-1' })
      const docs = [
        makeDoc({ id: 'doc-1', folderId: 'folder-1', name: 'a.pdf' }),
        makeDoc({ id: 'doc-2', folderId: 'folder-1', name: 'b.pdf' }),
      ]
      const { result } = await setupHook([folder], docs)

      expect(result.current.folders).toHaveLength(1)
      expect(result.current.documents).toHaveLength(2)

      await act(async () => {
        await result.current.deleteFolder('folder-1')
      })

      // Both folder and documents removed
      expect(result.current.folders).toHaveLength(0)
      expect(result.current.documents).toHaveLength(0)
      // Storage files deleted for each document
      expect(mockDeleteDocumentFile).toHaveBeenCalledTimes(2)
      expect(mockRepo.deleteDocument).toHaveBeenCalledTimes(2)
      expect(mockRepo.deleteFolder).toHaveBeenCalledWith('folder-1')
    })

    it('rolls back folder and documents on error', async () => {
      mockRepo.deleteFolder.mockRejectedValueOnce(new Error('Folder delete failed'))
      const folder = makeFolder({ id: 'folder-1' })
      const docs = [makeDoc({ id: 'doc-1', folderId: 'folder-1' })]
      const { result } = await setupHook([folder], docs)

      await expect(
        act(async () => {
          await result.current.deleteFolder('folder-1')
        })
      ).rejects.toThrow('Folder delete failed')

      // Rolled back
      expect(result.current.folders).toHaveLength(1)
      expect(result.current.documents).toHaveLength(1)
    })
  })

  describe('updateDocumentNotes', () => {
    it('updates notes optimistically', async () => {
      const doc = makeDoc({ id: 'doc-1', notes: undefined })
      const { result } = await setupHook([makeFolder()], [doc])

      await act(async () => {
        await result.current.updateDocumentNotes('doc-1', 'New note')
      })

      const updated = result.current.documents.find(d => d.id === 'doc-1')
      expect(updated?.notes).toBe('New note')
    })

    it('clears notes when empty string is provided (persists as undefined)', async () => {
      const doc = makeDoc({ id: 'doc-1', notes: 'Old note' })
      const { result } = await setupHook([makeFolder()], [doc])

      await act(async () => {
        await result.current.updateDocumentNotes('doc-1', '')
      })

      expect(mockRepo.updateDocument).toHaveBeenCalledWith('doc-1', { notes: undefined })
    })
  })

  describe('documentStorageUsed', () => {
    it('sums sizes of all documents', async () => {
      const docs = [
        makeDoc({ id: 'doc-1', size: 3000 }),
        makeDoc({ id: 'doc-2', size: 7000 }),
      ]
      const { result } = await setupHook([makeFolder()], docs)

      expect(result.current.documentStorageUsed).toBe(10000)
    })

    it('is 0 when no documents', async () => {
      const { result } = await setupHook([makeFolder()])
      expect(result.current.documentStorageUsed).toBe(0)
    })
  })
})
