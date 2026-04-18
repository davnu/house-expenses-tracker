import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatCurrency } from '@/lib/utils'
import { SHARED_PAYER, SHARED_PAYER_COLOR, getSharedPayerLabel } from '@/lib/constants'
import { getExpenseCashContribution } from '@/lib/cost-split'
import type { Expense } from '@/types/expense'

interface MonthlyTrendProps {
  expenses: Expense[]
  title?: string
}

export const FORMER_KEY = '__former__'

export interface MonthlyTrendSegment {
  key: string
  label: string
  color: string
}

export interface MonthlyTrendBucket {
  segments: MonthlyTrendSegment[]
  data: Record<string, string | number>[]
}

/**
 * Pure aggregation that turns an expense list into the segments + per-month
 * stacked values the chart consumes. Extracted so tests can assert the bucket
 * shape without rendering Recharts (which renders nothing in jsdom without
 * explicit dimensions).
 *
 * Bucket rules:
 *   - SHARED_PAYER expenses → `SHARED_PAYER` key (stays as its own series).
 *   - Single-payer + SPLIT_PAYER → distributed per `getExpenseCashContribution`
 *     into per-member keys. Malformed SPLIT with no splits falls back to
 *     `FORMER_KEY` rather than vanishing.
 *   - Unknown uids (members who left) → `FORMER_KEY`.
 */
export function computeMonthlyTrend(
  expenses: Expense[],
  opts: {
    memberIds: Set<string>
    labels: Record<string, string>
    colors: Record<string, string>
    memberOrder: string[]
    sharedLabel: string
    formerLabel: string
  },
): MonthlyTrendBucket {
  const { memberIds, labels, colors, memberOrder, sharedLabel, formerLabel } = opts
  const byMonth: Record<string, Record<string, number>> = {}
  const usedKeys = new Set<string>()

  const add = (month: string, key: string, cents: number) => {
    if (cents <= 0) return
    if (!byMonth[month]) byMonth[month] = {}
    byMonth[month][key] = (byMonth[month][key] ?? 0) + cents
    usedKeys.add(key)
  }

  for (const exp of expenses) {
    const month = exp.date.substring(0, 7)
    if (exp.payer === SHARED_PAYER) {
      add(month, SHARED_PAYER, exp.amount)
      continue
    }
    const contribs = getExpenseCashContribution(exp)
    if (contribs.length === 0) {
      // Malformed SPLIT with no splits: surface the whole amount under the
      // Former-member catchall so data is never silently dropped.
      add(month, FORMER_KEY, exp.amount)
      continue
    }
    for (const c of contribs) {
      const key = memberIds.has(c.uid) ? c.uid : FORMER_KEY
      add(month, key, c.shareCents)
    }
  }

  const segments: MonthlyTrendSegment[] = []
  if (usedKeys.has(SHARED_PAYER)) {
    segments.push({ key: SHARED_PAYER, label: sharedLabel, color: SHARED_PAYER_COLOR })
  }
  for (const uid of memberOrder) {
    if (usedKeys.has(uid)) {
      segments.push({ key: uid, label: labels[uid] ?? uid, color: colors[uid] ?? '#6b7280' })
    }
  }
  if (usedKeys.has(FORMER_KEY)) {
    segments.push({ key: FORMER_KEY, label: formerLabel, color: '#6b7280' })
  }

  const data = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => {
      const entry: Record<string, string | number> = { month }
      for (const seg of segments) entry[seg.key] = vals[seg.key] ?? 0
      return entry
    })

  return { segments, data }
}

export function MonthlyTrend({ expenses, title }: MonthlyTrendProps) {
  const { t } = useTranslation()
  const { members, getMemberColor } = useHousehold()
  const isMobile = useIsMobile()
  const isMultiMember = members.length > 1

  const displayTitle = title ?? t('dashboard.spendingByMonth')

  const { segments, data } = useMemo(
    () => computeMonthlyTrend(expenses, {
      memberIds: new Set(members.map((m) => m.uid)),
      memberOrder: members.map((m) => m.uid),
      labels: Object.fromEntries(members.map((m) => [m.uid, m.displayName])),
      colors: Object.fromEntries(members.map((m) => [m.uid, getMemberColor(m.uid)])),
      sharedLabel: getSharedPayerLabel(),
      formerLabel: t('common.formerMember'),
    }),
    [expenses, members, getMemberColor, t],
  )

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
