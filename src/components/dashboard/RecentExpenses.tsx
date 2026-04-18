import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useHousehold } from '@/context/HouseholdContext'
import { cn, formatCurrency, getDateLocale } from '@/lib/utils'
import { getCategoryLabel, SPLIT_PAYER, UNPAID_BADGE_CLASSES } from '@/lib/constants'
import { isExpensePaid } from '@/lib/expense-utils'
import { ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import type { Expense } from '@/types/expense'

interface RecentExpensesProps {
  expenses: Expense[]
}

export function RecentExpenses({ expenses }: RecentExpensesProps) {
  const { t } = useTranslation()
  const { members, getMemberName, getMemberColor } = useHousehold()
  const isMultiMember = members.length > 1

  const recent = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [expenses]
  )

  if (recent.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t('dashboard.recentExpenses')}</CardTitle>
          <Link
            to="/app/expenses"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t('dashboard.viewAll')}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {recent.map((expense) => (
            <div key={expense.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              {isMultiMember && (expense.payer === SPLIT_PAYER ? (() => {
                // Split payment: surface each contributor so the list tells
                // the same story as ExpenseList at a glance.
                const positive = (expense.splits ?? []).filter((s) => s.shareCents > 0)
                const title = positive.length > 0
                  ? positive.map((s) => `${getMemberName(s.uid)} ${formatCurrency(s.shareCents)}`).join(' · ')
                  : getMemberName(SPLIT_PAYER)
                return (
                  <div className="flex -space-x-1 shrink-0" title={title}>
                    {positive.slice(0, 3).map((s) => (
                      <span
                        key={s.uid}
                        className="h-2 w-2 rounded-full ring-1 ring-background"
                        style={{ backgroundColor: getMemberColor(s.uid) }}
                      />
                    ))}
                    {positive.length === 0 && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: getMemberColor(SPLIT_PAYER) }}
                      />
                    )}
                  </div>
                )
              })() : (
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: getMemberColor(expense.payer) }}
                  title={getMemberName(expense.payer)}
                />
              ))}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatCurrency(expense.amount)}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {getCategoryLabel(expense.category)}
                  </Badge>
                  {!isExpensePaid(expense) && (
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', UNPAID_BADGE_CLASSES)}>
                      {t('expenses.unpaid')}
                    </Badge>
                  )}
                </div>
                {expense.description && (
                  <p className="text-xs text-muted-foreground truncate">{expense.description}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {format(new Date(expense.date), 'MMM d', { locale: getDateLocale() })}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
