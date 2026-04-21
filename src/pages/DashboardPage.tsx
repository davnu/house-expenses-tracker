import { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Plus, Landmark, Printer, Target, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { ToolbarButton } from '@/components/ui/toolbar-button'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { TotalCostCard } from '@/components/dashboard/TotalCostCard'
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown'
import { MonthlyTrend } from '@/components/dashboard/MonthlyTrend'
import { MortgageSummaryCard } from '@/components/mortgage/MortgageSummaryCard'
import { PersonSplitCard } from '@/components/dashboard/PersonSplitCard'
import { RecentExpenses } from '@/components/dashboard/RecentExpenses'
import { DashboardPrintView } from '@/components/dashboard/DashboardPrintView'
import { QuickAddDialog } from '@/components/expenses/QuickAddDialog'
import { BudgetSetupDialog } from '@/components/budget/BudgetSetupDialog'
import { BudgetHealthCard } from '@/components/budget/BudgetHealthCard'
import { TodoCard } from '@/components/todos/TodoCard'
import { UpgradeBanner } from '@/components/billing/UpgradeBanner'
import { InviteHousemateDialog } from '@/components/household/InviteHousemateDialog'
import { PageSkeleton } from '@/components/ui/loading'
import { useExpenses } from '@/context/ExpenseContext'
import { useMortgage } from '@/context/MortgageContext'
import { useBudget } from '@/context/BudgetContext'
import { useHousehold } from '@/context/HouseholdContext'
import { useEntitlement } from '@/hooks/use-entitlement'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { getMortgageStats } from '@/lib/mortgage-utils'
import { applyFilters, isExpensePaid, type DashboardFilters as Filters } from '@/lib/expense-utils'
import type { ExpenseCategory } from '@/types/expense'

export function DashboardPage() {
  const { t } = useTranslation()
  const { expenses, loading: expensesLoading } = useExpenses()
  const { mortgage, loading: mortgageLoading } = useMortgage()
  const { budget } = useBudget()
  const { house } = useHousehold()
  const { limits, isPro, isLoading: entitlementLoading } = useEntitlement()
  const { open: openUpgrade } = useUpgradeDialog()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>({})
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  // Post-purchase onboarding: when the user returns from Polar checkout via
  // `/thanks` → `/app?onboard=invite`, auto-open the invite dialog. Inviting
  // the partner is the #1 reason most users just paid — skipping the extra
  // navigation step is the single biggest UX win for a just-upgraded user.
  // We wait for the entitlement to confirm Pro so the invite actually works
  // (webhook → onSnapshot propagation is usually <1s but not instant).
  useEffect(() => {
    if (searchParams.get('onboard') !== 'invite') return
    if (entitlementLoading) return
    if (isPro) {
      setInviteDialogOpen(true)
    }
    // Clear the param either way so a refresh doesn't re-trigger
    const next = new URLSearchParams(searchParams)
    next.delete('onboard')
    setSearchParams(next, { replace: true })
  }, [searchParams, entitlementLoading, isPro, setSearchParams])

  const handleBudgetClick = () => {
    if (!limits.hasBudget) {
      openUpgrade('budget')
      return
    }
    setBudgetDialogOpen(true)
  }

  const handlePrintClick = () => {
    if (!limits.hasPrintSummary) {
      openUpgrade('print')
      return
    }
    window.print()
  }

  const filteredExpenses = useMemo(() => applyFilters(expenses, filters), [expenses, filters])

  const usedCategories = useMemo(
    () => [...new Set(expenses.map((e) => e.category))] as ExpenseCategory[],
    [expenses]
  )

  const hasUnpaid = useMemo(() => expenses.some((e) => !isExpensePaid(e)), [expenses])

  const mortgagePaid = useMemo(() => {
    if (!mortgage) return 0
    const stats = getMortgageStats(mortgage)
    return stats.principalPaidSoFar + stats.interestPaidSoFar
  }, [mortgage])

  const hasData = expenses.length > 0 || mortgage

  if (expensesLoading || mortgageLoading) return <PageSkeleton />

  return (
    <>
      {/* Screen view */}
      <div className="space-y-6 print:hidden">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('nav.dashboard')}</h1>
          {hasData && (
            <div className="flex items-center gap-2">
              <ToolbarButton
                icon={limits.hasBudget ? Target : Lock}
                label={t('budget.setBudget')}
                onClick={handleBudgetClick}
              />
              <ToolbarButton
                icon={limits.hasPrintSummary ? Printer : Lock}
                label={t('common.print')}
                onClick={handlePrintClick}
              />
            </div>
          )}
        </div>

        {hasData && <UpgradeBanner />}

        {expenses.length > 0 && (
          <DashboardFilters
            filters={filters}
            onChange={setFilters}
            usedCategories={usedCategories}
            hasUnpaid={hasUnpaid}
          />
        )}

        {!hasData ? (
          <div className="max-w-md mx-auto py-12 space-y-6">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium text-foreground">{t('dashboard.trackEveryCost')}</p>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.trackEveryCostDesc')}
              </p>
            </div>

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
                    <p className="text-sm font-medium">{t('dashboard.logACost')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.logACostHint')}</p>
                  </div>
                </CardContent>
              </Card>

              <Link to="/app/mortgage">
                <Card className="border-dashed hover:bg-accent/50 transition-colors h-full">
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2.5">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Landmark className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t('dashboard.setUpMortgage')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.setUpMortgageHint')}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>

            <QuickAddDialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen} />
          </div>
        ) : (
          <>
            <TotalCostCard expenses={filteredExpenses} mortgagePaid={mortgagePaid} budget={budget} />

            <TodoCard />

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

            {budget && Object.keys(budget.categories).length > 0 && (
              <BudgetHealthCard expenses={filteredExpenses} budget={budget} />
            )}

            <RecentExpenses expenses={expenses} />
          </>
        )}
      </div>

      {/* Print view — hidden on screen, shown when printing */}
      {hasData && (
        <DashboardPrintView
          expenses={expenses}
          mortgagePaid={mortgagePaid}
          houseName={house?.name ?? t('common.houseExpenses')}
        />
      )}

      <BudgetSetupDialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen} />
      <InviteHousemateDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        houseName={house?.name}
      />
    </>
  )
}
