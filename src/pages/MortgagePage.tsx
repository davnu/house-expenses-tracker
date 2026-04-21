import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSkeleton } from '@/components/ui/loading'
import { useMortgage } from '@/context/MortgageContext'
import { generateAmortizationSchedule, getMortgageStats } from '@/lib/mortgage-utils'
import { MortgageSetupDialog } from '@/components/mortgage/MortgageSetupDialog'
import { MortgageHero } from '@/components/mortgage/MortgageHero'
import { MortgageOverviewCard } from '@/components/mortgage/MortgageOverviewCard'
import { PaymentBreakdownChart } from '@/components/mortgage/PaymentBreakdownChart'
import { AmortizationChart } from '@/components/mortgage/AmortizationChart'
import { AmortizationTable } from '@/components/mortgage/AmortizationTable'
import { RatePeriodsCard } from '@/components/mortgage/RatePeriodsCard'
import { ExtraRepaymentsCard } from '@/components/mortgage/ExtraRepaymentsCard'
import { BalanceCorrectionCard } from '@/components/mortgage/BalanceCorrectionCard'
import { MortgageComparisonSection } from '@/components/mortgage/MortgageComparisonSection'
import { Button } from '@/components/ui/button'
import { Landmark, Edit2, Trash2 } from 'lucide-react'
import { LockOverlay } from '@/components/billing/LockOverlay'
import { useEntitlement } from '@/hooks/use-entitlement'

export function MortgagePage() {
  const { t } = useTranslation()
  const { mortgage, loading, deleteMortgage } = useMortgage()
  const { limits } = useEntitlement()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const schedule = useMemo(
    () => (mortgage ? generateAmortizationSchedule(mortgage) : []),
    [mortgage]
  )

  const stats = useMemo(
    () => (mortgage ? getMortgageStats(mortgage) : null),
    [mortgage]
  )

  const showRateColumn = (mortgage?.ratePeriods?.length ?? 0) > 0 || mortgage?.rateType === 'variable' || mortgage?.rateType === 'mixed'
  const showRateManagement = mortgage?.rateType === 'variable' || mortgage?.rateType === 'mixed'


  if (loading) return <PageSkeleton />

  if (!mortgage || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('nav.mortgage')}</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Landmark className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{t('mortgage.addYourMortgage')}</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            {t('mortgage.addMortgageDesc')}
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Landmark className="h-4 w-4 mr-2" />
            {t('mortgage.configureMortgage')}
          </Button>
        </div>
        <MortgageSetupDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.mortgage')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            {t('common.edit')}
          </Button>
          {confirmDelete ? (
            <div className="flex gap-1.5 items-center">
              <span className="text-xs text-muted-foreground">{t('mortgage.deleteMortgage')}</span>
              <Button size="sm" variant="destructive" onClick={async () => { await deleteMortgage(); setConfirmDelete(false) }}>
                {t('common.yes')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                {t('common.no')}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {/* Section 1: Right Now — the hero */}
      <MortgageHero config={mortgage} stats={stats} />

      {/* Section 2: Details — reference info */}
      <MortgageOverviewCard config={mortgage} />

      {/* What-If Comparison */}
      <LockOverlay gate="what_if" active={!limits.hasMortgageWhatIf}>
        <MortgageComparisonSection config={mortgage} stats={stats} />
      </LockOverlay>

      {/* Section 3: Management — rate history, extra repayments, corrections */}
      {showRateManagement ? (
        <>
          <LockOverlay gate="advanced_mortgage" active={!limits.hasAdvancedMortgage}>
            <RatePeriodsCard />
          </LockOverlay>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LockOverlay gate="advanced_mortgage" active={!limits.hasAdvancedMortgage} compact>
              <ExtraRepaymentsCard />
            </LockOverlay>
            <LockOverlay gate="advanced_mortgage" active={!limits.hasAdvancedMortgage} compact>
              <BalanceCorrectionCard />
            </LockOverlay>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LockOverlay gate="advanced_mortgage" active={!limits.hasAdvancedMortgage} compact>
            <ExtraRepaymentsCard />
          </LockOverlay>
          <LockOverlay gate="advanced_mortgage" active={!limits.hasAdvancedMortgage} compact>
            <BalanceCorrectionCard />
          </LockOverlay>
        </div>
      )}

      {/* Section 4: Analysis — charts + table */}
      <PaymentBreakdownChart schedule={schedule} currentMonth={stats.monthsElapsed} />
      <AmortizationChart schedule={schedule} currentMonth={stats.monthsElapsed} />
      <AmortizationTable schedule={schedule} currentMonth={stats.monthsElapsed} showRateColumn={showRateColumn} />

      <MortgageSetupDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
