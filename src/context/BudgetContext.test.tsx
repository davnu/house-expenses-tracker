import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { BudgetConfig } from '@/types/budget'
import type { ReactNode } from 'react'

// ── Mocks (hoisted) ──────────────────────────────────

const baseBudget: BudgetConfig = {
  totalBudget: 12000000,
  categories: { down_payment: 5000000, renovations: 3000000 },
  updatedAt: '2026-04-01T00:00:00Z',
}

const { mockRepo } = vi.hoisted(() => {
  const mockRepo = {
    getBudget: vi.fn(),
    saveBudget: vi.fn(),
    deleteBudget: vi.fn(),
  }
  return { mockRepo }
})

vi.mock('@/data/firestore-repository', () => ({
  FirestoreRepository: vi.fn().mockImplementation(function () { return mockRepo }),
}))

vi.mock('@/data/firebase', () => ({ db: {} }))

vi.mock('./HouseholdContext', () => ({
  useHousehold: () => ({
    house: { id: 'house-1', name: 'Test House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
  }),
}))

import { BudgetProvider, useBudget } from './BudgetContext'

// ── Helpers ───────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <BudgetProvider>{children}</BudgetProvider>
}

async function setupHook() {
  const result = renderHook(() => useBudget(), { wrapper })
  await act(async () => {})
  return result
}

// ── Tests ─────────────────────────────────────────────

describe('BudgetContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepo.getBudget.mockResolvedValue({ ...baseBudget })
    mockRepo.saveBudget.mockImplementation(async (config: BudgetConfig) => ({
      ...config,
      updatedAt: '2026-04-15T12:00:00Z',
    }))
    mockRepo.deleteBudget.mockResolvedValue(undefined)
  })

  // ── Initial load ──────────────────────────────────

  describe('initial load', () => {
    it('fetches budget on mount and sets loading to false', async () => {
      const { result } = renderHook(() => useBudget(), { wrapper })
      expect(result.current.loading).toBe(true)

      await act(async () => {})

      expect(result.current.loading).toBe(false)
      expect(result.current.budget).not.toBeNull()
      expect(result.current.budget?.totalBudget).toBe(12000000)
    })

    it('sets budget to null when none exists', async () => {
      mockRepo.getBudget.mockResolvedValueOnce(null)
      const { result } = await setupHook()

      expect(result.current.budget).toBeNull()
      expect(result.current.loading).toBe(false)
    })
  })

  // ── saveBudget ──────────────────────────────────

  describe('saveBudget', () => {
    it('updates state immediately (optimistic)', async () => {
      const { result } = await setupHook()
      expect(result.current.budget?.totalBudget).toBe(12000000)

      const updated = { ...baseBudget, totalBudget: 15000000 }

      let savePromise: Promise<void>
      act(() => {
        savePromise = result.current.saveBudget(updated)
      })

      expect(result.current.budget?.totalBudget).toBe(15000000)

      await act(async () => { await savePromise! })

      expect(mockRepo.saveBudget).toHaveBeenCalled()
      expect(result.current.budget?.updatedAt).toBe('2026-04-15T12:00:00Z')
    })

    it('updates categories optimistically', async () => {
      const { result } = await setupHook()

      const updated: BudgetConfig = {
        ...baseBudget,
        categories: { ...baseBudget.categories, furniture: 2000000 },
      }

      let savePromise: Promise<void>
      act(() => {
        savePromise = result.current.saveBudget(updated)
      })

      expect(result.current.budget?.categories.furniture).toBe(2000000)

      await act(async () => { await savePromise! })
    })

    it('rolls back on backend error', async () => {
      mockRepo.saveBudget.mockRejectedValueOnce(new Error('Save failed'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.saveBudget({ ...baseBudget, totalBudget: 99 }) })
      ).rejects.toThrow('Save failed')

      expect(result.current.budget?.totalBudget).toBe(12000000)
      expect(result.current.budget?.updatedAt).toBe('2026-04-01T00:00:00Z')
    })
  })

  // ── deleteBudget ────────────────────────────────

  describe('deleteBudget', () => {
    it('clears state immediately (optimistic)', async () => {
      const { result } = await setupHook()
      expect(result.current.budget).not.toBeNull()

      let deletePromise: Promise<void>
      act(() => {
        deletePromise = result.current.deleteBudget()
      })

      expect(result.current.budget).toBeNull()

      await act(async () => { await deletePromise! })
      expect(mockRepo.deleteBudget).toHaveBeenCalled()
    })

    it('rolls back on backend error', async () => {
      mockRepo.deleteBudget.mockRejectedValueOnce(new Error('Delete failed'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.deleteBudget() })
      ).rejects.toThrow('Delete failed')

      expect(result.current.budget).not.toBeNull()
      expect(result.current.budget?.totalBudget).toBe(12000000)
    })
  })
})
