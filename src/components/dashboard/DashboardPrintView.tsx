import { useMemo } from 'react'
import { CostOverview } from '@/components/summary/CostOverview'
import { CategoryTable } from '@/components/summary/CategoryTable'
import { MonthlyTable } from '@/components/summary/MonthlyTable'
import { PersonSummary } from '@/components/summary/PersonSummary'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import type { Expense } from '@/types/expense'

interface DashboardPrintViewProps {
  expenses: Expense[]
  mortgagePaid: number
  houseName: string
}

/**
 * Print-only view rendered inside the Dashboard page.
 * Hidden on screen (hidden), visible on print (print:block).
 * Replaces the old standalone SummaryPage.
 */
export function DashboardPrintView({ expenses, mortgagePaid, houseName }: DashboardPrintViewProps) {
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const total = expenseTotal + mortgagePaid

  const dateRange = useMemo(() => {
    const dates = expenses.map((e) => e.date).sort()
    if (dates.length === 0) return ''
    return `${format(new Date(dates[0]), 'MMM yyyy')} — ${format(new Date(dates[dates.length - 1]), 'MMM yyyy')}`
  }, [expenses])

  return (
    <div className="hidden print:block max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{houseName} — Summary</h1>
        {dateRange && <p className="text-sm text-muted-foreground mt-1">{dateRange}</p>}
        <p className="text-3xl font-bold mt-2">{formatCurrency(total)}</p>
        <p className="text-sm text-muted-foreground">
          {expenses.length} expenses{mortgagePaid > 0 ? ` + mortgage (${formatCurrency(mortgagePaid)})` : ''}
        </p>
      </div>

      <CostOverview expenses={expenses} mortgagePaid={mortgagePaid} />
      <CategoryTable expenses={expenses} mortgagePaid={mortgagePaid} />
      <MonthlyTable expenses={expenses} />
      <PersonSummary expenses={expenses} />

      <p className="text-xs text-muted-foreground text-center pt-4">
        Generated on {format(new Date(), 'MMMM d, yyyy')}
      </p>
    </div>
  )
}
