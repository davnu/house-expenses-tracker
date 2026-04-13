import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, getDateLocale } from '@/lib/utils'
import { format } from 'date-fns'
import { getMortgageStats, calculateMortgageImpact } from '@/lib/mortgage-utils'
import type { MortgageConfig } from '@/types/mortgage'

interface MortgageOverviewCardProps {
  config: MortgageConfig
}

export function MortgageOverviewCard({ config }: MortgageOverviewCardProps) {
  const { t } = useTranslation()
  const stats = useMemo(() => getMortgageStats(config), [config])
  const impact = useMemo(() => calculateMortgageImpact(config), [config])

  const details = [
    { label: t('mortgage.loanAmount'), value: formatCurrency(config.principal) },
    { label: t('mortgage.term'), value: `${config.termYears} ${t('mortgage.years')}` },
    { label: t('mortgage.start'), value: format(new Date(config.startDate), 'MMM yyyy', { locale: getDateLocale() }) },
    { label: t('mortgage.payoff'), value: format(new Date(stats.payoffDate + '-01'), 'MMM yyyy', { locale: getDateLocale() }) },
    { label: t('mortgage.totalInterest'), value: formatCurrency(stats.totalInterest) },
    { label: t('mortgage.totalCostPI'), value: formatCurrency(stats.totalPayments) },
  ]

  if (config.propertyValue) {
    details.push(
      { label: t('mortgage.propertyValue'), value: formatCurrency(config.propertyValue) },
      { label: t('mortgage.ltv'), value: `${((stats.remainingBalance / config.propertyValue) * 100).toFixed(1)}%` },
      { label: t('mortgage.equity'), value: formatCurrency(config.propertyValue - stats.remainingBalance) },
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground font-medium">{t('mortgage.mortgageDetails')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {details.map((d) => (
            <div key={d.label}>
              <p className="text-xs text-muted-foreground">{d.label}</p>
              <p className="text-sm font-medium">{d.value}</p>
            </div>
          ))}
        </div>

        {/* Savings from extra repayments */}
        {impact && impact.interestSaved > 0 && (
          <div className="flex gap-4 p-3 rounded-lg bg-green-50 border border-green-200">
            <div>
              <p className="text-xs text-green-700">{t('mortgage.interestSaved')}</p>
              <p className="text-sm font-bold text-green-700">{formatCurrency(impact.interestSaved)}</p>
            </div>
            {impact.monthsSaved > 0 ? (
              <>
                <div>
                  <p className="text-xs text-green-700">{t('mortgage.timeSaved')}</p>
                  <p className="text-sm font-bold text-green-700">{impact.monthsSaved} {t('mortgage.months')}</p>
                </div>
                <div>
                  <p className="text-xs text-green-700">{t('mortgage.newPayoff')}</p>
                  <p className="text-sm font-bold text-green-700">{format(new Date(impact.newPayoffDate + '-01'), 'MMM yyyy', { locale: getDateLocale() })}</p>
                </div>
              </>
            ) : (
              <div>
                <p className="text-xs text-green-700">{t('mortgage.payoff')}</p>
                <p className="text-sm font-bold text-green-700">{t('mortgage.unchangedLowerPayments')}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
