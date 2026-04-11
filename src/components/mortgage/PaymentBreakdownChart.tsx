import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import type { AmortizationRow } from '@/types/mortgage'

interface PaymentBreakdownChartProps {
  schedule: AmortizationRow[]
  currentMonth: number
}

export function PaymentBreakdownChart({ schedule, currentMonth }: PaymentBreakdownChartProps) {
  const data = useMemo(() => {
    // Sample every 3 months, but always include rate change months and extra payment months
    return schedule
      .filter((row, i) => i % 3 === 0 || i === schedule.length - 1 || row.isRateChange || row.extraPayment)
      .map((row) => ({
        date: row.date,
        principal: Math.round(row.principalPortion / 100),
        interest: Math.round(row.interestPortion / 100),
      }))
  }, [schedule])

  const currentDate = currentMonth > 0 && currentMonth <= schedule.length
    ? schedule[currentMonth - 1]?.date
    : undefined

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Breakdown Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
            <Tooltip
              formatter={(value, name) =>
                [`€${Number(value).toLocaleString()}`, String(name) === 'principal' ? 'Principal' : 'Interest']
              }
              labelFormatter={(label) => format(new Date(label + '-01'), 'MMM yyyy')}
            />
            <Legend formatter={(value) => value === 'principal' ? 'Principal' : 'Interest'} />
            <Area
              type="monotone"
              dataKey="interest"
              stackId="1"
              stroke="#e76e50"
              fill="#e76e50"
              fillOpacity={0.4}
            />
            <Area
              type="monotone"
              dataKey="principal"
              stackId="1"
              stroke="#2a9d90"
              fill="#2a9d90"
              fillOpacity={0.6}
            />
            {currentDate && (
              <ReferenceLine
                x={currentDate}
                stroke="#171717"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{ value: 'Now', position: 'top', fill: '#171717', fontSize: 12 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
