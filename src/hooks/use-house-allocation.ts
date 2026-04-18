import { useMemo } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { sumAllocations, sumCashContributions } from '@/lib/cost-split'
import type { CostSplitShare, Expense } from '@/types/expense'

interface HouseAllocation {
  /** uid → cents owed (ownership share of the total). */
  allocation: Map<string, number>
  /** uid → cents actually paid (cash fronted). */
  cash: Map<string, number>
  /** Sum of all expense amounts (cents). */
  total: number
}

/**
 * Single-pass aggregation of the two views every dashboard/summary surface
 * cares about: allocation (who owns the cost) and cash contribution (who paid).
 * Exposed as one hook so multiple consumers share the memoization rather than
 * each re-iterating the expense list.
 *
 * Pass an override split (e.g. a draft ratio in Settings) to preview how a
 * ratio change would shift the numbers before committing it to Firestore.
 */
export function useHouseAllocation(
  expenses: Expense[],
  overrideSplit?: CostSplitShare[],
): HouseAllocation {
  const { houseSplit } = useHousehold()
  const effectiveSplit = overrideSplit ?? houseSplit

  return useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0)
    return {
      total,
      allocation: sumAllocations(expenses, effectiveSplit),
      cash: sumCashContributions(expenses),
    }
  }, [expenses, effectiveSplit])
}
