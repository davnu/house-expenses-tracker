import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { Home } from 'lucide-react'
import { getBudgetStatus, getBudgetStatusColor } from '@/lib/budget-utils'
import { isExpensePaid } from '@/lib/expense-utils'
import type { Expense } from '@/types/expense'
import type { BudgetConfig } from '@/types/budget'

interface TotalCostCardProps {
  expenses: Expense[]
  mortgagePaid: number // cents
  budget?: BudgetConfig | null
}

export function TotalCostCard({ expenses, mortgagePaid, budget }: TotalCostCardProps) {
  const { t } = useTranslation()
  const { expenseTotal, unpaidTotal } = useMemo(() => {
    let total = 0, unpaid = 0
    for (const e of expenses) {
      total += e.amount
      if (!isExpensePaid(e)) unpaid += e.amount
    }
    return { expenseTotal: total, unpaidTotal: unpaid }
  }, [expenses])
  const total = expenseTotal + mortgagePaid

  const hasBudget = budget && budget.totalBudget > 0
  const budgetPercent = hasBudget ? Math.min(100, (total / budget.totalBudget) * 100) : 0
  const budgetStatus = hasBudget ? getBudgetStatus(total, budget.totalBudget) : 'on_track'
  const barColor = getBudgetStatusColor(budgetStatus)

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Home className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('dashboard.totalHouseCost')}</p>
            <p className="text-3xl font-bold tracking-tight">{formatCurrency(total)}</p>
          </div>
        </div>

        {hasBudget && (
          <div className="mt-3 space-y-1.5">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${budgetPercent}%`, backgroundColor: barColor }}
              />
            </div>
            <div className="flex items-baseline justify-between text-sm text-muted-foreground">
              <span>{t('budget.spent', { spent: formatCurrency(total), budget: formatCurrency(budget.totalBudget) })}</span>
              {total <= budget.totalBudget
                ? <span>{t('budget.remaining', { amount: formatCurrency(budget.totalBudget - total) })}</span>
                : <span className="text-destructive font-medium">{t('budget.overBy', { amount: formatCurrency(total - budget.totalBudget) })}</span>
              }
            </div>
          </div>
        )}

        <div className="flex gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
          <span>{t('dashboard.expenseCount', { count: expenses.length, total: formatCurrency(expenseTotal) })}</span>
          {mortgagePaid > 0 && <span>{t('dashboard.mortgageAmount', { total: formatCurrency(mortgagePaid) })}</span>}
          {unpaidTotal > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {t('dashboard.unpaidAmount', { total: formatCurrency(unpaidTotal) })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
