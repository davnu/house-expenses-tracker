import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Expense } from '@/types/expense'
import type { ReactNode } from 'react'

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

const { mockRepo, mockUploadAttachment, mockDeleteAttachment, mockDeleteAttachments } = vi.hoisted(() => {
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
    mockDeleteAttachment: vi.fn(),
    mockDeleteAttachments: vi.fn(),
  }
})

vi.mock('@/data/firestore-repository', () => ({
  FirestoreRepository: vi.fn().mockImplementation(function () { return mockRepo }),
}))

vi.mock('@/data/firebase', () => ({ db: {}, storage: {} }))

vi.mock('@/data/firebase-attachment-store', () => ({
  uploadAttachment: mockUploadAttachment,
  deleteAttachment: mockDeleteAttachment,
  deleteAttachments: mockDeleteAttachments,
}))

vi.mock('./HouseholdContext', () => ({
  useHousehold: () => ({
    house: { id: 'house-1', name: 'Test House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
  }),
}))

// Import after mocks are set up
import { ExpenseProvider, useExpenses } from './ExpenseContext'

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
      ).rejects.toThrow('Maximum')

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

    it('throws on MAX_FILES_PER_EXPENSE without corrupting state', async () => {
      const { result } = await setupHook()
      // exp-1 already has 1 attachment, try to add 10 more (total 11 > MAX_FILES_PER_EXPENSE=10)
      const files = Array.from({ length: 10 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }))

      await expect(
        act(async () => { await result.current.addAttachmentsToExpense('exp-1', files) })
      ).rejects.toThrow('Maximum')

      // State untouched
      expect(result.current.expenses.find((e) => e.id === 'exp-1')!.attachments).toHaveLength(1)
      expect(result.current.pendingAttachmentIds.size).toBe(0)
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
})
