import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatCurrency } from '@/lib/utils'
import { SHARED_PAYER, SHARED_PAYER_COLOR, getSharedPayerLabel } from '@/lib/constants'
import type { Expense } from '@/types/expense'

interface MonthlyTrendProps {
  expenses: Expense[]
  title?: string
}

export function MonthlyTrend({ expenses, title }: MonthlyTrendProps) {
  const { t } = useTranslation()
  const { members, getMemberColor } = useHousehold()
  const isMobile = useIsMobile()
  const isMultiMember = members.length > 1

  const displayTitle = title ?? t('dashboard.spendingByMonth')

  // Build the list of payer segments for chart bars
  const segments = useMemo(() => {
    const segs: { key: string; label: string; color: string }[] = []
    const knownKeys = new Set<string>()

    if (expenses.some((e) => e.payer === SHARED_PAYER)) {
      segs.push({ key: SHARED_PAYER, label: getSharedPayerLabel(), color: SHARED_PAYER_COLOR })
      knownKeys.add(SHARED_PAYER)
    }
    for (const m of members) {
      segs.push({ key: m.uid, label: m.displayName, color: getMemberColor(m.uid) })
      knownKeys.add(m.uid)
    }

    // Former members — include if any expenses have unknown payer uids
    if (expenses.some((e) => !knownKeys.has(e.payer))) {
      segs.push({ key: '__former__', label: t('common.formerMember'), color: '#6b7280' })
    }

    return segs
  }, [expenses, members, getMemberColor, t])

  const data = useMemo(() => {
    const knownKeys = new Set(segments.map((s) => s.key))
    const byMonth: Record<string, Record<string, number>> = {}

    for (const exp of expenses) {
      const month = exp.date.substring(0, 7)
      if (!byMonth[month]) byMonth[month] = {}
      // Map orphaned payers to the __former__ key
      const key = knownKeys.has(exp.payer) ? exp.payer : '__former__'
      byMonth[month][key] = (byMonth[month][key] ?? 0) + exp.amount
    }

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => {
        const entry: Record<string, string | number> = { month }
        for (const seg of segments) {
          entry[seg.key] = vals[seg.key] ?? 0
        }
        return entry
      })
  }, [expenses, segments])

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{displayTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${(Number(v) / 100).toFixed(0)}`}
            />
            <Tooltip
              formatter={(value, name) => {
                const seg = segments.find((s) => s.key === name)
                return [formatCurrency(Number(value)), seg?.label ?? String(name)]
              }}
              labelFormatter={(label) => `${label}`}
            />
            {isMultiMember && <Legend formatter={(value) => {
              const seg = segments.find((s) => s.key === value)
              return seg?.label ?? value
            }} />}
            {segments.map((seg, i) => (
              <Bar
                key={seg.key}
                dataKey={seg.key}
                name={seg.label}
                stackId="1"
                fill={seg.color}
                radius={i === segments.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
