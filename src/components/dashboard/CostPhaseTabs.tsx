import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PurchaseCostsPanel } from './PurchaseCostsPanel'
import { MonthlyCostsPanel } from './MonthlyCostsPanel'
import { filterByPhase } from '@/lib/expense-utils'
import { formatCurrency } from '@/lib/utils'
import type { Expense } from '@/types/expense'

interface CostPhaseTabsProps {
  expenses: Expense[]
}

export function CostPhaseTabs({ expenses }: CostPhaseTabsProps) {
  const [activeTab, setActiveTab] = useState<'one-time' | 'ongoing'>('one-time')

  const oneTimeExpenses = filterByPhase(expenses, 'one-time')
  const ongoingExpenses = filterByPhase(expenses, 'ongoing')

  const oneTimeTotal = oneTimeExpenses.reduce((s, e) => s + e.amount, 0)
  const ongoingTotal = ongoingExpenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex rounded-lg border bg-muted p-1 gap-1">
        <button
          onClick={() => setActiveTab('one-time')}
          className={cn(
            'flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all cursor-pointer',
            activeTab === 'one-time'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <div>Purchase Costs</div>
          <div className="text-xs mt-0.5 opacity-70">{formatCurrency(oneTimeTotal)}</div>
        </button>
        <button
          onClick={() => setActiveTab('ongoing')}
          className={cn(
            'flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all cursor-pointer',
            activeTab === 'ongoing'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <div>Monthly Costs</div>
          <div className="text-xs mt-0.5 opacity-70">{formatCurrency(ongoingTotal)}</div>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'one-time' ? (
        <PurchaseCostsPanel expenses={oneTimeExpenses} />
      ) : (
        <MonthlyCostsPanel expenses={ongoingExpenses} />
      )}
    </div>
  )
}
