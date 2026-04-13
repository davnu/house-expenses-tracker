import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, getDateLocale } from '@/lib/utils'
import { format } from 'date-fns'
import { REFERENCE_RATES, getNextReviewDate } from '@/lib/mortgage-country'
import { getMixedSwitchDate, isMixedInFixedPeriod } from '@/lib/mortgage-utils'
import type { MortgageConfig, MortgageStats } from '@/types/mortgage'

interface MortgageHeroProps {
  config: MortgageConfig
  stats: MortgageStats
}

export function MortgageHero({ config, stats }: MortgageHeroProps) {
  const { t } = useTranslation()
  const vr = config.variableRate
  const mr = config.mixedRate
  const isItalian = (config.amortizationType ?? 'french') === 'italian'
  const inFixedPeriod = isMixedInFixedPeriod(config)
  const switchDate = mr ? getMixedSwitchDate(config.startDate, mr.fixedPeriodYears) : null

  const currentRate = useMemo(() => {
    const periods = config.ratePeriods ?? []
    if (periods.length === 0) return { rate: config.annualRate, type: config.rateType, refRate: vr?.currentReferenceRate ?? mr?.currentReferenceRate, spread: vr?.spread ?? mr?.spread }
    const now = format(new Date(), 'yyyy-MM')
    const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate))
    let rate = config.annualRate
    let type = config.rateType
    let refRate = vr?.currentReferenceRate ?? mr?.currentReferenceRate
    let spread = vr?.spread ?? mr?.spread
    for (const p of sorted) {
      if (p.startDate.substring(0, 7) <= now) {
        rate = p.annualRate
        type = p.rateType
        if (p.referenceRate !== undefined) refRate = p.referenceRate
        if (p.spread !== undefined) spread = p.spread
      }
    }
    return { rate, type, refRate, spread }
  }, [config, vr])

  const nextReview = useMemo(() => {
    // Mixed: no reviews during fixed period, reviews start from switch date
    if (mr) {
      if (inFixedPeriod || !switchDate) return null
      return getNextReviewDate(switchDate, mr.reviewFrequencyMonths)
    }
    if (!vr || vr.reviewFrequencyMonths === 0) return null
    return getNextReviewDate(config.startDate, vr.reviewFrequencyMonths)
  }, [config, vr, mr, inFixedPeriod, switchDate])

  const refRateLabel = vr
    ? REFERENCE_RATES[vr.referenceRateId]?.label
    : mr ? REFERENCE_RATES[mr.referenceRateId]?.label : null
  const yearsRemaining = Math.floor(stats.monthsRemaining / 12)
  const monthsRem = stats.monthsRemaining % 12

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        {/* Monthly payment — the hero number */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              {isItalian ? t('mortgage.currentPayment') : t('mortgage.monthlyPayment')}
            </p>
            <p className="text-4xl font-bold tracking-tight">
              {formatCurrency(isItalian ? (stats.currentMonthPrincipal + stats.currentMonthInterest) : config.monthlyPayment)}
            </p>
            {isItalian && (
              <p className="text-xs text-muted-foreground mt-1">{t('mortgage.decreasingNote')}</p>
            )}
          </div>

          {/* Current rate */}
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">{t('mortgage.currentRate')}</p>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-2xl font-bold">{currentRate.rate}%</span>
              <Badge variant="secondary">
                {mr ? (inFixedPeriod ? t('common.fixed') : t('common.variable')) : t(`common.${currentRate.type}`)}
              </Badge>
              {mr && <Badge variant="outline">{t('common.mixed')}</Badge>}
            </div>
            {/* Rate decomposition for variable period */}
            {!inFixedPeriod && currentRate.refRate !== undefined && currentRate.spread !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">
                {refRateLabel} {currentRate.refRate}% + {currentRate.spread}%
              </p>
            )}
            {/* Mixed: show switch info */}
            {mr && switchDate && (
              <p className="text-xs text-muted-foreground mt-1">
                {inFixedPeriod
                  ? t('mortgage.fixedUntil', { date: format(new Date(switchDate), 'MMM yyyy', { locale: getDateLocale() }) })
                  : t('mortgage.variableSince', { date: format(new Date(switchDate), 'MMM yyyy', { locale: getDateLocale() }) })}
              </p>
            )}
            {nextReview && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('mortgage.nextReview', { date: format(new Date(nextReview), 'MMM yyyy', { locale: getDateLocale() }) })}
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>
              <span className="font-medium">{formatCurrency(stats.principalPaidSoFar)}</span>
              <span className="text-muted-foreground"> {t('mortgage.paid')}</span>
            </span>
            <span className="text-muted-foreground">
              {formatCurrency(stats.remainingBalance)} {t('mortgage.remaining')}
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(1, stats.progressPercent)}%`,
                backgroundColor: stats.progressPercent < 70 ? '#2a9d90' : stats.progressPercent < 90 ? '#e8c468' : '#e76e50',
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('mortgage.percentOfPrincipal', { percent: stats.progressPercent.toFixed(1), principal: formatCurrency(config.principal) })}</span>
            <span>
              {yearsRemaining > 0
                ? t('mortgage.timeRemaining', { years: yearsRemaining, months: monthsRem })
                : t('mortgage.timeRemainingMonths', { months: monthsRem })}
            </span>
          </div>
          {(stats.principalPaidSoFar > 0 || stats.interestPaidSoFar > 0) && (
            <p className="text-xs text-muted-foreground pt-1">
              {t('mortgage.totalPaid', { total: formatCurrency(stats.principalPaidSoFar + stats.interestPaidSoFar), principal: formatCurrency(stats.principalPaidSoFar), interest: formatCurrency(stats.interestPaidSoFar) })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
