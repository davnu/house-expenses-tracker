import { useMemo } from 'react'
import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import type { Expense } from '@/types/expense'

interface RecentExpensesProps {
  expenses: Expense[]
}

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

export function RecentExpenses({ expenses }: RecentExpensesProps) {
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
          <CardTitle className="text-base">Recent Expenses</CardTitle>
          <Link
            to="/expenses"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {recent.map((expense) => (
            <div key={expense.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              {isMultiMember && (
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: getMemberColor(expense.payer) }}
                  title={getMemberName(expense.payer)}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatCurrency(expense.amount)}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {categoryLabel(expense.category)}
                  </Badge>
                </div>
                {expense.description && (
                  <p className="text-xs text-muted-foreground truncate">{expense.description}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {format(new Date(expense.date), 'MMM d')}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
