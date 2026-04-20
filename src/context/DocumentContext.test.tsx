import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { HouseDocument, DocFolder } from '@/types/document'
import type { ReactNode } from 'react'
import { MAX_FILE_SIZE } from '@/lib/constants'

// ── Mocks (hoisted) ──

const { mockRepo, mockUploadDocument, mockUploadDocumentThumbnail, mockDeleteDocumentFile, mockDeleteDocumentFiles, mockGenerateThumbnail } = vi.hoisted(() => {
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
    mockDeleteDocumentFiles: vi.fn(),
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
  deleteDocumentFiles: mockDeleteDocumentFiles,
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
import { sizedFile } from '@/test-utils/files'

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
    mockDeleteDocumentFiles.mockResolvedValue(undefined)
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

  describe('uploadDocuments — defensive validation', () => {
    it('rejects files exceeding MAX_FILE_SIZE with a specific validation error', async () => {
      // The old test passed a 50 MB+1 file; the validator now (correctly)
      // rejects it on per-file-size first, not household quota. That's the
      // same class of bug the user reported — catching it at the context
      // layer means no upload is attempted.
      const { result } = await setupHook([makeFolder()])
      const big = sizedFile('big.pdf', 'application/pdf', MAX_FILE_SIZE + 1)

      await expect(
        act(async () => { await result.current.uploadDocuments('folder-1', [big]) })
      ).rejects.toMatchObject({ reason: { code: 'exceedsLimit' } })

      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('rejects files with unsupported MIME type at the context layer', async () => {
      const { result } = await setupHook([makeFolder()])
      const bad = new File(['x'], 'archive.zip', { type: 'application/zip' })

      await expect(
        act(async () => { await result.current.uploadDocuments('folder-1', [bad]) })
      ).rejects.toMatchObject({ reason: { code: 'unsupportedType' } })

      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('rejects file at exactly MAX_FILE_SIZE (matches server-side strict `<`)', async () => {
      const { result } = await setupHook([makeFolder()])
      const exact = sizedFile('exact.pdf', 'application/pdf', MAX_FILE_SIZE)

      await expect(
        act(async () => { await result.current.uploadDocuments('folder-1', [exact]) })
      ).rejects.toMatchObject({ reason: { code: 'exceedsLimit' } })

      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('rejects batch that would push household over 50 MB (multi-file quota)', async () => {
      // Seed documents close to quota: 48 MB already used across three realistic
      // docs (each under MAX_FILE_SIZE, unlike a single 48 MB fixture which
      // could never have been uploaded through the validator). Batch of two
      // 2 MB files would push to 52 MB → second file triggers rejection.
      const seeds = [
        makeDoc({ id: 'seed-1', name: 'big1.pdf', size: 16 * 1024 * 1024 }),
        makeDoc({ id: 'seed-2', name: 'big2.pdf', size: 16 * 1024 * 1024 }),
        makeDoc({ id: 'seed-3', name: 'big3.pdf', size: 16 * 1024 * 1024 }),
      ]
      const { result } = await setupHook([makeFolder()], seeds)
      const a = sizedFile('a.pdf', 'application/pdf', 2 * 1024 * 1024)
      const b = sizedFile('b.pdf', 'application/pdf', 2 * 1024 * 1024)

      await expect(
        act(async () => { await result.current.uploadDocuments('folder-1', [a, b]) })
      ).rejects.toMatchObject({ reason: { code: 'householdStorageLimit' } })

      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('silently returns for empty file list', async () => {
      const { result } = await setupHook([makeFolder()])
      await act(async () => { await result.current.uploadDocuments('folder-1', []) })
      expect(mockUploadDocument).not.toHaveBeenCalled()
    })

    it('accepts a well-formed file and uploads', async () => {
      const { result } = await setupHook([makeFolder()])
      const good = new File(['hello'], 'ok.pdf', { type: 'application/pdf' })
      await act(async () => { await result.current.uploadDocuments('folder-1', [good]) })
      expect(mockUploadDocument).toHaveBeenCalledTimes(1)
    })

    it('deletes already-uploaded blobs when a later file in the batch fails', async () => {
      // Same orphan-blob concern as expenses: the household 50 MB accounting
      // drifts if failed-batch successes linger in Storage.
      const { result } = await setupHook([makeFolder()])

      mockUploadDocument
        .mockResolvedValueOnce('https://x/a.pdf')
        .mockRejectedValueOnce(new Error('doc #2 boom'))

      const files = [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.pdf', { type: 'application/pdf' }),
      ]

      await expect(
        act(async () => { await result.current.uploadDocuments('folder-1', files) })
      ).rejects.toThrow('doc #2 boom')

      // Batch-level cleanup removes the first (fulfilled) blob.
      expect(mockDeleteDocumentFiles).toHaveBeenCalled()
      const cleaned = mockDeleteDocumentFiles.mock.calls[0][1] as Array<{ name: string }>
      expect(cleaned.map((d) => d.name)).toContain('a.pdf')
    })

    it('deletes the main blob when the thumbnail upload fails for a single document', async () => {
      const { result } = await setupHook([makeFolder()])
      mockGenerateThumbnail.mockResolvedValueOnce(new Blob(['t']))
      mockUploadDocument.mockResolvedValueOnce('https://x/main.png')
      mockUploadDocumentThumbnail.mockRejectedValueOnce(new Error('thumb failed'))

      const file = new File(['p'], 'photo.png', { type: 'image/png' })

      await expect(
        act(async () => { await result.current.uploadDocuments('folder-1', [file]) })
      ).rejects.toThrow('thumb failed')

      // Per-item catch inside uploadDocuments deletes the partial blob.
      expect(mockDeleteDocumentFile).toHaveBeenCalledWith(
        'house-1',
        expect.any(String),
        'photo.png',
      )
    })

    it('does NOT call cleanup when all files upload successfully (happy path)', async () => {
      const { result } = await setupHook([makeFolder()])
      const files = [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.pdf', { type: 'application/pdf' }),
      ]
      await act(async () => { await result.current.uploadDocuments('folder-1', files) })

      expect(mockDeleteDocumentFiles).not.toHaveBeenCalled()
      expect(mockDeleteDocumentFile).not.toHaveBeenCalled()
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

  // ── Folder seeding ──

  describe('folder seeding', () => {
    it('does not attempt seeding when folders already present in snapshot', async () => {
      // Override onSnapshot to fire with pre-existing folders on first call
      const { onSnapshot: mockOnSnapshot } = await import('firebase/firestore')
      const origImpl = vi.mocked(mockOnSnapshot).getMockImplementation()

      const preExisting = [
        makeFolder({ id: 'f1', name: 'purchase', translationKey: 'purchase', order: 0 }),
        makeFolder({ id: 'f2', name: 'mortgage', translationKey: 'mortgage', order: 1 }),
      ]
      let callIdx = 0
      vi.mocked(mockOnSnapshot).mockImplementation((_query: unknown, callback: unknown) => {
        const cb = callback as (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void
        if (callIdx === 0) {
          // Folders listener — fire with existing folders (simulates batch-created)
          folderSnapshotCallback = cb as typeof folderSnapshotCallback
          cb({ docs: preExisting.map(f => firestoreDoc(f as unknown as Record<string, unknown> & { id: string })) })
        } else {
          // Documents listener
          documentSnapshotCallback = cb as typeof documentSnapshotCallback
          cb({ docs: [] })
        }
        callIdx++
        return vi.fn()
      })

      folderSnapshotCallback = null
      documentSnapshotCallback = null
      const { result } = renderHook(() => useDocuments(), { wrapper })
      await act(async () => {})

      // No seeding calls — folders were already present
      expect(mockRepo.addFolder).not.toHaveBeenCalled()
      expect(result.current.folders).toHaveLength(2)

      // Restore original mock
      vi.mocked(mockOnSnapshot).mockImplementation(origImpl!)
    })

    it('completes loading even when seeding fails (no infinite spinner)', async () => {
      // Make addFolder fail
      mockRepo.addFolder.mockRejectedValue(new Error('Permission denied'))

      folderSnapshotCallback = null
      documentSnapshotCallback = null
      const { result } = renderHook(() => useDocuments(), { wrapper })
      await act(async () => {})

      // Seeding failed but loading should still complete — user sees empty folder grid
      expect(result.current.loading).toBe(false)
      expect(result.current.folders).toHaveLength(0)
    })

    it('retries seeding on remount after failure', async () => {
      // Make addFolder fail on first mount
      mockRepo.addFolder.mockRejectedValue(new Error('Permission denied'))

      folderSnapshotCallback = null
      documentSnapshotCallback = null
      const { unmount } = renderHook(() => useDocuments(), { wrapper })
      await act(async () => {})

      // Unmount triggers cleanup which resets seedingRef
      unmount()

      // Fix addFolder for second mount
      mockRepo.addFolder.mockClear()
      mockRepo.addFolder.mockImplementation(async (input: Partial<DocFolder>) => ({
        id: `seeded-${input.order}`,
        ...input,
        createdAt: '2026-04-12T00:00:00Z',
      }))

      // Remount — simulates page refresh
      folderSnapshotCallback = null
      documentSnapshotCallback = null
      const { result } = renderHook(() => useDocuments(), { wrapper })
      await act(async () => {})

      // Should have retried and succeeded
      expect(mockRepo.addFolder).toHaveBeenCalledTimes(7)
      expect(result.current.folders).toHaveLength(7)
    })
  })

  // ── Seeding edge cases ──

  describe('folder seeding — edge cases', () => {
    it('does not double-seed when snapshot fires again during async seeding', async () => {
      // Simulate: first snapshot triggers seeding (async), second snapshot arrives
      // while seeding is still in progress. Should not start a second seeding round.
      let resolveAddFolder: (() => void) | null = null
      let addFolderCallCount = 0

      mockRepo.addFolder.mockImplementation(async (input: Partial<DocFolder>) => {
        addFolderCallCount++
        // First call blocks until we manually resolve it
        if (addFolderCallCount <= 7) {
          await new Promise<void>(resolve => { resolveAddFolder = resolve })
        }
        return { id: `folder-${addFolderCallCount}`, ...input, createdAt: '2026-04-12T00:00:00Z' }
      })

      folderSnapshotCallback = null
      documentSnapshotCallback = null
      renderHook(() => useDocuments(), { wrapper })

      // Wait for initial render + first snapshot (empty → seeding starts)
      await act(async () => {})

      // Seeding is in progress (addFolder is blocking). Fire another empty snapshot.
      await act(async () => {
        folderSnapshotCallback?.({ docs: [] })
      })

      // Resolve the blocked addFolder calls
      await act(async () => {
        resolveAddFolder?.()
      })

      // Only 7 calls total (one seeding round), not 14
      expect(addFolderCallCount).toBe(7)
    })

    it('skips seeding when user creates a folder manually on empty collection', async () => {
      // After initial empty snapshot triggers seeding, user creates a folder.
      // When the next snapshot arrives with user's folder, seeding should not run again.
      const { result } = await setupHook()
      mockRepo.addFolder.mockClear()

      // User manually creates a folder
      await act(async () => {
        await result.current.addFolder('My Folder', '📁')
      })

      // Simulate snapshot arriving with user's folder
      const userFolder = makeFolder({ id: 'user-folder', name: 'My Folder' })
      await act(async () => {
        folderSnapshotCallback?.({
          docs: [firestoreDoc(userFolder as unknown as Record<string, unknown> & { id: string })],
        })
      })

      // addFolder was called once (for user's manual creation), not 7 more times
      expect(mockRepo.addFolder).toHaveBeenCalledTimes(1)
    })

    it('fallback seeding sets translationKey on all 7 default folders', async () => {
      // When fallback seeding triggers (empty collection), verify translationKeys are correct
      folderSnapshotCallback = null
      documentSnapshotCallback = null
      renderHook(() => useDocuments(), { wrapper })
      await act(async () => {})

      // addFolder should have been called with translationKey for each default
      const calls = mockRepo.addFolder.mock.calls
      expect(calls).toHaveLength(7)
      const keys = calls.map((args: unknown[]) => (args[0] as Partial<DocFolder>).translationKey).sort()
      expect(keys).toEqual(['inspections', 'insurance', 'mortgage', 'other', 'property', 'purchase', 'tax'])
    })
  })

  // ── translationKey — dynamic folder name i18n ──

  describe('translationKey', () => {
    it('resolves translated name when translationKey is present', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'Compra y contratos', translationKey: 'purchase' })
      const { result } = await setupHook([folder])

      // In test env, i18next is English — should resolve to the English translation
      const resolved = result.current.folders.find(f => f.id === 'folder-1')
      expect(resolved?.name).toBe('Purchase & Contracts')
      expect(resolved?.description).toBe('Purchase agreement, offer letter, deposit receipt, closing documents')
    })

    it('passes through literal name when translationKey is absent', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'My Custom Folder' })
      const { result } = await setupHook([folder])

      const resolved = result.current.folders.find(f => f.id === 'folder-1')
      expect(resolved?.name).toBe('My Custom Folder')
    })

    it('passes through literal name when translationKey is null', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'Renamed Folder', translationKey: null })
      const { result } = await setupHook([folder])

      const resolved = result.current.folders.find(f => f.id === 'folder-1')
      expect(resolved?.name).toBe('Renamed Folder')
    })

    it('clears translationKey when folder name is actually changed', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'stored-name', translationKey: 'purchase' })
      const { result } = await setupHook([folder])

      await act(async () => {
        // "My Purchase Docs" differs from the translated name "Purchase & Contracts"
        await result.current.updateFolder('folder-1', { name: 'My Purchase Docs', icon: '📋' })
      })

      expect(mockRepo.updateFolder).toHaveBeenCalledWith('folder-1', {
        name: 'My Purchase Docs',
        icon: '📋',
        translationKey: null,
      })
    })

    it('clears translationKey when description is actually changed', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'stored-name', translationKey: 'purchase' })
      const { result } = await setupHook([folder])

      await act(async () => {
        // Submit the translated name (unchanged) but a custom description
        await result.current.updateFolder('folder-1', {
          name: 'Purchase & Contracts',
          icon: '📋',
          description: 'My custom description',
        })
      })

      expect(mockRepo.updateFolder).toHaveBeenCalledWith('folder-1', {
        name: 'Purchase & Contracts',
        icon: '📋',
        description: 'My custom description',
        translationKey: null,
      })
    })

    it('preserves translationKey when only icon is changed (dialog sends name/desc unchanged)', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'stored-name', translationKey: 'purchase' })
      const { result } = await setupHook([folder])

      await act(async () => {
        // Dialog always sends name and description — but they match the translations
        await result.current.updateFolder('folder-1', {
          name: 'Purchase & Contracts', // matches t('defaultFolders.purchase.name')
          icon: '📄',
          description: 'Purchase agreement, offer letter, deposit receipt, closing documents', // matches translation
        })
      })

      // Name and description should be stripped since they match translations.
      // Only icon should be sent to Firestore.
      expect(mockRepo.updateFolder).toHaveBeenCalledWith('folder-1', { icon: '📄' })
    })

    it('does not clear translationKey when only icon is updated without name', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'stored-name', translationKey: 'purchase' })
      const { result } = await setupHook([folder])

      await act(async () => {
        await result.current.updateFolder('folder-1', { icon: '📄' })
      })

      // No name in updates → translationKey untouched, just icon sent
      expect(mockRepo.updateFolder).toHaveBeenCalledWith('folder-1', { icon: '📄' })
    })

    it('resolves all 7 default folder translationKeys correctly', async () => {
      const defaults: DocFolder[] = [
        makeFolder({ id: 'f1', name: 'ES name', translationKey: 'purchase', icon: '📋', order: 0 }),
        makeFolder({ id: 'f2', name: 'ES name', translationKey: 'mortgage', icon: '🏦', order: 1 }),
        makeFolder({ id: 'f3', name: 'ES name', translationKey: 'property', icon: '🏠', order: 2 }),
        makeFolder({ id: 'f4', name: 'ES name', translationKey: 'tax', icon: '📊', order: 3 }),
        makeFolder({ id: 'f5', name: 'ES name', translationKey: 'insurance', icon: '🛡️', order: 4 }),
        makeFolder({ id: 'f6', name: 'ES name', translationKey: 'inspections', icon: '🔍', order: 5 }),
        makeFolder({ id: 'f7', name: 'ES name', translationKey: 'other', icon: '📁', order: 6 }),
      ]
      const { result } = await setupHook(defaults)

      // All should resolve to English names (test env is English)
      const names = result.current.folders.map(f => f.name)
      expect(names).toContain('Purchase & Contracts')
      expect(names).toContain('Mortgage & Bank')
      expect(names).toContain('Property')
      expect(names).toContain('Tax & Government')
      expect(names).toContain('Insurance')
      expect(names).toContain('Inspections & Reports')
      expect(names).toContain('Other')

      // None should show the raw stored name
      expect(names).not.toContain('ES name')
    })

    it('clears translationKey when description is intentionally cleared (set to undefined)', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'stored-name', translationKey: 'purchase' })
      const { result } = await setupHook([folder])

      await act(async () => {
        // User clears description → dialog sends undefined
        await result.current.updateFolder('folder-1', {
          name: 'Purchase & Contracts',
          icon: '📋',
          description: undefined,
        })
      })

      // undefined !== translated description → description was changed → clear translationKey
      expect(mockRepo.updateFolder).toHaveBeenCalledWith('folder-1', {
        name: 'Purchase & Contracts',
        icon: '📋',
        translationKey: null,
      })
    })

    it('handles mix of default and custom folders', async () => {
      const folders = [
        makeFolder({ id: 'f1', name: 'ES purchase', translationKey: 'purchase', order: 0 }),
        makeFolder({ id: 'f2', name: 'My Custom Folder', order: 1 }),
      ]
      const { result } = await setupHook(folders)

      const f1 = result.current.folders.find(f => f.id === 'f1')
      const f2 = result.current.folders.find(f => f.id === 'f2')
      expect(f1?.name).toBe('Purchase & Contracts') // translated
      expect(f2?.name).toBe('My Custom Folder')     // literal
    })

    // ── Edge cases: translationKey clearing logic ──

    it('clears translationKey when both name and description are changed', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'stored', translationKey: 'purchase' })
      const { result } = await setupHook([folder])

      await act(async () => {
        await result.current.updateFolder('folder-1', {
          name: 'Custom Name',
          icon: '📋',
          description: 'Custom Description',
        })
      })

      expect(mockRepo.updateFolder).toHaveBeenCalledWith('folder-1', {
        name: 'Custom Name',
        icon: '📋',
        description: 'Custom Description',
        translationKey: null,
      })
    })

    it('does not affect custom folders (no translationKey) when updating name', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'Custom Folder' })
      const { result } = await setupHook([folder])

      await act(async () => {
        await result.current.updateFolder('folder-1', { name: 'Renamed Custom', icon: '📁' })
      })

      // No translationKey logic involved — updates pass through as-is
      expect(mockRepo.updateFolder).toHaveBeenCalledWith('folder-1', {
        name: 'Renamed Custom',
        icon: '📁',
      })
    })

    it('does not affect folders with translationKey already cleared (null)', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'Previously Renamed', translationKey: null })
      const { result } = await setupHook([folder])

      await act(async () => {
        await result.current.updateFolder('folder-1', { name: 'Renamed Again', icon: '📋' })
      })

      // translationKey is null (falsy) → no translationKey logic → pass through
      expect(mockRepo.updateFolder).toHaveBeenCalledWith('folder-1', {
        name: 'Renamed Again',
        icon: '📋',
      })
    })

    it('rolls back translated folder on update failure', async () => {
      mockRepo.updateFolder.mockRejectedValueOnce(new Error('Network error'))
      const folder = makeFolder({ id: 'folder-1', name: 'stored-raw', translationKey: 'purchase' })
      const { result } = await setupHook([folder])

      // Before: translated name
      expect(result.current.folders.find(f => f.id === 'folder-1')?.name).toBe('Purchase & Contracts')

      await expect(
        act(async () => {
          await result.current.updateFolder('folder-1', { name: 'Custom Name', icon: '📋' })
        })
      ).rejects.toThrow('Network error')

      // After rollback: raw data restored → translation resolves again
      const rolledBack = result.current.folders.find(f => f.id === 'folder-1')
      expect(rolledBack?.name).toBe('Purchase & Contracts')
      expect(rolledBack?.translationKey).toBe('purchase')
    })

    it('preserves translationKey in optimistic state when only icon changes', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'stored', translationKey: 'mortgage' })
      const { result } = await setupHook([folder])

      await act(async () => {
        await result.current.updateFolder('folder-1', {
          name: 'Mortgage & Bank',
          icon: '💰',
          description: 'Pre-approval, loan agreement, mortgage deed, bank statements',
        })
      })

      // translationKey should still be present → folder still translates
      const updated = result.current.folders.find(f => f.id === 'folder-1')
      expect(updated?.name).toBe('Mortgage & Bank')
      expect(updated?.translationKey).toBe('mortgage')
    })

    it('passes through empty string translationKey as falsy (no translation)', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'Literal Name', translationKey: '' as string })
      const { result } = await setupHook([folder])

      const resolved = result.current.folders.find(f => f.id === 'folder-1')
      expect(resolved?.name).toBe('Literal Name')
    })

    it('handles folder with translationKey pointing to missing locale key gracefully', async () => {
      const folder = makeFolder({ id: 'folder-1', name: 'Fallback Name', translationKey: 'nonexistent_key' })
      const { result } = await setupHook([folder])

      // i18next returns the key itself when translation is missing
      const resolved = result.current.folders.find(f => f.id === 'folder-1')
      expect(resolved?.name).toBe('defaultFolders.nonexistent_key.name')
    })

    it('translated description also resolves alongside name', async () => {
      const folder = makeFolder({
        id: 'folder-1',
        name: 'raw',
        description: 'raw desc',
        translationKey: 'tax',
      })
      const { result } = await setupHook([folder])

      const resolved = result.current.folders.find(f => f.id === 'folder-1')
      expect(resolved?.name).toBe('Tax & Government')
      expect(resolved?.description).toBe('Transfer tax, property tax, stamp duty, land registry')
    })

    it('preserves all other DocFolder fields during translation resolution', async () => {
      const folder = makeFolder({
        id: 'folder-1',
        name: 'raw',
        icon: '🛡️',
        order: 4,
        translationKey: 'insurance',
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'user-123',
      })
      const { result } = await setupHook([folder])

      const resolved = result.current.folders.find(f => f.id === 'folder-1')
      expect(resolved?.id).toBe('folder-1')
      expect(resolved?.icon).toBe('🛡️')
      expect(resolved?.order).toBe(4)
      expect(resolved?.translationKey).toBe('insurance')
      expect(resolved?.createdAt).toBe('2026-01-01T00:00:00Z')
      expect(resolved?.createdBy).toBe('user-123')
      // Only name and description are overridden
      expect(resolved?.name).toBe('Insurance')
    })
  })
})
