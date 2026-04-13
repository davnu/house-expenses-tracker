import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface MonthlyTableProps {
  expenses: Expense[]
}

export function MonthlyTable({ expenses }: MonthlyTableProps) {
  const { t } = useTranslation()
  const data = useMemo(() => {
    const byMonth: Record<string, number> = {}

    for (const e of expenses) {
      const month = e.date.substring(0, 7)
      byMonth[month] = (byMonth[month] ?? 0) + e.amount
    }

    let cumulative = 0
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => {
        cumulative += total
        return { month, total, cumulative }
      })
  }, [expenses])

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('summary.monthlyBreakdown')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 font-medium">{t('summary.month')}</th>
                <th className="text-right py-2 font-medium">{t('common.amount')}</th>
                <th className="text-right py-2 font-medium">{t('summary.cumulative')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.month} className="border-b last:border-0">
                  <td className="py-2 font-medium">{row.month}</td>
                  <td className="py-2 text-right">{formatCurrency(row.total)}</td>
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
