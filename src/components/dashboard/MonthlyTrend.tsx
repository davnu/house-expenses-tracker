import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface MonthlyTrendProps {
  expenses: Expense[]
  title?: string
}

export function MonthlyTrend({ expenses, title = 'Spending by Month' }: MonthlyTrendProps) {
  const { members, getMemberColor } = useHousehold()

  const data = useMemo(() => {
    const byMonth: Record<string, Record<string, number>> = {}

    for (const exp of expenses) {
      const month = exp.date.substring(0, 7)
      if (!byMonth[month]) byMonth[month] = {}
      byMonth[month][exp.payer] = (byMonth[month][exp.payer] ?? 0) + exp.amount
    }

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => {
        const entry: Record<string, string | number> = { month }
        for (const m of members) {
          entry[m.displayName] = vals[m.uid] ?? 0
        }
        return entry
      })
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${(Number(v) / 100).toFixed(0)}`}
            />
            <Tooltip
              formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
              labelFormatter={(label) => `${label}`}
            />
            <Legend />
            {members.map((m) => (
              <Bar
                key={m.uid}
                dataKey={m.displayName}
                stackId="1"
                fill={getMemberColor(m.uid)}
                radius={members.indexOf(m) === members.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
