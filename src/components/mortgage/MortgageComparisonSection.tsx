import { useState, useMemo, useCallback, useDeferredValue } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCompareArrows, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ComparisonForm } from './ComparisonForm'
import { ComparisonResults } from './ComparisonResults'
import { buildResult, buildComparisonConfig } from '@/lib/mortgage-comparison'
import type { MortgageConfig, MortgageStats, ComparisonScenario } from '@/types/mortgage'
import type { ComparisonOutput } from '@/lib/mortgage-comparison'

interface MortgageComparisonSectionProps {
  config: MortgageConfig
  stats: MortgageStats
}

function scenarioFromConfig(config: MortgageConfig): ComparisonScenario {
  return {
    principal: config.principal,
    annualRate: config.annualRate,
    termYears: config.termYears,
    amortizationType: config.amortizationType ?? 'french',
    extraRepayments: [],
  }
}

export function MortgageComparisonSection({ config, stats }: MortgageComparisonSectionProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [scenario, setScenario] = useState<ComparisonScenario>(() => scenarioFromConfig(config))
  const [resetKey, setResetKey] = useState(0)

  // Defer the scenario value so the form stays responsive while charts recompute
  const deferredScenario = useDeferredValue(scenario)

  const handleReset = useCallback(() => {
    setScenario(scenarioFromConfig(config))
    setResetKey((k) => k + 1)
  }, [config])

  // Current mortgage result — only recomputes when config changes, NOT on scenario keystrokes
  const currentResult = useMemo(() => buildResult(config), [config])

  // Scenario result — recomputes on deferred scenario changes
  const scenarioResult = useMemo(
    () => buildResult(buildComparisonConfig(deferredScenario, config.startDate)),
    [deferredScenario, config.startDate]
  )

  const comparison: ComparisonOutput = useMemo(() => ({
    current: currentResult,
    scenario: scenarioResult,
    diff: {
      monthlyPayment: scenarioResult.monthlyPayment - currentResult.monthlyPayment,
      totalInterest: scenarioResult.totalInterest - currentResult.totalInterest,
      totalPayments: scenarioResult.totalPayments - currentResult.totalPayments,
      months: scenarioResult.totalMonths - currentResult.totalMonths,
    },
  }), [currentResult, scenarioResult])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-muted-foreground/30 p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <GitCompareArrows className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{t('mortgage.compare.title')}</p>
          <p className="text-xs text-muted-foreground">{t('mortgage.compare.desc')}</p>
        </div>
      </button>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4" />
            {t('mortgage.compare.title')}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <ComparisonForm
          key={resetKey}
          scenario={scenario}
          onChange={setScenario}
          onReset={handleReset}
          startDate={config.startDate}
          currentConfig={config}
        />
        <div className="border-t pt-5">
          <ComparisonResults
            comparison={comparison}
            currentMonthIndex={stats.monthsElapsed}
          />
        </div>
      </CardContent>
    </Card>
  )
}
