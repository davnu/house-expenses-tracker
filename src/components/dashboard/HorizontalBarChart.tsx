import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EXPENSE_CATEGORIES, CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface HorizontalBarChartProps {
  expenses: Expense[]
  title?: string
}

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

export function HorizontalBarChart({ expenses, title = 'By Category' }: HorizontalBarChartProps) {
  const data = useMemo(() => {
    const byCat: Record<string, number> = {}
    for (const e of expenses) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
    }
    return Object.entries(byCat)
      .map(([cat, amount]) => ({
        name: categoryLabel(cat),
        category: cat,
        amount: Math.round(amount / 100 * 100) / 100,
        fill: CATEGORY_COLORS[cat] ?? '#6b7280',
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses])

  if (data.length === 0) return null

  const height = Math.max(200, data.length * 40 + 40)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={110} />
            <Tooltip
              formatter={(value) => formatCurrency(Math.round(Number(value) * 100))}
            />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <rect key={entry.category} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
