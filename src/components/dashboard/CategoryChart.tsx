import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import type { Expense } from '@/types/expense'

interface CategoryChartProps {
  expenses: Expense[]
  title?: string
}

export function CategoryChart({ expenses, title = 'Spending by Category' }: CategoryChartProps) {
  const { members, getMemberColor } = useHousehold()

  const data = useMemo(() => {
    const byCategory: Record<string, Record<string, number>> = {}

    for (const exp of expenses) {
      if (!byCategory[exp.category]) byCategory[exp.category] = {}
      byCategory[exp.category][exp.payer] = (byCategory[exp.category][exp.payer] ?? 0) + exp.amount / 100
    }

    return EXPENSE_CATEGORIES
      .map((cat) => {
        const entry: Record<string, string | number> = { name: cat.label }
        for (const m of members) {
          entry[m.displayName] = Math.round((byCategory[cat.value]?.[m.uid] ?? 0) * 100) / 100
        }
        return entry
      })
      .filter((d) => members.some((m) => (d[m.displayName] as number) > 0))
  }, [expenses, members])

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => `€${Number(value).toFixed(2)}`} />
            <Legend />
            {members.map((m) => (
              <Bar key={m.uid} dataKey={m.displayName} stackId="a" fill={getMemberColor(m.uid)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
