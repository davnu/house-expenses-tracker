import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { filterByPhase } from '@/lib/expense-utils'
import { ShoppingBag, Repeat } from 'lucide-react'
import type { Expense } from '@/types/expense'

interface CostOverviewProps {
  expenses: Expense[]
}

export function CostOverview({ expenses }: CostOverviewProps) {
  const stats = useMemo(() => {
    const oneTime = filterByPhase(expenses, 'one-time')
    const ongoing = filterByPhase(expenses, 'ongoing')
    const oneTimeTotal = oneTime.reduce((s, e) => s + e.amount, 0)
    const ongoingTotal = ongoing.reduce((s, e) => s + e.amount, 0)
    const months = new Set(ongoing.map((e) => e.date.substring(0, 7)))
    const avgMonthly = months.size > 0 ? Math.round(ongoingTotal / months.size) : 0
    return { oneTimeTotal, ongoingTotal, avgMonthly }
  }, [expenses])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchase Cost</CardTitle>
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(stats.oneTimeTotal)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Monthly Costs</CardTitle>
          <Repeat className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(stats.ongoingTotal)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Monthly</CardTitle>
          <Repeat className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(stats.avgMonthly)}</div>
        </CardContent>
      </Card>
    </div>
  )
}
