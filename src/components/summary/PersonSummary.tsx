import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import type { Expense } from '@/types/expense'

interface PersonSummaryProps {
  expenses: Expense[]
}

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

export function PersonSummary({ expenses }: PersonSummaryProps) {
  const { members } = useHousehold()

  const data = useMemo(() => {
    const grandTotal = expenses.reduce((s, e) => s + e.amount, 0)

    return members.map((m) => {
      const memberExpenses = expenses.filter((e) => e.payer === m.uid)
      const total = memberExpenses.reduce((s, e) => s + e.amount, 0)
      const percent = grandTotal > 0 ? (total / grandTotal) * 100 : 0

      // Top 3 categories
      const byCat: Record<string, number> = {}
      for (const e of memberExpenses) {
        byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
      }
      const topCategories = Object.entries(byCat)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([cat, amount]) => ({ label: categoryLabel(cat), amount }))

      return {
        uid: m.uid,
        name: m.displayName,
        color: m.color,
        total,
        percent,
        count: memberExpenses.length,
        topCategories,
      }
    })
  }, [expenses, members])

  if (data.length === 0) return null

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Per Person</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.map((person) => (
          <Card key={person.uid}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: person.color }} />
                {person.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-2xl font-bold">{formatCurrency(person.total)}</span>
                <span className="text-sm text-muted-foreground self-end">
                  {person.percent.toFixed(1)}% &middot; {person.count} expenses
                </span>
              </div>
              {person.topCategories.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Top categories</p>
                  {person.topCategories.map((cat) => (
                    <div key={cat.label} className="flex justify-between text-sm">
                      <span>{cat.label}</span>
                      <span className="text-muted-foreground">{formatCurrency(cat.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
