import { SummaryCards } from './SummaryCards'
import { HorizontalBarChart } from './HorizontalBarChart'
import { MonthlyTrend } from './MonthlyTrend'
import type { Expense } from '@/types/expense'

interface MonthlyCostsPanelProps {
  expenses: Expense[]
}

export function MonthlyCostsPanel({ expenses }: MonthlyCostsPanelProps) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No monthly costs yet</p>
        <p className="text-sm">Ongoing costs like mortgage, utilities, and insurance will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SummaryCards expenses={expenses} variant="ongoing" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HorizontalBarChart expenses={expenses} title="Monthly Costs by Category" />
        <MonthlyTrend expenses={expenses} title="Monthly Costs Trend" />
      </div>
    </div>
  )
}
