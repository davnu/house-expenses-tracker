import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { getCostPhase } from '@/lib/expense-utils'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import type { Expense } from '@/types/expense'

interface CategoryTableProps {
  expenses: Expense[]
}

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

export function CategoryTable({ expenses }: CategoryTableProps) {
  const data = useMemo(() => {
    const byCat: Record<string, { total: number; count: number; phase: string }> = {}
    const grandTotal = expenses.reduce((s, e) => s + e.amount, 0)

    for (const e of expenses) {
      if (!byCat[e.category]) {
        byCat[e.category] = { total: 0, count: 0, phase: getCostPhase(e) }
      }
      byCat[e.category].total += e.amount
      byCat[e.category].count++
    }

    const rows = Object.entries(byCat)
      .map(([cat, { total, count, phase }]) => ({
        category: cat,
        label: categoryLabel(cat),
        phase,
        total,
        count,
        percent: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    const oneTimeTotal = rows.filter((r) => r.phase === 'one-time').reduce((s, r) => s + r.total, 0)
    const ongoingTotal = rows.filter((r) => r.phase === 'ongoing').reduce((s, r) => s + r.total, 0)

    return { rows, grandTotal, oneTimeTotal, ongoingTotal }
  }, [expenses])

  if (data.rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 font-medium">Category</th>
                <th className="text-left py-2 font-medium">Type</th>
                <th className="text-right py-2 font-medium">Count</th>
                <th className="text-right py-2 font-medium">Total</th>
                <th className="text-right py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.category} className="border-b last:border-0">
                  <td className="py-2 font-medium">{row.label}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      row.phase === 'one-time' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {row.phase === 'one-time' ? 'Purchase' : 'Monthly'}
                    </span>
                  </td>
                  <td className="py-2 text-right text-muted-foreground">{row.count}</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                  <td className="py-2 text-right text-muted-foreground">{row.percent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2" colSpan={3}>Purchase costs subtotal</td>
                <td className="py-2 text-right">{formatCurrency(data.oneTimeTotal)}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {data.grandTotal > 0 ? ((data.oneTimeTotal / data.grandTotal) * 100).toFixed(1) : 0}%
                </td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2" colSpan={3}>Monthly costs subtotal</td>
                <td className="py-2 text-right">{formatCurrency(data.ongoingTotal)}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {data.grandTotal > 0 ? ((data.ongoingTotal / data.grandTotal) * 100).toFixed(1) : 0}%
                </td>
              </tr>
              <tr className="font-bold text-base border-t">
                <td className="py-2" colSpan={3}>Grand total</td>
                <td className="py-2 text-right">{formatCurrency(data.grandTotal)}</td>
                <td className="py-2 text-right">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
