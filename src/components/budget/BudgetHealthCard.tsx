import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CATEGORY_COLORS, getCategoryLabel } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import { getBudgetStatus, getBudgetStatusColor } from '@/lib/budget-utils'
import type { Expense } from '@/types/expense'
import type { BudgetConfig } from '@/types/budget'

interface BudgetHealthCardProps {
  expenses: Expense[]
  budget: BudgetConfig
}

interface CategoryRow {
  category: string
  label: string
  spent: number
  budgeted: number
  percent: number
  status: ReturnType<typeof getBudgetStatus>
  color: string
  barColor: string
}

export function BudgetHealthCard({ expenses, budget }: BudgetHealthCardProps) {
  const { t } = useTranslation()

  const { rows, overCount } = useMemo(() => {
    // Compute spent per category
    const byCat: Record<string, number> = {}
    for (const e of expenses) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
    }

    // Build rows for all categories that have a budget
    const result: CategoryRow[] = []
    for (const [cat, budgeted] of Object.entries(budget.categories)) {
      if (!budgeted || budgeted <= 0) continue
      const spent = byCat[cat] ?? 0
      const status = getBudgetStatus(spent, budgeted)
      result.push({
        category: cat,
        label: getCategoryLabel(cat),
        spent,
        budgeted,
        percent: Math.min(100, (spent / budgeted) * 100),
        status,
        color: CATEGORY_COLORS[cat] ?? '#6b7280',
        barColor: getBudgetStatusColor(status),
      })
    }

    // Sort: over first, then warning, then on_track. Within each group, by spent/budgeted ratio descending.
    const order = { over: 0, warning: 1, on_track: 2 }
    result.sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      return (b.spent / b.budgeted) - (a.spent / a.budgeted)
    })

    return { rows: result, overCount: result.filter((r) => r.status === 'over').length }
  }, [expenses, budget])

  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('budget.budgetStatus')}</CardTitle>
        {overCount > 0 ? (
          <Badge variant="destructive">
            {t('budget.categoriesOver', { count: overCount })}
          </Badge>
        ) : (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" style={{ color: getBudgetStatusColor('on_track') }} />
            <span>{t('budget.onTrack')}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.category} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                <span className="truncate">{row.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-muted-foreground">
                  {t('budget.spent', { spent: formatCurrency(row.spent), budget: formatCurrency(row.budgeted) })}
                </span>
                {row.status === 'over' && (
                  <span className="text-xs font-medium text-destructive">
                    {t('budget.overBy', { amount: formatCurrency(row.spent - row.budgeted) })}
                  </span>
                )}
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${row.percent}%`, backgroundColor: row.barColor }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
