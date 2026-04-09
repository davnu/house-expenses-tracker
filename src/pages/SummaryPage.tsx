import { useExpenses } from '@/context/ExpenseContext'
import { useHousehold } from '@/context/HouseholdContext'
import { CostOverview } from '@/components/summary/CostOverview'
import { CategoryTable } from '@/components/summary/CategoryTable'
import { MonthlyTable } from '@/components/summary/MonthlyTable'
import { PersonSummary } from '@/components/summary/PersonSummary'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Printer } from 'lucide-react'
import { format } from 'date-fns'

export function SummaryPage() {
  const { expenses } = useExpenses()
  const { house } = useHousehold()

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const dates = expenses.map((e) => e.date).sort()
  const dateRange = dates.length > 0
    ? `${format(new Date(dates[0]), 'MMM yyyy')} — ${format(new Date(dates[dates.length - 1]), 'MMM yyyy')}`
    : ''

  return (
    <div className="max-w-3xl mx-auto space-y-8 print:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between print:block">
        <div>
          <h1 className="text-2xl font-bold">{house?.name ?? 'House'} — Summary</h1>
          {dateRange && (
            <p className="text-sm text-muted-foreground mt-1">{dateRange}</p>
          )}
          <p className="text-3xl font-bold mt-2">{formatCurrency(total)}</p>
          <p className="text-sm text-muted-foreground">{expenses.length} expenses total</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="print:hidden"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>

      {expenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No expenses yet</p>
          <p className="text-sm">Add expenses to see your summary report</p>
        </div>
      ) : (
        <>
          <CostOverview expenses={expenses} />
          <CategoryTable expenses={expenses} />
          <MonthlyTable expenses={expenses} />
          <PersonSummary expenses={expenses} />
        </>
      )}

      {/* Print footer */}
      <p className="text-xs text-muted-foreground text-center hidden print:block pt-4">
        Generated on {format(new Date(), 'MMMM d, yyyy')}
      </p>
    </div>
  )
}
