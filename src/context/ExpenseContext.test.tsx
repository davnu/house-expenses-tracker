import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Expense } from '@/types/expense'
import type { ReactNode } from 'react'
import { MAX_FILE_SIZE } from '@/lib/constants'

// ── Mocks (hoisted so they're available in vi.mock factories) ──

const mockExpenses: Expense[] = [
  {
    id: 'exp-1',
    amount: 100000,
    category: 'notary_legal',
    payer: 'alice',
    description: 'Notary fees',
    date: '2026-01-15',
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    attachments: [
      { id: 'att-1', name: 'receipt.pdf', type: 'application/pdf', size: 5000, url: 'https://example.com/receipt.pdf' },
    ],
  },
  {
    id: 'exp-2',
    amount: 50000,
    category: 'taxes',
    payer: 'bob',
    description: 'Tax payment',
    date: '2026-02-01',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
]

const { mockRepo, mockUploadAttachment, mockUploadAttachmentThumbnail, mockDeleteAttachment, mockDeleteAttachments, mockGenerateThumbnail } = vi.hoisted(() => {
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
  }
  return {
    mockRepo,
    mockUploadAttachment: vi.fn(),
    mockUploadAttachmentThumbnail: vi.fn(),
    mockDeleteAttachment: vi.fn(),
    mockDeleteAttachments: vi.fn(),
    mockGenerateThumbnail: vi.fn(),
  }
})

vi.mock('@/data/firestore-repository', () => ({
  FirestoreRepository: vi.fn().mockImplementation(function () { return mockRepo }),
}))

vi.mock('@/data/firebase', () => ({ db: {}, storage: {} }))

vi.mock('@/data/firebase-attachment-store', () => ({
  uploadAttachment: mockUploadAttachment,
  uploadAttachmentThumbnail: mockUploadAttachmentThumbnail,
  deleteAttachment: mockDeleteAttachment,
  deleteAttachments: mockDeleteAttachments,
}))

vi.mock('@/lib/thumbnail', () => ({
  generateThumbnail: mockGenerateThumbnail,
}))

vi.mock('./HouseholdContext', () => ({
  useHousehold: () => ({
    house: { id: 'house-1', name: 'Test House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
  }),
}))

// Import after mocks are set up
import { ExpenseProvider, useExpenses } from './ExpenseContext'
import { sizedFile } from '@/test-utils/files'

// ── Helpers ───────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <ExpenseProvider>{children}</ExpenseProvider>
}

async function setupHook() {
  const result = renderHook(() => useExpenses(), { wrapper })
  // Wait for initial load (refresh)
  await act(async () => {})
  return result
}

// ── Tests ─────────────────────────────────────────────

describe('ExpenseContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateThumbnail.mockResolvedValue(null) // No thumbnail by default
    mockRepo.getExpenses.mockResolvedValue(mockExpenses.map((e) => ({ ...e, attachments: e.attachments?.map((a) => ({ ...a })) })))
    mockRepo.addExpense.mockImplementation(async (input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => ({
      id: 'real-id-from-firestore',
      ...input,
      createdAt: '2026-04-12T10:00:00Z',
      updatedAt: '2026-04-12T10:00:00Z',
    }))
    mockRepo.updateExpense.mockImplementation(async (id: string, updates: Partial<Expense>) => ({
      ...mockExpenses.find((e) => e.id === id),
      ...updates,
      updatedAt: '2026-04-12T11:00:00Z',
    }))
    mockRepo.deleteExpense.mockResolvedValue(undefined)
    mockUploadAttachment.mockResolvedValue('https://example.com/uploaded.pdf')
    mockDeleteAttachment.mockResolvedValue(undefined)
    mockDeleteAttachments.mockResolvedValue(undefined)
  })

  // ── Initial load ──────────────────────────────────

  describe('initial load', () => {
    it('fetches expenses on mount and sets loading to false', async () => {
      const { result } = renderHook(() => useExpenses(), { wrapper })
      // Initially loading
      expect(result.current.loading).toBe(true)

      await act(async () => {})

      expect(result.current.loading).toBe(false)
      expect(result.current.expenses).toHaveLength(2)
      expect(mockRepo.getExpenses).toHaveBeenCalledOnce()
    })

    it('computes storageUsed from attachment sizes', async () => {
      const { result } = await setupHook()
      // exp-1 has one 5000-byte attachment, exp-2 has none
      expect(result.current.storageUsed).toBe(5000)
    })
  })

  // ── deleteExpense ─────────────────────────────────

  describe('deleteExpense', () => {
    it('removes expense from state immediately (optimistic)', async () => {
      const { result } = await setupHook()
      expect(result.current.expenses).toHaveLength(2)

      let deletePromise: Promise<void>
      act(() => {
        deletePromise = result.current.deleteExpense('exp-1')
      })

      // Expense removed immediately (optimistic)
      expect(result.current.expenses).toHaveLength(1)
      expect(result.current.expenses[0].id).toBe('exp-2')

      await act(async () => { await deletePromise! })

      // Still removed after backend completes
      expect(result.current.expenses).toHaveLength(1)
    })

    it('deletes attachments from storage before deleting expense', async () => {
      const { result } = await setupHook()

      await act(async () => { await result.current.deleteExpense('exp-1') })

      expect(mockDeleteAttachments).toHaveBeenCalledWith('house-1', [
        { id: 'att-1', name: 'receipt.pdf', type: 'application/pdf', size: 5000, url: 'https://example.com/receipt.pdf' },
      ])
      expect(mockRepo.deleteExpense).toHaveBeenCalledWith('exp-1')
    })

    it('skips attachment deletion when expense has no attachments', async () => {
      const { result } = await setupHook()

      await act(async () => { await result.current.deleteExpense('exp-2') })

      expect(mockDeleteAttachments).not.toHaveBeenCalled()
      expect(mockRepo.deleteExpense).toHaveBeenCalledWith('exp-2')
    })

    it('rolls back on backend error', async () => {
      mockRepo.deleteExpense.mockRejectedValueOnce(new Error('Network error'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.deleteExpense('exp-1') })
      ).rejects.toThrow('Network error')

      // Rolled back — expense is back
      expect(result.current.expenses).toHaveLength(2)
      expect(result.current.expenses.some((e) => e.id === 'exp-1')).toBe(true)
    })

    it('rolls back when attachment deletion fails', async () => {
      mockDeleteAttachments.mockRejectedValueOnce(new Error('Storage error'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.deleteExpense('exp-1') })
      ).rejects.toThrow('Storage error')

      expect(result.current.expenses).toHaveLength(2)
      expect(mockRepo.deleteExpense).not.toHaveBeenCalled()
    })
  })

  // ── updateExpense ─────────────────────────────────

  describe('updateExpense', () => {
    it('applies updates to state immediately (optimistic)', async () => {
      const { result } = await setupHook()

      let updatePromise: Promise<void>
      act(() => {
        updatePromise = result.current.updateExpense('exp-2', { amount: 75000, description: 'Updated tax' })
      })

      // Updated immediately
      const updated = result.current.expenses.find((e) => e.id === 'exp-2')!
      expect(updated.amount).toBe(75000)
      expect(updated.description).toBe('Updated tax')

      await act(async () => { await updatePromise! })
      expect(mockRepo.updateExpense).toHaveBeenCalledWith('exp-2', { amount: 75000, description: 'Updated tax' })
    })

    it('replaces optimistic state with server response after persist', async () => {
      const { result } = await setupHook()

      await act(async () => {
        await result.current.updateExpense('exp-2', { amount: 75000 })
      })

      // Server response has specific updatedAt
      const final = result.current.expenses.find((e) => e.id === 'exp-2')!
      expect(final.updatedAt).toBe('2026-04-12T11:00:00Z')
    })

    it('preserves fields not included in the update', async () => {
      const { result } = await setupHook()

      await act(async () => {
        await result.current.updateExpense('exp-2', { amount: 75000 })
      })

      const final = result.current.expenses.find((e) => e.id === 'exp-2')!
      expect(final.description).toBe('Tax payment')
      expect(final.payer).toBe('bob')
    })

    it('rolls back on backend error', async () => {
      mockRepo.updateExpense.mockRejectedValueOnce(new Error('Permission denied'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.updateExpense('exp-2', { amount: 99999 }) })
      ).rejects.toThrow('Permission denied')

      // Rolled back to original
      expect(result.current.expenses.find((e) => e.id === 'exp-2')!.amount).toBe(50000)
    })

    it('does nothing for non-existent expense', async () => {
      const { result } = await setupHook()

      await act(async () => {
        await result.current.updateExpense('non-existent', { amount: 99999 })
      })

      expect(mockRepo.updateExpense).not.toHaveBeenCalled()
      expect(result.current.expenses).toHaveLength(2)
    })
  })

  // ── addExpense ────────────────────────────────────

  describe('addExpense', () => {
    it('adds expense to state immediately with temp ID, then replaces with real ID', async () => {
      const { result } = await setupHook()
      expect(result.current.expenses).toHaveLength(2)

      const input = {
        amount: 30000,
        category: 'furniture' as const,
        payer: 'alice',
        description: 'New desk',
        date: '2026-03-01',
      }

      let addPromise: Promise<void>
      act(() => {
        addPromise = result.current.addExpense(input)
      })

      // Added immediately with temp ID
      expect(result.current.expenses).toHaveLength(3)
      const tempExpense = result.current.expenses.find((e) => e.id.startsWith('temp-'))!
      expect(tempExpense).toBeDefined()
      expect(tempExpense.amount).toBe(30000)
      expect(tempExpense.description).toBe('New desk')
      expect(result.current.pendingExpenseIds.has(tempExpense.id)).toBe(true)

      await act(async () => { await addPromise! })

      // Replaced with real ID from Firestore
      expect(result.current.expenses).toHaveLength(3)
      const realExpense = result.current.expenses.find((e) => e.id === 'real-id-from-firestore')!
      expect(realExpense).toBeDefined()
      expect(realExpense.amount).toBe(30000)
      expect(realExpense.createdAt).toBe('2026-04-12T10:00:00Z')

      // Temp ID gone, pending cleared
      expect(result.current.expenses.some((e) => e.id.startsWith('temp-'))).toBe(false)
      expect(result.current.pendingExpenseIds.size).toBe(0)
    })

    it('rolls back on backend error', async () => {
      mockRepo.addExpense.mockRejectedValueOnce(new Error('Quota exceeded'))
      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.addExpense({
            amount: 30000,
            category: 'furniture' as const,
            payer: 'alice',
            description: 'New desk',
            date: '2026-03-01',
          })
        })
      ).rejects.toThrow('Quota exceeded')

      // Rolled back — temp expense removed, pending cleared
      expect(result.current.expenses).toHaveLength(2)
      expect(result.current.pendingExpenseIds.size).toBe(0)
    })
  })

  // ── addExpenseWithFiles ───────────────────────────

  describe('addExpenseWithFiles', () => {
    it('adds expense with pending attachment pills, then replaces with real data', async () => {
      const { result } = await setupHook()

      const input = {
        amount: 20000,
        category: 'renovations' as const,
        payer: 'alice',
        description: 'Paint',
        date: '2026-03-15',
      }
      const file = new File(['test content'], 'photo.png', { type: 'image/png' })

      let addPromise: Promise<void>
      act(() => {
        addPromise = result.current.addExpenseWithFiles(input, [file])
      })

      // Expense added with pending state
      expect(result.current.expenses).toHaveLength(3)
      const tempExpense = result.current.expenses.find((e) => e.id.startsWith('temp-'))!
      expect(tempExpense).toBeDefined()
      expect(tempExpense.attachments).toHaveLength(1)
      expect(tempExpense.attachments![0].name).toBe('photo.png')
      expect(result.current.pendingExpenseIds.has(tempExpense.id)).toBe(true)
      expect(result.current.pendingAttachmentIds.has(tempExpense.attachments![0].id)).toBe(true)

      await act(async () => { await addPromise! })

      // Replaced with real data, pending cleared
      expect(result.current.expenses).toHaveLength(3)
      expect(result.current.expenses.some((e) => e.id === 'real-id-from-firestore')).toBe(true)
      expect(result.current.pendingExpenseIds.size).toBe(0)
      expect(result.current.pendingAttachmentIds.size).toBe(0)
    })

    it('works without files (common path from QuickAddDialog)', async () => {
      const { result } = await setupHook()

      await act(async () => {
        await result.current.addExpenseWithFiles(
          { amount: 10000, category: 'other' as const, payer: 'alice', description: 'No files', date: '2026-04-01' },
          [],
        )
      })

      expect(result.current.expenses).toHaveLength(3)
      expect(result.current.expenses.some((e) => e.id === 'real-id-from-firestore')).toBe(true)
      expect(mockUploadAttachment).not.toHaveBeenCalled()
      expect(result.current.pendingAttachmentIds.size).toBe(0)
    })

    it('throws on MAX_FILES_PER_EXPENSE without corrupting state', async () => {
      const { result } = await setupHook()
      const files = Array.from({ length: 11 }, (_, i) => new File(['x'], `file${i}.png`, { type: 'image/png' }))

      await expect(
        act(async () => {
          await result.current.addExpenseWithFiles(
            { amount: 10000, category: 'other' as const, payer: 'alice', description: 'Too many', date: '2026-04-01' },
            files,
          )
        })
        // Assert on the structured reason code rather than the debug message
        // so the test survives future localisation / copy edits.
      ).rejects.toMatchObject({ reason: { code: 'maxFilesPerExpense' } })

      // State untouched — validation fires before optimistic update
      expect(result.current.expenses).toHaveLength(2)
      expect(result.current.pendingExpenseIds.size).toBe(0)
    })

    it('rolls back on upload error', async () => {
      mockUploadAttachment.mockRejectedValueOnce(new Error('Upload failed'))

      const { result } = await setupHook()
      const file = new File(['test'], 'doc.pdf', { type: 'application/pdf' })

      await expect(
        act(async () => {
          await result.current.addExpenseWithFiles(
            { amount: 10000, category: 'other' as const, payer: 'alice', description: 'Test', date: '2026-04-01' },
            [file],
          )
        })
      ).rejects.toThrow('Upload failed')

      // Rolled back
      expect(result.current.expenses).toHaveLength(2)
      expect(result.current.pendingExpenseIds.size).toBe(0)
      expect(result.current.pendingAttachmentIds.size).toBe(0)
    })

    it('generates and uploads thumbnail for image files', async () => {
      const fakeBlob = new Blob(['thumb'], { type: 'image/jpeg' })
      mockGenerateThumbnail.mockResolvedValueOnce(fakeBlob)
      mockUploadAttachmentThumbnail.mockResolvedValueOnce('https://example.com/thumb.jpg')

      const { result } = await setupHook()
      const file = new File(['image'], 'photo.png', { type: 'image/png' })

      await act(async () => {
        await result.current.addExpenseWithFiles(
          { amount: 5000, category: 'other' as const, payer: 'alice', description: 'Photo', date: '2026-04-01' },
          [file],
        )
      })

      // generateThumbnail was called with the file
      expect(mockGenerateThumbnail).toHaveBeenCalledWith(file)
      // uploadAttachmentThumbnail was called with the blob
      expect(mockUploadAttachmentThumbnail).toHaveBeenCalledWith('house-1', expect.any(String), fakeBlob)
      // The persisted expense should include thumbnailUrl
      const addCall = mockRepo.addExpense.mock.calls[0][0]
      expect(addCall.attachments[0].thumbnailUrl).toBe('https://example.com/thumb.jpg')
    })

    it('skips thumbnail upload when generateThumbnail returns null (non-image file)', async () => {
      mockGenerateThumbnail.mockResolvedValueOnce(null)

      const { result } = await setupHook()
      const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' })

      await act(async () => {
        await result.current.addExpenseWithFiles(
          { amount: 5000, category: 'other' as const, payer: 'alice', description: 'PDF', date: '2026-04-01' },
          [file],
        )
      })

      expect(mockUploadAttachmentThumbnail).not.toHaveBeenCalled()
      const addCall = mockRepo.addExpense.mock.calls[0][0]
      expect(addCall.attachments[0].thumbnailUrl).toBeUndefined()
    })
  })

  // ── addAttachmentsToExpense ───────────────────────

  describe('addAttachmentsToExpense', () => {
    it('shows pending attachment pills immediately, replaces with real data after upload', async () => {
      const { result } = await setupHook()
      const file = new File(['test'], 'invoice.pdf', { type: 'application/pdf' })

      let addPromise: Promise<void>
      act(() => {
        addPromise = result.current.addAttachmentsToExpense('exp-2', [file])
      })

      // Pending pill visible immediately on exp-2
      const exp2 = result.current.expenses.find((e) => e.id === 'exp-2')!
      expect(exp2.attachments).toHaveLength(1)
      expect(exp2.attachments![0].name).toBe('invoice.pdf')
      expect(exp2.attachments![0].url).toBeUndefined()
      expect(result.current.pendingAttachmentIds.has(exp2.attachments![0].id)).toBe(true)

      await act(async () => { await addPromise! })

      // Real attachment with URL, pending cleared
      const updated = result.current.expenses.find((e) => e.id === 'exp-2')!
      expect(updated.attachments).toHaveLength(1)
      expect(updated.attachments![0].url).toBe('https://example.com/uploaded.pdf')
      expect(result.current.pendingAttachmentIds.size).toBe(0)
      expect(mockRepo.updateExpense).toHaveBeenCalledWith('exp-2', expect.objectContaining({
        attachments: expect.arrayContaining([expect.objectContaining({ name: 'invoice.pdf' })]),
      }))
    })

    it('appends to existing attachments', async () => {
      const { result } = await setupHook()
      const file = new File(['test'], 'new.png', { type: 'image/png' })

      await act(async () => {
        await result.current.addAttachmentsToExpense('exp-1', [file])
      })

      // exp-1 had 1 attachment, now has 2
      const exp1 = result.current.expenses.find((e) => e.id === 'exp-1')!
      expect(exp1.attachments).toHaveLength(2)
    })

    it('rolls back on upload error', async () => {
      mockUploadAttachment.mockRejectedValueOnce(new Error('Upload failed'))
      const { result } = await setupHook()
      const file = new File(['test'], 'fail.png', { type: 'image/png' })

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-2', [file]) })
      ).rejects.toThrow('Upload failed')

      // Rolled back — no attachments on exp-2
      const exp2 = result.current.expenses.find((e) => e.id === 'exp-2')!
      expect(exp2.attachments).toBeUndefined()
      expect(result.current.pendingAttachmentIds.size).toBe(0)
    })

    // ── Orphan-blob cleanup on partial batch failure ──

    it('deletes already-uploaded blobs when one of multiple files fails', async () => {
      // Batch of 3: first succeeds, second fails, third succeeds. The first
      // blob must be deleted (orphan cleanup) so household storage accounting
      // doesn't drift from real Storage bytes. The third may or may not have
      // been attempted by the time the rejection wins — either way, any
      // fulfilled result must be cleaned up.
      const { result } = await setupHook()

      mockUploadAttachment
        .mockResolvedValueOnce('https://x/1.png')
        .mockRejectedValueOnce(new Error('boom on #2'))
        .mockResolvedValueOnce('https://x/3.png')

      const files = [
        new File(['a'], 'a.png', { type: 'image/png' }),
        new File(['b'], 'b.png', { type: 'image/png' }),
        new File(['c'], 'c.png', { type: 'image/png' }),
      ]

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-2', files) })
      ).rejects.toThrow('boom on #2')

      // deleteAttachments is the batch-level cleanup used by uploadBatchWithRollback.
      expect(mockDeleteAttachments).toHaveBeenCalled()
      const cleanedUp = mockDeleteAttachments.mock.calls[0][1] as Array<{ name: string }>
      const cleanedNames = cleanedUp.map((a) => a.name).sort()
      // At least the first file's blob must be scheduled for deletion. The
      // third may be too if it won the race; we don't pin ordering.
      expect(cleanedNames).toContain('a.png')
    })

    it('cleans up the main blob when thumbnail upload fails (within-item partial)', async () => {
      // This is the subtler orphan: main uploaded OK, thumbnail upload threw.
      // uploadAttachmentAtomic catches and calls deleteAttachment so the main
      // blob doesn't linger. Without this, image attachments with broken
      // thumbnail generation would silently eat quota.
      const { result } = await setupHook()
      // Image MIME triggers the thumbnail path (generateThumbnail is mocked
      // to return a truthy blob here, forcing uploadAttachmentThumbnail to run).
      mockGenerateThumbnail.mockResolvedValueOnce(new Blob(['thumb']))
      mockUploadAttachment.mockResolvedValueOnce('https://x/main.png')
      mockUploadAttachmentThumbnail.mockRejectedValueOnce(new Error('thumb failed'))

      const file = new File(['p'], 'photo.png', { type: 'image/png' })

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-2', [file]) })
      ).rejects.toThrow('thumb failed')

      // uploadAttachmentAtomic's per-item catch calls deleteAttachment.
      expect(mockDeleteAttachment).toHaveBeenCalledWith(
        'house-1',
        expect.any(String),
        'photo.png',
      )
      // Rolled back in state, too.
      const exp2 = result.current.expenses.find((e) => e.id === 'exp-2')!
      expect(exp2.attachments).toBeUndefined()
    })

    it('calls cleanup even when the single file in a batch fails', async () => {
      // Single-file batch: fulfilled list is empty, but uploadBatchWithRollback
      // still invokes cleanup([]) for consistency. Worth locking in so a future
      // refactor can't silently skip cleanup when batch size is 1.
      mockUploadAttachment.mockRejectedValueOnce(new Error('lone fail'))
      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.addAttachmentsToExpense('exp-2', [
            new File(['x'], 'x.png', { type: 'image/png' }),
          ])
        })
      ).rejects.toThrow('lone fail')

      expect(mockDeleteAttachments).toHaveBeenCalledWith('house-1', [])
    })

    it('throws on MAX_FILES_PER_EXPENSE without corrupting state', async () => {
      const { result } = await setupHook()
      // exp-1 already has 1 attachment, try to add 10 more (total 11 > MAX_FILES_PER_EXPENSE=10)
      const files = Array.from({ length: 10 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }))

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-1', files) })
      ).rejects.toMatchObject({ reason: { code: 'maxFilesPerExpense' } })

      // State untouched
      expect(result.current.expenses.find((e) => e.id === 'exp-1')!.attachments).toHaveLength(1)
      expect(result.current.pendingAttachmentIds.size).toBe(0)
    })

    // Regression for the 46 MB / 403 "no permission" bug: the context-level
    // defensive check must reject oversize files BEFORE hitting Firebase,
    // even if a caller bypasses the UI validator.
    it('rejects files larger than MAX_FILE_SIZE before attempting upload', async () => {
      const { result } = await setupHook()
      // Synthesize a 46 MB PNG without allocating 46 MB of memory by overriding .size
      const bigFile = new File([''], 'huge.png', { type: 'image/png' })
      Object.defineProperty(bigFile, 'size', { value: 46 * 1024 * 1024 })

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-2', [bigFile]) })
      ).rejects.toMatchObject({ reason: { code: 'exceedsLimit' } })

      // Upload never attempted, no placeholder left behind
      expect(mockUploadAttachment).not.toHaveBeenCalled()
      expect(result.current.expenses.find((e) => e.id === 'exp-2')!.attachments).toBeUndefined()
      expect(result.current.pendingAttachmentIds.size).toBe(0)
    })

    it('rejects files with unsupported MIME types before attempting upload', async () => {
      const { result } = await setupHook()
      const badFile = new File(['x'], 'script.exe', { type: 'application/x-msdownload' })

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-2', [badFile]) })
      ).rejects.toMatchObject({ reason: { code: 'unsupportedType' } })

      expect(mockUploadAttachment).not.toHaveBeenCalled()
      expect(result.current.expenses.find((e) => e.id === 'exp-2')!.attachments).toBeUndefined()
    })
  })

  // ── removeAttachment ──────────────────────────────

  describe('removeAttachment', () => {
    it('removes attachment from expense immediately (optimistic)', async () => {
      const { result } = await setupHook()
      expect(result.current.expenses.find((e) => e.id === 'exp-1')!.attachments).toHaveLength(1)

      let removePromise: Promise<void>
      act(() => {
        removePromise = result.current.removeAttachment('exp-1', 'att-1')
      })

      // Removed immediately
      expect(result.current.expenses.find((e) => e.id === 'exp-1')!.attachments ?? []).toHaveLength(0)

      await act(async () => { await removePromise! })

      // Persisted — deleteAttachment called, then updateExpense
      expect(mockDeleteAttachment).toHaveBeenCalledWith('house-1', 'att-1', 'receipt.pdf')
      expect(mockRepo.updateExpense).toHaveBeenCalledWith('exp-1', { attachments: undefined })
    })

    it('rolls back on error', async () => {
      mockDeleteAttachment.mockRejectedValueOnce(new Error('Storage error'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.removeAttachment('exp-1', 'att-1') })
      ).rejects.toThrow('Storage error')

      // Rolled back
      expect(result.current.expenses.find((e) => e.id === 'exp-1')!.attachments).toHaveLength(1)
    })
  })

  // ── Storage quota lifecycle (reclamation, pending-state accounting) ──

  describe('storage quota lifecycle', () => {
    it('storageUsed decreases when an expense with attachments is deleted', async () => {
      const { result } = await setupHook()
      expect(result.current.storageUsed).toBe(5000)

      await act(async () => { await result.current.deleteExpense('exp-1') })

      // exp-1 had the only attachment (5000 bytes). Now zero.
      expect(result.current.storageUsed).toBe(0)
    })

    it('storageUsed decreases when an individual attachment is removed', async () => {
      const { result } = await setupHook()
      expect(result.current.storageUsed).toBe(5000)

      await act(async () => { await result.current.removeAttachment('exp-1', 'att-1') })

      expect(result.current.storageUsed).toBe(0)
    })

    it('rolls back storageUsed when removeAttachment fails', async () => {
      mockDeleteAttachment.mockRejectedValueOnce(new Error('Storage error'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.removeAttachment('exp-1', 'att-1') })
      ).rejects.toThrow()

      // storageUsed must match the restored attachments, not stay at the
      // optimistic zero — otherwise later uploads would miscalculate quota.
      expect(result.current.storageUsed).toBe(5000)
    })

    it('includes placeholder sizes in storageUsed during pending upload (prevents double-spend)', async () => {
      // While an upload is in flight, the placeholder counts toward quota so
      // a second concurrent upload can't race past the 50 MB limit.
      const { result } = await setupHook()
      const file = sizedFile('pending.pdf', 'application/pdf', 2_000_000)

      let promise: Promise<void>
      act(() => {
        promise = result.current.addAttachmentsToExpense('exp-2', [file])
      })
      // Placeholder visible — storageUsed includes it
      expect(result.current.storageUsed).toBe(5000 + 2_000_000)

      await act(async () => { await promise! })

      // After resolution the real size is the same, so no double-count
      expect(result.current.storageUsed).toBe(5000 + 2_000_000)
    })

    it('restores prior storageUsed after a failed pending upload (rollback)', async () => {
      mockUploadAttachment.mockRejectedValueOnce(new Error('network error'))
      const { result } = await setupHook()
      const file = sizedFile('fail.pdf', 'application/pdf', 1_000_000)

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-2', [file]) })
      ).rejects.toThrow()

      expect(result.current.storageUsed).toBe(5000)
    })

    it('accepts a batch that fills household to EXACTLY MAX_HOUSEHOLD_STORAGE', async () => {
      // 6 × 8 MB = 48 MB + 5000 existing ≈ fits within 50 MB with a small pad
      // file. Each file comfortably under MAX_FILE_SIZE (25 MB per file).
      const { result } = await setupHook()
      const pad = 50 * 1024 * 1024 - 5000 - 6 * 8 * 1024 * 1024
      const files = [
        ...Array.from({ length: 6 }, (_, i) =>
          sizedFile(`big${i}.pdf`, 'application/pdf', 8 * 1024 * 1024),
        ),
        sizedFile('pad.pdf', 'application/pdf', pad),
      ]
      await act(async () => { await result.current.addAttachmentsToExpense('exp-2', files) })

      expect(result.current.storageUsed).toBe(50 * 1024 * 1024)
      expect(mockUploadAttachment).toHaveBeenCalledTimes(7)
    })

    it('rejects a batch that would push household one byte past MAX_HOUSEHOLD_STORAGE', async () => {
      const { result } = await setupHook()
      // 6 × 8 MB + pad = exactly MAX. One extra byte on the pad file overflows.
      const overBy = 1
      const pad = 50 * 1024 * 1024 - 5000 - 6 * 8 * 1024 * 1024 + overBy
      const files = [
        ...Array.from({ length: 6 }, (_, i) =>
          sizedFile(`big${i}.pdf`, 'application/pdf', 8 * 1024 * 1024),
        ),
        sizedFile('overflow.pdf', 'application/pdf', pad),
      ]

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-2', files) })
      ).rejects.toMatchObject({ reason: { code: 'householdStorageLimit' } })

      expect(mockUploadAttachment).not.toHaveBeenCalled()
      expect(result.current.storageUsed).toBe(5000)
    })

    it('allows re-upload after deleting an expense frees quota', async () => {
      const { result } = await setupHook()
      // Fill storage to ~45 MB via multiple files (each well under per-file cap) attached to exp-2
      const fill = Array.from({ length: 5 }, (_, i) =>
        sizedFile(`fill${i}.pdf`, 'application/pdf', 9 * 1024 * 1024 - 1000),
      )
      await act(async () => { await result.current.addAttachmentsToExpense('exp-2', fill) })
      // 5 × (~9 MB - 1000) + 5000 ≈ just under 45 MB

      // An 8 MB upload would NOT fit (current + 8 > 50)
      const eight = sizedFile('eight.pdf', 'application/pdf', 8 * 1024 * 1024)
      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-1', [eight]) })
      ).rejects.toMatchObject({ reason: { code: 'householdStorageLimit' } })

      // Delete the big expense → quota frees up
      await act(async () => { await result.current.deleteExpense('exp-2') })

      // Now the 8 MB upload fits
      await act(async () => { await result.current.addAttachmentsToExpense('exp-1', [eight]) })
      expect(mockUploadAttachment).toHaveBeenCalledTimes(fill.length + 1)
    })

    it('addAttachmentsToExpense returns silently for empty file list (no-op)', async () => {
      const { result } = await setupHook()
      await act(async () => { await result.current.addAttachmentsToExpense('exp-2', []) })
      expect(mockUploadAttachment).not.toHaveBeenCalled()
      // No placeholder, no pending state left behind
      expect(result.current.pendingAttachmentIds.size).toBe(0)
    })

    it('addAttachmentsToExpense for a non-existent expense silently no-ops', async () => {
      const { result } = await setupHook()
      const file = sizedFile('x.pdf', 'application/pdf', 100)
      await act(async () => { await result.current.addAttachmentsToExpense('does-not-exist', [file]) })
      expect(mockUploadAttachment).not.toHaveBeenCalled()
    })
  })

  // ── addExpenseWithFiles defense-in-depth ─────────────

  describe('addExpenseWithFiles defensive validation', () => {
    const newExpense = {
      amount: 1000,
      category: 'other',
      payer: 'alice',
      description: 'test',
      date: '2026-04-19',
    } as const

    it('rejects oversized file before attempting upload', async () => {
      const { result } = await setupHook()
      const big = sizedFile('big.png', 'image/png', MAX_FILE_SIZE + 1)

      await expect(
        act(async () => { await result.current.addExpenseWithFiles(newExpense, [big]) })
      ).rejects.toMatchObject({ reason: { code: 'exceedsLimit' } })

      expect(mockUploadAttachment).not.toHaveBeenCalled()
      expect(mockRepo.addExpense).not.toHaveBeenCalled()
    })

    it('rejects unsupported MIME type before attempting upload', async () => {
      const { result } = await setupHook()
      const bad = new File(['x'], 'hack.exe', { type: 'application/x-msdownload' })

      await expect(
        act(async () => { await result.current.addExpenseWithFiles(newExpense, [bad]) })
      ).rejects.toMatchObject({ reason: { code: 'unsupportedType' } })

      expect(mockUploadAttachment).not.toHaveBeenCalled()
    })

    it('rejects batch that would exceed household quota', async () => {
      const { result } = await setupHook()
      // 5000 existing + 9 MB + 9 MB + 9 MB + 9 MB + 9 MB = 45 MB, next 9 would overflow
      const files = Array.from({ length: 6 }, (_, i) =>
        sizedFile(`f${i}.pdf`, 'application/pdf', 9 * 1024 * 1024),
      )

      await expect(
        act(async () => { await result.current.addExpenseWithFiles(newExpense, files) })
      ).rejects.toMatchObject({ reason: { code: 'householdStorageLimit' } })

      expect(mockUploadAttachment).not.toHaveBeenCalled()
    })

    it('rejects more than MAX_FILES_PER_EXPENSE files', async () => {
      const { result } = await setupHook()
      const files = Array.from({ length: 11 }, (_, i) =>
        sizedFile(`f${i}.pdf`, 'application/pdf', 100),
      )

      await expect(
        act(async () => { await result.current.addExpenseWithFiles(newExpense, files) })
      ).rejects.toMatchObject({ reason: { code: 'maxFilesPerExpense' } })

      expect(mockUploadAttachment).not.toHaveBeenCalled()
    })
  })
})
