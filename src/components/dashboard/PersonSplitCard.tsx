import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface PersonSplitCardProps {
  expenses: Expense[]
}

export function PersonSplitCard({ expenses }: PersonSplitCardProps) {
  const { members } = useHousehold()

  const data = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0)
    return members.map((m) => {
      const memberTotal = expenses.filter((e) => e.payer === m.uid).reduce((s, e) => s + e.amount, 0)
      return {
        uid: m.uid,
        name: m.displayName,
        color: m.color,
        total: memberTotal,
        percent: total > 0 ? (memberTotal / total) * 100 : 0,
      }
    })
  }, [expenses, members])

  if (members.length < 2) return null

  const total = data.reduce((s, d) => s + d.total, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Who Paid What</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stacked bar */}
        {total > 0 && (
          <div className="h-3 rounded-full overflow-hidden flex">
            {data.filter((d) => d.total > 0).map((d) => (
              <div
                key={d.uid}
                className="h-full transition-all"
                style={{ width: `${d.percent}%`, backgroundColor: d.color }}
              />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="space-y-2">
          {data.map((d) => (
            <div key={d.uid} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span>{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatCurrency(d.total)}</span>
                <span className="text-xs text-muted-foreground w-10 text-right">{d.percent.toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
