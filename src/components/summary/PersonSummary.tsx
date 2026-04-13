import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { SHARED_PAYER, SHARED_PAYER_COLOR, getSharedPayerLabel, getCategoryLabel, getFormerMemberLabel } from '@/lib/constants'
import type { Expense } from '@/types/expense'

interface PersonSummaryProps {
  expenses: Expense[]
}

interface PayerSummaryData {
  key: string
  name: string
  color: string
  total: number
  percent: number
  count: number
  topCategories: { label: string; amount: number }[]
}

function buildPayerData(expenses: Expense[], payerKey: string, name: string, color: string, grandTotal: number): PayerSummaryData {
  const payerExpenses = expenses.filter((e) => e.payer === payerKey)
  const total = payerExpenses.reduce((s, e) => s + e.amount, 0)
  const byCat: Record<string, number> = {}
  for (const e of payerExpenses) {
    byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
  }
  const topCategories = Object.entries(byCat)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, amount]) => ({ label: getCategoryLabel(cat), amount }))

  return {
    key: payerKey,
    name,
    color,
    total,
    percent: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
    count: payerExpenses.length,
    topCategories,
  }
}

export function PersonSummary({ expenses }: PersonSummaryProps) {
  const { t } = useTranslation()
  const { members } = useHousehold()

  const data = useMemo(() => {
    const grandTotal = expenses.reduce((s, e) => s + e.amount, 0)
    const result: PayerSummaryData[] = []
    const accounted = new Set<string>()

    // Shared slice
    const shared = buildPayerData(expenses, SHARED_PAYER, getSharedPayerLabel(), SHARED_PAYER_COLOR, grandTotal)
    if (shared.count > 0) { result.push(shared); accounted.add(SHARED_PAYER) }

    // Individual member slices
    for (const m of members) {
      const d = buildPayerData(expenses, m.uid, m.displayName, m.color, grandTotal)
      if (d.count > 0) { result.push(d); accounted.add(m.uid) }
    }

    // Former members — group all orphaned payers into one entry
    const orphanedExpenses = expenses.filter((e) => !accounted.has(e.payer))
    if (orphanedExpenses.length > 0) {
      const orphanedTotal = orphanedExpenses.reduce((s, e) => s + e.amount, 0)
      const byCat: Record<string, number> = {}
      for (const e of orphanedExpenses) { byCat[e.category] = (byCat[e.category] ?? 0) + e.amount }
      const topCategories = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 3).map(([cat, amount]) => ({ label: getCategoryLabel(cat), amount }))
      result.push({ key: '__former__', name: getFormerMemberLabel(), color: '#6b7280', total: orphanedTotal, percent: grandTotal > 0 ? (orphanedTotal / grandTotal) * 100 : 0, count: orphanedExpenses.length, topCategories })
    }

    return result
  }, [expenses, members])

  // Hide entirely for single-member households or when no data
  if (members.length < 2 || data.length === 0) return null

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">{t('summary.perPerson')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.map((person) => (
          <Card key={person.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: person.color }} />
                {person.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-2xl font-bold">{formatCurrency(person.total)}</span>
                <span className="text-sm text-muted-foreground self-end">
                  {person.percent.toFixed(1)}% &middot; {t('expenses.expenseCount', { count: person.count })}
                </span>
              </div>
              {person.topCategories.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('summary.topCategories')}</p>
                  {person.topCategories.map((cat) => (
                    <div key={cat.label} className="flex justify-between text-sm">
                      <span>{cat.label}</span>
                      <span className="text-muted-foreground">{formatCurrency(cat.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
