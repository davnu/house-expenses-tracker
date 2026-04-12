import { useMemo } from 'react'
import { Home } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { SHARED_PAYER, SHARED_PAYER_COLOR, SHARED_PAYER_LABEL } from '@/lib/constants'
import type { Expense } from '@/types/expense'

interface PersonSplitCardProps {
  expenses: Expense[]
}

interface PayerSlice {
  key: string
  name: string
  color: string
  total: number
  percent: number
}

export function PersonSplitCard({ expenses }: PersonSplitCardProps) {
  const { members } = useHousehold()

  const data = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0)

    // Single pass: group all expenses by payer
    const byPayer = new Map<string, number>()
    for (const e of expenses) {
      byPayer.set(e.payer, (byPayer.get(e.payer) ?? 0) + e.amount)
    }

    const slices: PayerSlice[] = []
    const accounted = new Set<string>()

    // Shared slice (first)
    const sharedTotal = byPayer.get(SHARED_PAYER) ?? 0
    if (sharedTotal > 0) {
      slices.push({ key: SHARED_PAYER, name: SHARED_PAYER_LABEL, color: SHARED_PAYER_COLOR, total: sharedTotal, percent: total > 0 ? (sharedTotal / total) * 100 : 0 })
      accounted.add(SHARED_PAYER)
    }

    // Known members (in member order)
    for (const m of members) {
      const memberTotal = byPayer.get(m.uid) ?? 0
      if (memberTotal > 0) {
        slices.push({ key: m.uid, name: m.displayName, color: m.color, total: memberTotal, percent: total > 0 ? (memberTotal / total) * 100 : 0 })
        accounted.add(m.uid)
      }
    }

    // Former members (anyone not accounted for)
    let orphanedTotal = 0
    for (const [payer, amount] of byPayer) {
      if (!accounted.has(payer)) orphanedTotal += amount
    }
    if (orphanedTotal > 0) {
      slices.push({ key: '__former__', name: 'Former member', color: '#6b7280', total: orphanedTotal, percent: total > 0 ? (orphanedTotal / total) * 100 : 0 })
    }

    return slices
  }, [expenses, members])

  if (members.length < 2) return null

  const total = data.reduce((s, d) => s + d.total, 0)
  if (total === 0) return null

  const allShared = data.length === 1 && data[0].key === SHARED_PAYER
  const sharedSlice = data.find((d) => d.key === SHARED_PAYER)
  const individualSlices = data.filter((d) => d.key !== SHARED_PAYER)
  const isSharedDominant = sharedSlice !== undefined && sharedSlice.percent > 50

  // All expenses are shared — lightweight informational card
  if (allShared) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${SHARED_PAYER_COLOR}15` }}
            >
              <Home className="h-4 w-4" style={{ color: SHARED_PAYER_COLOR }} />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold">{formatCurrency(total)}</p>
              <p className="text-sm text-muted-foreground">
                All expenses shared between household members
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Expense Split</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stacked bar */}
        <div className="h-3 rounded-full overflow-hidden flex">
          {data.map((d) => (
            <div
              key={d.key}
              className="h-full transition-all"
              style={{ width: `${d.percent}%`, backgroundColor: d.color }}
            />
          ))}
        </div>

        {isSharedDominant && sharedSlice ? (
          /* Shared-dominant: shared is primary, individuals are secondary */
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 shrink-0" style={{ color: SHARED_PAYER_COLOR }} />
              <span className="text-sm font-medium">{SHARED_PAYER_LABEL}</span>
              <span className="ml-auto text-base font-semibold">{formatCurrency(sharedSlice.total)}</span>
              <span className="text-xs text-muted-foreground w-10 text-right">{sharedSlice.percent.toFixed(0)}%</span>
            </div>

            {individualSlices.length > 0 && (
              <div className="border-t pt-3 space-y-1.5">
                <p className="text-xs text-muted-foreground">Individual contributions</p>
                {individualSlices.map((d) => (
                  <div key={d.key} className="flex items-center justify-between text-sm pl-6">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{formatCurrency(d.total)}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{d.percent.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Equal-weight: flat legend */
          <div className="space-y-2">
            {data.map((d) => (
              <div key={d.key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {d.key === SHARED_PAYER ? (
                    <Home className="h-4 w-4 shrink-0" style={{ color: SHARED_PAYER_COLOR }} />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  )}
                  <span>{d.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatCurrency(d.total)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{d.percent.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
