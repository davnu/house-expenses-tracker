import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { Plus, Landmark } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { TotalCostCard } from '@/components/dashboard/TotalCostCard'
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown'
import { MonthlyTrend } from '@/components/dashboard/MonthlyTrend'
import { MortgageSummaryCard } from '@/components/mortgage/MortgageSummaryCard'
import { PersonSplitCard } from '@/components/dashboard/PersonSplitCard'
import { RecentExpenses } from '@/components/dashboard/RecentExpenses'
import { QuickAddDialog } from '@/components/expenses/QuickAddDialog'
import { useExpenses } from '@/context/ExpenseContext'
import { useMortgage } from '@/context/MortgageContext'
import { getMortgageStats } from '@/lib/mortgage-utils'
import { applyFilters, type DashboardFilters as Filters } from '@/lib/expense-utils'
import type { ExpenseCategory } from '@/types/expense'

export function DashboardPage() {
  const { expenses } = useExpenses()
  const { mortgage } = useMortgage()
  const [filters, setFilters] = useState<Filters>({})
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)

  const filteredExpenses = useMemo(() => applyFilters(expenses, filters), [expenses, filters])

  const usedCategories = useMemo(
    () => [...new Set(expenses.map((e) => e.category))] as ExpenseCategory[],
    [expenses]
  )

  const mortgagePaid = useMemo(() => {
    if (!mortgage) return 0
    const stats = getMortgageStats(mortgage)
    return stats.principalPaidSoFar + stats.interestPaidSoFar
  }, [mortgage])

  const hasData = expenses.length > 0 || mortgage

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {expenses.length > 0 && (
        <DashboardFilters
          filters={filters}
          onChange={setFilters}
          usedCategories={usedCategories}
        />
      )}

      {!hasData ? (
        <div className="max-w-md mx-auto py-12 space-y-6">
          {/* Context: what this page becomes */}
          <div className="text-center space-y-2">
            <p className="text-lg font-medium text-foreground">Track every cost of your purchase</p>
            <p className="text-sm text-muted-foreground">
              This dashboard will show your total spend, breakdown by category, monthly timeline, and who paid what.
            </p>
          </div>

          {/* Two equal entry points */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card
              className="border-dashed hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => setAddExpenseOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAddExpenseOpen(true) } }}
            >
              <CardContent className="p-4 flex flex-col items-center text-center gap-2.5">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Log a cost</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Down payment, notary, taxes, renovations...</p>
                </div>
              </CardContent>
            </Card>

            <Link to="/mortgage">
              <Card className="border-dashed hover:bg-accent/50 transition-colors h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2.5">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Landmark className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Set up mortgage</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Payments, interest, and payoff progress</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <QuickAddDialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen} />
        </div>
      ) : (
        <>
          <TotalCostCard expenses={filteredExpenses} mortgagePaid={mortgagePaid} />

          {filteredExpenses.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CategoryBreakdown expenses={filteredExpenses} />
              <MonthlyTrend expenses={filteredExpenses} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MortgageSummaryCard />
            <PersonSplitCard expenses={filteredExpenses} />
          </div>

          <RecentExpenses expenses={expenses} />
        </>
      )}
    </div>
  )
}
