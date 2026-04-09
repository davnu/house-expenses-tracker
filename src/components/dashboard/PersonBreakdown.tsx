import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useExpenses } from '@/context/ExpenseContext'
import { useHousehold } from '@/context/HouseholdContext'

export function PersonBreakdown() {
  const { expenses } = useExpenses()
  const { members, getMemberColor } = useHousehold()

  const data = useMemo(() => {
    return members
      .map((m) => ({
        name: m.displayName,
        uid: m.uid,
        value: Math.round(
          expenses.filter((e) => e.payer === m.uid).reduce((s, e) => s + e.amount, 0) / 100 * 100
        ) / 100,
      }))
      .filter((d) => d.value > 0)
  }, [expenses, members])

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Split by Person</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={100}
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {data.map((d) => (
                <Cell key={d.uid} fill={getMemberColor(d.uid)} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `€${Number(value).toFixed(2)}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
