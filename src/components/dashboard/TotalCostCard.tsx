import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { Home } from 'lucide-react'
import type { Expense } from '@/types/expense'

interface TotalCostCardProps {
  expenses: Expense[]
  mortgagePaid: number // cents
}

export function TotalCostCard({ expenses, mortgagePaid }: TotalCostCardProps) {
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const total = expenseTotal + mortgagePaid

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Home className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Total House Cost</p>
        </div>
        <p className="text-4xl font-bold tracking-tight">{formatCurrency(total)}</p>
        <p className="text-sm text-muted-foreground mt-2">
          {expenses.length} expense{expenses.length !== 1 ? 's' : ''} ({formatCurrency(expenseTotal)})
          {mortgagePaid > 0 && <span> + mortgage ({formatCurrency(mortgagePaid)})</span>}
        </p>
      </CardContent>
    </Card>
  )
}
