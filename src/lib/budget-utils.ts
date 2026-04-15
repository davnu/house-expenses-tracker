export const BUDGET_WARNING_THRESHOLD = 0.8
export const BUDGET_OVER_THRESHOLD = 1.0

export type BudgetStatus = 'on_track' | 'warning' | 'over'

export function getBudgetStatus(spent: number, budgeted: number): BudgetStatus {
  if (budgeted <= 0) return 'on_track'
  const ratio = spent / budgeted
  if (ratio >= BUDGET_OVER_THRESHOLD) return 'over'
  if (ratio >= BUDGET_WARNING_THRESHOLD) return 'warning'
  return 'on_track'
}

export function getBudgetStatusColor(status: BudgetStatus): string {
  switch (status) {
    case 'over': return '#dc2626'
    case 'warning': return '#f59e0b'
    case 'on_track': return '#2a9d90'
  }
}
