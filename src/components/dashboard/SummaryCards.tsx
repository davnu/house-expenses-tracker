import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { DollarSign, CalendarDays, TrendingUp } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import type { Expense } from '@/types/expense'

interface SummaryCardsProps {
  expenses: Expense[]
  variant: 'one-time' | 'ongoing'
}

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

export function SummaryCards({ expenses, variant }: SummaryCardsProps) {
  const stats = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0)

    if (variant === 'one-time') {
      // Find top category
      const byCat: Record<string, number> = {}
      for (const e of expenses) {
        byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
      }
      const topCat = Object.entries(byCat).sort(([, a], [, b]) => b - a)[0]
      return {
        cards: [
          { title: 'Total Purchase Costs', value: formatCurrency(total), icon: DollarSign },
          { title: 'Top Category', value: topCat ? `${categoryLabel(topCat[0])} (${formatCurrency(topCat[1])})` : '—', icon: TrendingUp },
        ],
      }
    }

    // Ongoing: calculate monthly average
    const months = new Set(expenses.map((e) => e.date.substring(0, 7)))
    const monthCount = Math.max(months.size, 1)
    const avgMonthly = Math.round(total / monthCount)
    return {
      cards: [
        { title: 'Total Monthly Costs', value: formatCurrency(total), icon: DollarSign },
        { title: 'Avg. per Month', value: formatCurrency(avgMonthly), icon: CalendarDays },
      ],
    }
  }, [expenses, variant])

  return (
    <div className="grid grid-cols-2 gap-4">
      {stats.cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
