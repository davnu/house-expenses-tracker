import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { getCostPhase } from '@/lib/expense-utils'
import type { Expense } from '@/types/expense'

interface MonthlyTableProps {
  expenses: Expense[]
}

export function MonthlyTable({ expenses }: MonthlyTableProps) {
  const data = useMemo(() => {
    const byMonth: Record<string, { oneTime: number; ongoing: number }> = {}

    for (const e of expenses) {
      const month = e.date.substring(0, 7)
      if (!byMonth[month]) byMonth[month] = { oneTime: 0, ongoing: 0 }
      if (getCostPhase(e) === 'one-time') {
        byMonth[month].oneTime += e.amount
      } else {
        byMonth[month].ongoing += e.amount
      }
    }

    let cumulative = 0
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { oneTime, ongoing }]) => {
        cumulative += oneTime + ongoing
        return {
          month,
          oneTime,
          ongoing,
          total: oneTime + ongoing,
          cumulative,
        }
      })
  }, [expenses])

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 font-medium">Month</th>
                <th className="text-right py-2 font-medium">Purchase</th>
                <th className="text-right py-2 font-medium">Monthly</th>
                <th className="text-right py-2 font-medium">Total</th>
                <th className="text-right py-2 font-medium">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.month} className="border-b last:border-0">
                  <td className="py-2 font-medium">{row.month}</td>
                  <td className="py-2 text-right">{row.oneTime > 0 ? formatCurrency(row.oneTime) : '—'}</td>
                  <td className="py-2 text-right">{row.ongoing > 0 ? formatCurrency(row.ongoing) : '—'}</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                  <td className="py-2 text-right text-muted-foreground">{formatCurrency(row.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
