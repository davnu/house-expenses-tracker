import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { DollarSign, Landmark, Home } from 'lucide-react'
import type { Expense } from '@/types/expense'

interface CostOverviewProps {
  expenses: Expense[]
  mortgagePaid?: number // cents
}

export function CostOverview({ expenses, mortgagePaid = 0 }: CostOverviewProps) {
  const { t } = useTranslation()
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const grandTotal = expenseTotal + mortgagePaid

  const cards = [
    { title: t('summary.totalExpenses'), value: formatCurrency(expenseTotal), icon: DollarSign },
  ]

  if (mortgagePaid > 0) {
    cards.push({ title: t('summary.mortgagePaid'), value: formatCurrency(mortgagePaid), icon: Landmark })
  }

  cards.push({ title: t('summary.grandTotal'), value: formatCurrency(grandTotal), icon: Home })

  return (
    <div className={`grid gap-4 ${cards.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
