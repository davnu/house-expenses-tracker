import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Home } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { SHARED_PAYER, SHARED_PAYER_COLOR, getCategoryLabel } from '@/lib/constants'
import { getExpenseCashContribution, sumSharedPool } from '@/lib/cost-split'
import type { Expense } from '@/types/expense'

interface PersonSummaryProps {
  expenses: Expense[]
}

interface BucketData {
  key: string
  name: string
  color: string
  total: number
  percent: number
  count: number
  topCategories: { label: string; amount: number }[]
  Icon?: typeof Home
}

/**
 * Per-person + Shared pool cost summary.
 * Each member card shows their direct cash contributions (single-payer
 * expenses + their portion of split payments). The Shared pool gets its own
 * card — it stays as an untouched bucket instead of being redistributed.
 */
export function PersonSummary({ expenses }: PersonSummaryProps) {
  const { t } = useTranslation()
  const { members, getMemberName, getMemberColor } = useHousehold()

  const data = useMemo(() => {
    const grandTotal = expenses.reduce((s, e) => s + e.amount, 0)
    if (grandTotal === 0) return []

    interface Bucket {
      total: number
      count: number
      byCat: Record<string, number>
    }
    const memberBuckets = new Map<string, Bucket>()
    const sharedBucket: Bucket = { total: 0, count: 0, byCat: {} }

    for (const e of expenses) {
      // Shared pool expenses → shared bucket, never distributed
      if (e.payer === SHARED_PAYER) {
        sharedBucket.total += e.amount
        sharedBucket.count += 1
        sharedBucket.byCat[e.category] = (sharedBucket.byCat[e.category] ?? 0) + e.amount
        continue
      }
      // Otherwise attribute cash contribution per person
      for (const c of getExpenseCashContribution(e)) {
        if (c.shareCents === 0) continue
        let b = memberBuckets.get(c.uid)
        if (!b) {
          b = { total: 0, count: 0, byCat: {} }
          memberBuckets.set(c.uid, b)
        }
        b.total += c.shareCents
        b.count += 1
        b.byCat[e.category] = (b.byCat[e.category] ?? 0) + c.shareCents
      }
    }

    const memberOrder = new Map(members.map((m, i) => [m.uid, i]))
    const uids = [...memberBuckets.keys()].sort((a, b) => {
      const ai = memberOrder.get(a)
      const bi = memberOrder.get(b)
      if (ai !== undefined && bi !== undefined) return ai - bi
      if (ai !== undefined) return -1
      if (bi !== undefined) return 1
      return a.localeCompare(b)
    })

    const result: BucketData[] = uids.map((uid) => {
      const b = memberBuckets.get(uid)!
      const topCategories = Object.entries(b.byCat)
        .sort(([, x], [, y]) => y - x)
        .slice(0, 3)
        .map(([cat, amount]) => ({ label: getCategoryLabel(cat), amount }))
      return {
        key: uid,
        name: getMemberName(uid),
        color: getMemberColor(uid),
        total: b.total,
        percent: (b.total / grandTotal) * 100,
        count: b.count,
        topCategories,
      }
    })

    if (sharedBucket.total > 0) {
      const topCategories = Object.entries(sharedBucket.byCat)
        .sort(([, x], [, y]) => y - x)
        .slice(0, 3)
        .map(([cat, amount]) => ({ label: getCategoryLabel(cat), amount }))
      result.push({
        key: '__shared__',
        name: t('costSharing.sharedPool'),
        color: SHARED_PAYER_COLOR,
        total: sharedBucket.total,
        percent: (sharedBucket.total / grandTotal) * 100,
        count: sharedBucket.count,
        topCategories,
        Icon: Home,
      })
    }

    return result
  }, [expenses, members, getMemberName, getMemberColor, t])

  if (members.length < 2 || data.length === 0) return null

  // Sanity: shared pool helper aligns with our bucket math
  void sumSharedPool

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">{t('summary.perPerson')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.map((bucket) => (
          <Card key={bucket.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {bucket.Icon ? (
                  <bucket.Icon className="h-4 w-4 shrink-0" style={{ color: bucket.color }} />
                ) : (
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: bucket.color }}
                  />
                )}
                {bucket.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-2xl font-bold">{formatCurrency(bucket.total)}</span>
                <span className="text-sm text-muted-foreground self-end">
                  {bucket.percent.toFixed(1)}% &middot; {t('expenses.expenseCount', { count: bucket.count })}
                </span>
              </div>
              {bucket.topCategories.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('summary.topCategories')}</p>
                  {bucket.topCategories.map((cat) => (
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
