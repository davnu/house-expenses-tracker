import { useState, useMemo } from 'react'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { CostPhaseTabs } from '@/components/dashboard/CostPhaseTabs'
import { useExpenses } from '@/context/ExpenseContext'
import { applyFilters, type DashboardFilters as Filters } from '@/lib/expense-utils'
import { formatCurrency } from '@/lib/utils'
import type { ExpenseCategory } from '@/types/expense'

export function DashboardPage() {
  const { expenses } = useExpenses()
  const [filters, setFilters] = useState<Filters>({})

  const filteredExpenses = useMemo(() => applyFilters(expenses, filters), [expenses, filters])

  const usedCategories = useMemo(
    () => [...new Set(expenses.map((e) => e.category))] as ExpenseCategory[],
    [expenses]
  )

  const total = filteredExpenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {expenses.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Total: {formatCurrency(total)}
              {filteredExpenses.length !== expenses.length && (
                <span> ({filteredExpenses.length} of {expenses.length} expenses)</span>
              )}
            </p>
          )}
        </div>
      </div>

      {expenses.length > 0 && (
        <DashboardFilters
          filters={filters}
          onChange={setFilters}
          usedCategories={usedCategories}
        />
      )}

      {expenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No data yet</p>
          <p className="text-sm">Add some expenses to see your charts here</p>
        </div>
      ) : (
        <CostPhaseTabs expenses={filteredExpenses} />
      )}
    </div>
  )
}
