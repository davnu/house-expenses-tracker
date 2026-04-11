import { useState, useMemo } from 'react'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { TotalCostCard } from '@/components/dashboard/TotalCostCard'
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown'
import { MonthlyTrend } from '@/components/dashboard/MonthlyTrend'
import { MortgageSummaryCard } from '@/components/mortgage/MortgageSummaryCard'
import { PersonSplitCard } from '@/components/dashboard/PersonSplitCard'
import { RecentExpenses } from '@/components/dashboard/RecentExpenses'
import { useExpenses } from '@/context/ExpenseContext'
import { useMortgage } from '@/context/MortgageContext'
import { getMortgageStats } from '@/lib/mortgage-utils'
import { applyFilters, type DashboardFilters as Filters } from '@/lib/expense-utils'
import type { ExpenseCategory } from '@/types/expense'

export function DashboardPage() {
  const { expenses } = useExpenses()
  const { mortgage } = useMortgage()
  const [filters, setFilters] = useState<Filters>({})

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
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No data yet</p>
          <p className="text-sm">Add expenses or set up your mortgage to get started</p>
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
