import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MortgageConfig } from '@/types/mortgage'
import type { ReactNode } from 'react'

// ── Mocks (hoisted) ──────────────────────────────────

const baseMortgage: MortgageConfig = {
  principal: 20000000,
  annualRate: 3.5,
  termYears: 30,
  startDate: '2025-01-01',
  rateType: 'fixed',
  amortizationType: 'french',
  monthlyPayment: 89000,
  monthlyPaymentOverride: false,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

const { mockRepo } = vi.hoisted(() => {
  const mockRepo = {
    getMortgage: vi.fn(),
    saveMortgage: vi.fn(),
    deleteMortgage: vi.fn(),
    getExpenses: vi.fn(),
    addExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  }
  return { mockRepo }
})

vi.mock('@/data/firestore-repository', () => ({
  FirestoreRepository: vi.fn().mockImplementation(function () { return mockRepo }),
}))

vi.mock('@/data/firebase', () => ({ db: {} }))

vi.mock('@/data/reference-rates', () => ({
  generateHistoricalRatePeriods: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/mortgage-utils', () => ({
  getMixedSwitchDate: vi.fn().mockReturnValue('2027-01-01'),
}))

vi.mock('@/lib/mortgage-country', () => ({
  computeEffectiveRate: vi.fn().mockReturnValue(3.5),
}))

vi.mock('./HouseholdContext', () => ({
  useHousehold: () => ({
    house: { id: 'house-1', name: 'Test House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
  }),
}))

import { MortgageProvider, useMortgage } from './MortgageContext'

// ── Helpers ───────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <MortgageProvider>{children}</MortgageProvider>
}

async function setupHook() {
  const result = renderHook(() => useMortgage(), { wrapper })
  // Wait for initial load
  await act(async () => {})
  return result
}

// ── Tests ─────────────────────────────────────────────

describe('MortgageContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepo.getMortgage.mockResolvedValue({ ...baseMortgage })
    mockRepo.saveMortgage.mockImplementation(async (config: MortgageConfig) => ({
      ...config,
      updatedAt: '2026-04-12T12:00:00Z',
    }))
    mockRepo.deleteMortgage.mockResolvedValue(undefined)
  })

  // ── Initial load ──────────────────────────────────

  describe('initial load', () => {
    it('fetches mortgage on mount and sets loading to false', async () => {
      const { result } = renderHook(() => useMortgage(), { wrapper })
      expect(result.current.loading).toBe(true)

      await act(async () => {})

      expect(result.current.loading).toBe(false)
      expect(result.current.mortgage).not.toBeNull()
      expect(result.current.mortgage?.annualRate).toBe(3.5)
    })

    it('sets mortgage to null when none exists', async () => {
      mockRepo.getMortgage.mockResolvedValueOnce(null)
      const { result } = await setupHook()

      expect(result.current.mortgage).toBeNull()
      expect(result.current.loading).toBe(false)
    })
  })

  // ── saveMortgage ──────────────────────────────────

  describe('saveMortgage', () => {
    it('updates state immediately (optimistic)', async () => {
      const { result } = await setupHook()
      expect(result.current.mortgage?.annualRate).toBe(3.5)

      const updated = { ...baseMortgage, annualRate: 4.0 }

      let savePromise: Promise<void>
      act(() => {
        savePromise = result.current.saveMortgage(updated)
      })

      // Updated immediately
      expect(result.current.mortgage?.annualRate).toBe(4.0)

      await act(async () => { await savePromise! })

      // Persisted — state now matches server response
      expect(mockRepo.saveMortgage).toHaveBeenCalled()
      expect(result.current.mortgage?.updatedAt).toBe('2026-04-12T12:00:00Z')
    })

    it('updates extra repayments optimistically', async () => {
      const { result } = await setupHook()

      const withRepayment: MortgageConfig = {
        ...baseMortgage,
        extraRepayments: [{ id: 'rep-1', date: '2025-06-01', amount: 500000, recurring: false, mode: 'reduce_term' }],
      }

      let savePromise: Promise<void>
      act(() => {
        savePromise = result.current.saveMortgage(withRepayment)
      })

      // Extra repayment visible immediately
      expect(result.current.mortgage?.extraRepayments).toHaveLength(1)
      expect(result.current.mortgage?.extraRepayments![0].amount).toBe(500000)

      await act(async () => { await savePromise! })
    })

    it('removes sub-items optimistically (rate period delete)', async () => {
      // Start with mortgage that has rate periods
      const withPeriods: MortgageConfig = {
        ...baseMortgage,
        ratePeriods: [
          { id: 'rp-1', startDate: '2025-07-01', annualRate: 3.8, rateType: 'variable' },
          { id: 'rp-2', startDate: '2026-01-01', annualRate: 4.0, rateType: 'variable' },
        ],
      }
      mockRepo.getMortgage.mockResolvedValueOnce(withPeriods)
      const { result } = await setupHook()
      expect(result.current.mortgage?.ratePeriods).toHaveLength(2)

      // Delete one rate period
      const withOnePeriod = { ...withPeriods, ratePeriods: withPeriods.ratePeriods!.filter((p) => p.id !== 'rp-1') }

      let savePromise: Promise<void>
      act(() => {
        savePromise = result.current.saveMortgage(withOnePeriod)
      })

      // Immediately shows only 1 rate period
      expect(result.current.mortgage?.ratePeriods).toHaveLength(1)
      expect(result.current.mortgage?.ratePeriods![0].id).toBe('rp-2')

      await act(async () => { await savePromise! })
    })

    it('rolls back on backend error', async () => {
      mockRepo.saveMortgage.mockRejectedValueOnce(new Error('Save failed'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.saveMortgage({ ...baseMortgage, annualRate: 99 }) })
      ).rejects.toThrow('Save failed')

      // Rolled back to original
      expect(result.current.mortgage?.annualRate).toBe(3.5)
      expect(result.current.mortgage?.updatedAt).toBe('2025-01-01T00:00:00Z')
    })
  })

  // ── deleteMortgage ────────────────────────────────

  describe('deleteMortgage', () => {
    it('clears state immediately (optimistic)', async () => {
      const { result } = await setupHook()
      expect(result.current.mortgage).not.toBeNull()

      let deletePromise: Promise<void>
      act(() => {
        deletePromise = result.current.deleteMortgage()
      })

      // Cleared immediately
      expect(result.current.mortgage).toBeNull()

      await act(async () => { await deletePromise! })
      expect(mockRepo.deleteMortgage).toHaveBeenCalled()
    })

    it('rolls back on backend error', async () => {
      mockRepo.deleteMortgage.mockRejectedValueOnce(new Error('Delete failed'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.deleteMortgage() })
      ).rejects.toThrow('Delete failed')

      // Rolled back — mortgage restored
      expect(result.current.mortgage).not.toBeNull()
      expect(result.current.mortgage?.annualRate).toBe(3.5)
    })
  })
})
