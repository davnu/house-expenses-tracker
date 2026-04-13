import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { getCategoryLabel } from '@/lib/constants'
import type { Expense } from '@/types/expense'

interface CategoryTableProps {
  expenses: Expense[]
  mortgagePaid?: number
}

export function CategoryTable({ expenses, mortgagePaid = 0 }: CategoryTableProps) {
  const { t } = useTranslation()
  const data = useMemo(() => {
    const byCat: Record<string, { total: number; count: number }> = {}
    const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
    const grandTotal = expenseTotal + mortgagePaid

    for (const e of expenses) {
      if (!byCat[e.category]) byCat[e.category] = { total: 0, count: 0 }
      byCat[e.category].total += e.amount
      byCat[e.category].count++
    }

    const rows = Object.entries(byCat)
      .map(([cat, { total, count }]) => ({
        category: cat,
        label: getCategoryLabel(cat),
        total,
        count,
        percent: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    return { rows, grandTotal, hasMortgage: mortgagePaid > 0 }
  }, [expenses, mortgagePaid])

  if (data.rows.length === 0 && !data.hasMortgage) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('summary.categoryBreakdown')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 font-medium">{t('filters.category')}</th>
                <th className="text-right py-2 font-medium">{t('summary.count')}</th>
                <th className="text-right py-2 font-medium">{t('common.total')}</th>
                <th className="text-right py-2 font-medium">{t('summary.percent')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.category} className="border-b last:border-0">
                  <td className="py-2 font-medium">{row.label}</td>
                  <td className="py-2 text-right text-muted-foreground">{row.count}</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(row.total)}</td>
                  <td className="py-2 text-right text-muted-foreground">{row.percent.toFixed(1)}%</td>
                </tr>
              ))}
              {data.hasMortgage && (
                <tr className="border-b">
                  <td className="py-2 font-medium">{t('nav.mortgage')}</td>
                  <td className="py-2 text-right text-muted-foreground">&mdash;</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(mortgagePaid)}</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {data.grandTotal > 0 ? ((mortgagePaid / data.grandTotal) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold text-base border-t-2">
                <td className="py-2" colSpan={2}>{t('common.total')}</td>
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
