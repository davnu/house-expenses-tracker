import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import type { BudgetConfig } from '@/types/budget'
import { FirestoreRepository } from '@/data/firestore-repository'
import { db } from '@/data/firebase'
import { useHousehold } from './HouseholdContext'

interface BudgetContextValue {
  budget: BudgetConfig | null
  loading: boolean
  saveBudget: (config: BudgetConfig) => Promise<void>
  deleteBudget: () => Promise<void>
}

const BudgetContext = createContext<BudgetContextValue | null>(null)

export function BudgetProvider({ children }: { children: ReactNode }) {
  const { house } = useHousehold()
  const [budget, setBudget] = useState<BudgetConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const houseId = house?.id

  const budgetRef = useRef(budget)
  budgetRef.current = budget

  useEffect(() => {
    if (!houseId) {
      setBudget(null)
      setLoading(false)
      return
    }
    const repo = new FirestoreRepository(db, houseId)
    repo.getBudget()
      .then((b) => setBudget(b))
      .catch(() => setBudget(null))
      .finally(() => setLoading(false))
  }, [houseId])

  const save = useCallback(async (config: BudgetConfig) => {
    if (!houseId) return
    const previous = budgetRef.current

    setBudget(config)

    try {
      const repo = new FirestoreRepository(db, houseId)
      const saved = await repo.saveBudget(config)
      setBudget(saved)
    } catch (err) {
      setBudget(previous)
      throw err
    }
  }, [houseId])

  const remove = useCallback(async () => {
    if (!houseId) return
    const previous = budgetRef.current

    setBudget(null)

    try {
      const repo = new FirestoreRepository(db, houseId)
      await repo.deleteBudget()
    } catch (err) {
      setBudget(previous)
      throw err
    }
  }, [houseId])

  return (
    <BudgetContext.Provider value={{ budget, loading, saveBudget: save, deleteBudget: remove }}>
      {children}
    </BudgetContext.Provider>
  )
}

export function useBudget() {
  const ctx = useContext(BudgetContext)
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider')
  return ctx
}
