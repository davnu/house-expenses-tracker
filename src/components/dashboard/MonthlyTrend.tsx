import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import type { Expense } from '@/types/expense'

interface MonthlyTrendProps {
  expenses: Expense[]
  title?: string
}

export function MonthlyTrend({ expenses, title = 'Monthly Trend' }: MonthlyTrendProps) {
  const { members, getMemberColor } = useHousehold()

  const data = useMemo(() => {
    const byMonth: Record<string, Record<string, number>> = {}

    for (const exp of expenses) {
      const month = exp.date.substring(0, 7)
      if (!byMonth[month]) byMonth[month] = {}
      byMonth[month][exp.payer] = (byMonth[month][exp.payer] ?? 0) + exp.amount / 100
    }

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => {
        const entry: Record<string, string | number> = { month }
        let total = 0
        for (const m of members) {
          const val = Math.round((vals[m.uid] ?? 0) * 100) / 100
          entry[m.displayName] = val
          total += val
        }
        entry.Total = Math.round(total * 100) / 100
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
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => `€${Number(value).toFixed(2)}`} />
            <Legend />
            <Line type="monotone" dataKey="Total" stroke="#171717" strokeWidth={2} />
            {members.map((m) => (
              <Line key={m.uid} type="monotone" dataKey={m.displayName} stroke={getMemberColor(m.uid)} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
