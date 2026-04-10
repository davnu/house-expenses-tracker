import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MortgageStats } from '@/types/mortgage'

interface PrincipalInterestChartProps {
  stats: MortgageStats
  variant: 'paid' | 'total'
}

export function PrincipalInterestChart({ stats, variant }: PrincipalInterestChartProps) {
  const data = variant === 'paid'
    ? [
        { name: 'Principal Paid', value: Math.round(stats.principalPaidSoFar / 100 * 100) / 100 },
        { name: 'Interest Paid', value: Math.round(stats.interestPaidSoFar / 100 * 100) / 100 },
      ]
    : [
        { name: 'Total Principal', value: Math.round((stats.totalPayments - stats.totalInterest) / 100 * 100) / 100 },
        { name: 'Total Interest', value: Math.round(stats.totalInterest / 100 * 100) / 100 },
      ]

  const title = variant === 'paid' ? 'Payments So Far' : 'Over Life of Loan'
  const colors = ['#2a9d90', '#e76e50']

  if (data.every((d) => d.value === 0)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="value"
              label={({ name, percent }) => `${String(name ?? '').split(' ')[0]} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i]} />
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
