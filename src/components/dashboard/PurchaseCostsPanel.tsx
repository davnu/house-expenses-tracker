import { SummaryCards } from './SummaryCards'
import { HorizontalBarChart } from './HorizontalBarChart'
import { MonthlyTrend } from './MonthlyTrend'
import type { Expense } from '@/types/expense'

interface PurchaseCostsPanelProps {
  expenses: Expense[]
}

export function PurchaseCostsPanel({ expenses }: PurchaseCostsPanelProps) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No purchase costs yet</p>
        <p className="text-sm">One-time costs like notary, taxes, and furniture will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SummaryCards expenses={expenses} variant="one-time" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HorizontalBarChart expenses={expenses} title="Purchase Costs by Category" />
        <MonthlyTrend expenses={expenses} title="Purchase Costs Timeline" />
      </div>
    </div>
  )
}
