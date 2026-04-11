import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import type { AmortizationRow } from '@/types/mortgage'

interface AmortizationChartProps {
  schedule: AmortizationRow[]
  currentMonth: number
}

export function AmortizationChart({ schedule, currentMonth }: AmortizationChartProps) {
  const data = useMemo(() => {
    // Sample every 6 months, but always include rate changes and extra payments
    return schedule
      .filter((row, i) => i % 6 === 0 || i === schedule.length - 1 || row.isRateChange || row.extraPayment)
      .map((row) => ({
        date: row.date,
        balance: Math.round(row.remainingBalance / 100),
      }))
  }, [schedule])

  const currentDate = currentMonth > 0 && currentMonth <= schedule.length
    ? schedule[currentMonth - 1]?.date
    : undefined

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Remaining Balance Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value) => `€${Number(value).toLocaleString()}`}
              labelFormatter={(label) => format(new Date(label + '-01'), 'MMM yyyy')}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#2a9d90"
              fill="#2a9d90"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            {currentDate && (
              <ReferenceLine
                x={currentDate}
                stroke="#e76e50"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{ value: 'Now', position: 'top', fill: '#e76e50', fontSize: 12 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
