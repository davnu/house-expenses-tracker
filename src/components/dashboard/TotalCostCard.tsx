import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { Home } from 'lucide-react'
import type { Expense } from '@/types/expense'

interface TotalCostCardProps {
  expenses: Expense[]
  mortgagePaid: number // cents
}

export function TotalCostCard({ expenses, mortgagePaid }: TotalCostCardProps) {
  const { t } = useTranslation()
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const total = expenseTotal + mortgagePaid

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Home className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('dashboard.totalHouseCost')}</p>
            <p className="text-3xl font-bold tracking-tight">{formatCurrency(total)}</p>
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
          <span>{t('dashboard.expenseCount', { count: expenses.length, total: formatCurrency(expenseTotal) })}</span>
          {mortgagePaid > 0 && <span>{t('dashboard.mortgageAmount', { total: formatCurrency(mortgagePaid) })}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
