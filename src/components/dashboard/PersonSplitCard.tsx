import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Home, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHousehold } from '@/context/HouseholdContext'
import { useHouseAllocation } from '@/hooks/use-house-allocation'
import { sumSharedPool } from '@/lib/cost-split'
import { SHARED_PAYER_COLOR } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface PersonSplitCardProps {
  expenses: Expense[]
}

interface Row {
  kind: 'member' | 'shared' | 'former'
  key: string
  label: string
  color: string
  amount: number
  percent: number
  Icon?: typeof Home
}

/**
 * "Who's paying for the house?" card.
 * Shows each member's direct contributions (single-payer expenses + their
 * share of split payments) and the joint-pool total as a separate row.
 * No balance math — the user asked for totals, not settlements.
 */
export function PersonSplitCard({ expenses }: PersonSplitCardProps) {
  const { t } = useTranslation()
  const { members, getMemberName, getMemberColor } = useHousehold()
  const { cash } = useHouseAllocation(expenses)

  const { rows, grandTotal } = useMemo(() => {
    // Compute the Shared pool directly from the source of truth, not by
    // subtracting cashTotal from total — any gap in cash (e.g. a malformed
    // SPLIT expense) would otherwise silently leak into the Shared row.
    const sharedTotal = sumSharedPool(expenses)
    const memberOrder = new Map(members.map((m, i) => [m.uid, i]))

    const memberRows: Row[] = []
    const formerRows: Row[] = []
    for (const [uid, amount] of cash) {
      if (amount === 0) continue
      if (memberOrder.has(uid)) {
        memberRows.push({
          kind: 'member',
          key: uid,
          label: getMemberName(uid),
          color: getMemberColor(uid),
          amount,
          percent: 0, // filled below
        })
      } else {
        formerRows.push({
          kind: 'former',
          key: uid,
          label: getMemberName(uid),
          color: '#6b7280',
          amount,
          percent: 0,
        })
      }
    }
    memberRows.sort((a, b) => (memberOrder.get(a.key)! - memberOrder.get(b.key)!))

    const sharedRow: Row | null =
      sharedTotal > 0
        ? {
            kind: 'shared',
            key: '__shared__',
            label: t('costSharing.sharedPool'),
            color: SHARED_PAYER_COLOR,
            amount: sharedTotal,
            percent: 0,
            Icon: Home,
          }
        : null

    const combined = [...memberRows, ...(sharedRow ? [sharedRow] : []), ...formerRows]
    const grand = combined.reduce((s, r) => s + r.amount, 0)
    for (const r of combined) r.percent = grand > 0 ? (r.amount / grand) * 100 : 0

    return { rows: combined, grandTotal: grand }
  }, [expenses, cash, members, getMemberName, getMemberColor, t])

  // Hide for single-member households, or when there's nothing to show
  if (members.length < 2 || grandTotal === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            {t('costSharing.cardTitle')}
          </CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(grandTotal)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked bar at the top — one segment per row, in the same colors as the rows below */}
        <div className="h-2 rounded-full overflow-hidden flex bg-muted">
          {rows.map((r) => (
            <div
              key={r.key}
              className="h-full transition-all"
              style={{ width: `${r.percent}%`, backgroundColor: r.color }}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* Per-row breakdown */}
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {r.Icon ? (
                  <r.Icon className="h-4 w-4 shrink-0" style={{ color: r.color }} aria-hidden="true" />
                ) : (
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: r.color }}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{r.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-medium tabular-nums">{formatCurrency(r.amount)}</span>
                <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                  {r.percent.toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
