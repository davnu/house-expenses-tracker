import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formatCurrency, cn } from '@/lib/utils'
import { calculateMonthlyPayment } from '@/lib/mortgage-utils'
import { getRegion, getReferenceRatesForCountry, REFERENCE_RATES, computeEffectiveRate } from '@/lib/mortgage-country'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useHousehold } from '@/context/HouseholdContext'
import type { MortgageConfig, VariableRateConfig, VariableRateSubtype, MixedRateConfig, RateType, AmortizationType } from '@/types/mortgage'

const schema = z.object({
  principal: z.string().min(1, 'Required').refine((v) => parseFloat(v) > 0, 'Must be positive'),
  propertyValue: z.string().optional(),
  termYears: z.string().min(1, 'Required').refine((v) => parseInt(v) > 0 && parseInt(v) <= 50, '1-50 years'),
  startDate: z.string().min(1, 'Required'),
  rateType: z.string().min(1),
  annualRate: z.string().optional(),
  amortizationType: z.string().optional(),
  fixedPeriodYears: z.string().optional(),
  referenceRateId: z.string().optional(),
  currentReferenceRate: z.string().optional(),
  spread: z.string().optional(),
  reviewFrequencyMonths: z.string().optional(),
  variableSubtype: z.string().optional(),
  fixedIntroPeriodYears: z.string().optional(),
  initialAdjustmentCap: z.string().optional(),
  periodicAdjustmentCap: z.string().optional(),
  lifetimeCap: z.string().optional(),
  rateFloor: z.string().optional(),
  monthlyPayment: z.string().optional(),
  useCustomPayment: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface Props {
  defaultValues?: MortgageConfig | null
  isEditing?: boolean
  onSubmit: (config: MortgageConfig) => Promise<void>
}

export function MortgageSetupForm({ defaultValues, isEditing = false, onSubmit }: Props) {
  const { t } = useTranslation()
  const { house } = useHousehold()
  const region = house?.country ? getRegion(house.country) : undefined
  const availableRates = house?.country ? getReferenceRatesForCountry(house.country) : []
  const vr = defaultValues?.variableRate
  const mr = defaultValues?.mixedRate

  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ? {
      principal: String(defaultValues.principal / 100),
      propertyValue: defaultValues.propertyValue ? String(defaultValues.propertyValue / 100) : '',
      termYears: String(defaultValues.termYears),
      startDate: defaultValues.startDate,
      rateType: defaultValues.rateType,
      annualRate: String(defaultValues.annualRate),
      amortizationType: defaultValues.amortizationType ?? 'french',
      fixedPeriodYears: mr ? String(mr.fixedPeriodYears) : '',
      referenceRateId: vr?.referenceRateId ?? mr?.referenceRateId ?? '',
      currentReferenceRate: vr ? String(vr.currentReferenceRate) : mr ? String(mr.currentReferenceRate) : '',
      spread: vr ? String(vr.spread) : mr ? String(mr.spread) : '',
      reviewFrequencyMonths: vr ? String(vr.reviewFrequencyMonths) : mr ? String(mr.reviewFrequencyMonths) : '',
      variableSubtype: vr?.subtype ?? 'tracker',
      fixedIntroPeriodYears: vr?.fixedIntroPeriodYears ? String(vr.fixedIntroPeriodYears) : '5',
      initialAdjustmentCap: vr?.initialAdjustmentCap ? String(vr.initialAdjustmentCap) : '2',
      periodicAdjustmentCap: vr?.periodicAdjustmentCap ? String(vr.periodicAdjustmentCap) : '2',
      lifetimeCap: vr?.lifetimeCap ? String(vr.lifetimeCap) : '5',
      rateFloor: vr?.rateFloor ? String(vr.rateFloor) : mr?.rateFloor ? String(mr.rateFloor) : '',
      monthlyPayment: String(defaultValues.monthlyPayment / 100),
      useCustomPayment: defaultValues.monthlyPaymentOverride,
    } : {
      principal: '', propertyValue: '', termYears: '30', startDate: '',
      rateType: 'fixed', annualRate: '', amortizationType: 'french',
      fixedPeriodYears: '10',
      referenceRateId: availableRates[0]?.id ?? '',
      currentReferenceRate: '', spread: '',
      reviewFrequencyMonths: '', variableSubtype: region === 'usa' ? 'arm' : 'tracker',
      fixedIntroPeriodYears: '5', initialAdjustmentCap: '2', periodicAdjustmentCap: '2', lifetimeCap: '5',
      rateFloor: '', monthlyPayment: '', useCustomPayment: false,
    },
  })

  const principal = watch('principal')
  const annualRate = watch('annualRate')
  const termYears = watch('termYears')
  const useCustomPayment = watch('useCustomPayment')
  const rateType = watch('rateType')
  const currentReferenceRate = watch('currentReferenceRate')
  const spread = watch('spread')
  const referenceRateId = watch('referenceRateId')

  const isVariable = rateType === 'variable'
  const isMixed = rateType === 'mixed'
  const showVariableFields = (isVariable || isMixed) && region

  const amortizationType = watch('amortizationType')
  const isItalianForm = amortizationType === 'italian'

  // Auto-compute effective rate from reference + spread
  const [computedRate, setComputedRate] = useState<number | null>(null)
  useEffect(() => {
    if ((!isVariable && !isMixed) || !currentReferenceRate || !spread) {
      setComputedRate(null)
      return
    }
    const ref = parseFloat(currentReferenceRate)
    const sp = parseFloat(spread)
    if (isNaN(ref) || isNaN(sp)) return
    const effective = computeEffectiveRate(ref, sp)
    setComputedRate(effective)
    if (isVariable) setValue('annualRate', String(effective))
  }, [isVariable, isMixed, currentReferenceRate, spread, setValue])

  // Auto-set review frequency from reference rate
  useEffect(() => {
    if (!referenceRateId) return
    const rateConfig = REFERENCE_RATES[referenceRateId]
    if (rateConfig) setValue('reviewFrequencyMonths', String(rateConfig.defaultReviewMonths))
  }, [referenceRateId, setValue])

  // Auto-calculate monthly payment
  const effectiveRate = (isVariable && computedRate) ? computedRate : (annualRate ? parseFloat(annualRate) : null)
  useEffect(() => {
    if (useCustomPayment) return
    const p = parseFloat(principal)
    const r = effectiveRate
    const ty = parseInt(termYears)
    if (p > 0 && r && r > 0 && ty > 0) {
      setValue('monthlyPayment', String(calculateMonthlyPayment(Math.round(p * 100), r, ty * 12) / 100))
    }
  }, [principal, effectiveRate, termYears, useCustomPayment, setValue])

  const calculatedPayment = (() => {
    const p = parseFloat(principal)
    const r = effectiveRate
    const ty = parseInt(termYears)
    if (p > 0 && r && r > 0 && ty > 0) return calculateMonthlyPayment(Math.round(p * 100), r, ty * 12)
    return 0
  })()

  const monthlyInterest = (() => {
    const p = parseFloat(principal)
    const r = effectiveRate
    if (p > 0 && r && r > 0) return Math.round(p * (r / 100 / 12) * 100)
    return 0
  })()

  const customPaymentVal = watch('monthlyPayment')
  const paymentTooLow = useCustomPayment && customPaymentVal
    ? Math.round(parseFloat(customPaymentVal) * 100) <= monthlyInterest && monthlyInterest > 0
    : false

  // Safe parse: returns fallback if NaN
  const safeFloat = (v: string | undefined, fallback = 0) => {
    const n = parseFloat(v ?? '')
    return isNaN(n) ? fallback : n
  }
  const safeInt = (v: string | undefined, fallback = 0) => {
    const n = parseInt(v ?? '')
    return isNaN(n) ? fallback : n
  }

  const onFormSubmit = async (data: FormData) => {
    // Validate required fields based on rate type — set errors on specific fields
    let hasErrors = false
    const requireField = (field: keyof FormData, message: string) => {
      setError(field, { message })
      hasErrors = true
    }

    if (!data.principal || safeFloat(data.principal) <= 0) requireField('principal', t('common.required'))
    if (!data.termYears || safeInt(data.termYears) <= 0) requireField('termYears', t('common.required'))
    if (!data.startDate) requireField('startDate', t('common.required'))

    if (rateType === 'fixed' || isMixed) {
      if (!data.annualRate || safeFloat(data.annualRate) <= 0) requireField('annualRate', t('common.required'))
    }
    if (isVariable && !region) {
      if (!data.annualRate || safeFloat(data.annualRate) <= 0) requireField('annualRate', t('common.required'))
    }
    if ((isVariable || isMixed) && region) {
      if (!data.currentReferenceRate) requireField('currentReferenceRate', t('common.required'))
      if (!data.spread && data.spread !== '0') requireField('spread', t('common.required'))
    }
    if (isMixed) {
      if (!data.fixedPeriodYears || safeInt(data.fixedPeriodYears) <= 0) requireField('fixedPeriodYears', t('common.required'))
    }

    if (hasErrors) return

    const now = new Date().toISOString()
    const principalCents = Math.round(safeFloat(data.principal) * 100)
    const parsedRate = safeFloat(data.annualRate)
    const finalRate = (isVariable && computedRate) ? computedRate : parsedRate

    if (finalRate <= 0) return

    const paymentCents = data.useCustomPayment && data.monthlyPayment
      ? Math.round(safeFloat(data.monthlyPayment) * 100)
      : calculateMonthlyPayment(principalCents, finalRate, safeInt(data.termYears) * 12)
    const propertyValueCents = data.propertyValue && safeFloat(data.propertyValue) > 0
      ? Math.round(safeFloat(data.propertyValue) * 100) : undefined

    let variableRate: VariableRateConfig | undefined
    if (isVariable && data.currentReferenceRate && data.spread && data.referenceRateId) {
      variableRate = {
        subtype: (data.variableSubtype ?? 'tracker') as VariableRateSubtype,
        referenceRateId: data.referenceRateId,
        currentReferenceRate: safeFloat(data.currentReferenceRate),
        spread: safeFloat(data.spread),
        reviewFrequencyMonths: safeInt(data.reviewFrequencyMonths, 12),
        ...(region === 'usa' ? {
          fixedIntroPeriodYears: data.fixedIntroPeriodYears ? safeInt(data.fixedIntroPeriodYears) : undefined,
          adjustmentFrequencyYears: 1,
          initialAdjustmentCap: data.initialAdjustmentCap ? safeFloat(data.initialAdjustmentCap) : undefined,
          periodicAdjustmentCap: data.periodicAdjustmentCap ? safeFloat(data.periodicAdjustmentCap) : undefined,
          lifetimeCap: data.lifetimeCap ? safeFloat(data.lifetimeCap) : undefined,
        } : {}),
        ...(data.rateFloor ? { rateFloor: safeFloat(data.rateFloor) } : {}),
      }
    }

    let mixedRate: MixedRateConfig | undefined
    if (isMixed && data.currentReferenceRate && data.spread && data.referenceRateId && data.fixedPeriodYears) {
      mixedRate = {
        fixedRate: finalRate,
        fixedPeriodYears: safeInt(data.fixedPeriodYears),
        referenceRateId: data.referenceRateId,
        currentReferenceRate: safeFloat(data.currentReferenceRate),
        spread: safeFloat(data.spread),
        reviewFrequencyMonths: safeInt(data.reviewFrequencyMonths, 12),
        ...(data.rateFloor ? { rateFloor: safeFloat(data.rateFloor) } : {}),
      }
    }

    if (isEditing && defaultValues) {
      // Edit mode: preserve locked fields from existing mortgage, only update editable ones
      await onSubmit({
        ...defaultValues,
        ...(propertyValueCents ? { propertyValue: propertyValueCents } : {}),
        monthlyPayment: data.useCustomPayment && data.monthlyPayment
          ? Math.round(safeFloat(data.monthlyPayment) * 100)
          : defaultValues.monthlyPayment,
        monthlyPaymentOverride: data.useCustomPayment,
        updatedAt: now,
      })
    } else {
      // Create mode: all fields from form
      await onSubmit({
        principal: principalCents,
        annualRate: finalRate,
        rateType: data.rateType as RateType,
        termYears: safeInt(data.termYears, 30),
        startDate: data.startDate,
        monthlyPayment: paymentCents,
        monthlyPaymentOverride: data.useCustomPayment,
        amortizationType: (data.amortizationType ?? 'french') as AmortizationType,
        ...(propertyValueCents ? { propertyValue: propertyValueCents } : {}),
        ...(variableRate ? { variableRate } : {}),
        ...(mixedRate ? { mixedRate } : {}),
        createdAt: defaultValues?.createdAt ?? now,
        updatedAt: now,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
      {isEditing ? (
        /* ── Edit mode: only editable fields ── */
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="propertyValue" className="text-xs">{t('mortgage.propertyValue')} <span className="text-muted-foreground">({t('common.optional')})</span></Label>
            <Input id="propertyValue" type="number" step="0.01" placeholder="300000" {...register('propertyValue')} />
          </div>
        </div>
      ) : (
        <>
        {/* ── Section 1: The Basics ── */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{t('mortgage.loanDetails')}</p>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="principal" className="text-xs">{t('mortgage.loanAmount')}</Label>
                <Input id="principal" type="number" step="0.01" placeholder="250000" {...register('principal')} />
                {errors.principal && <p className="text-xs text-destructive">{errors.principal.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="propertyValue" className="text-xs">{t('mortgage.propertyValue')} <span className="text-muted-foreground">({t('common.optional')})</span></Label>
                <Input id="propertyValue" type="number" step="0.01" placeholder="300000" {...register('propertyValue')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="termYears" className="text-xs">{t('mortgage.termYears')}</Label>
                <Input id="termYears" type="number" placeholder="30" {...register('termYears')} />
                {errors.termYears && <p className="text-xs text-destructive">{errors.termYears.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="startDate" className="text-xs">{t('mortgage.startDate')}</Label>
                <Input id="startDate" type="date" {...register('startDate')} />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {/* ── Section 2: Interest Rate — hidden in edit mode ── */}
      {!isEditing && (
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{t('mortgage.interestRate')}</p>
        <div className="space-y-3">
          {/* Rate type toggle */}
          <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
            {(['fixed', 'mixed', 'variable'] as const).map((type) => (
              <button key={type} type="button" onClick={() => setValue('rateType', type)}
                className={cn('flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all cursor-pointer',
                  rateType === type ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>
                {t(`common.${type}`)}
              </button>
            ))}
          </div>

          {/* Fixed rate */}
          {(rateType === 'fixed' || isMixed) && (
            <div className={cn('grid gap-3', isMixed ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
              <div className="space-y-1">
                <Label className="text-xs">{isMixed ? t('mortgage.fixedRate') : t('mortgage.annualRate')}</Label>
                <Input type="number" step="0.01" placeholder="2.5" {...register('annualRate')} />
                {errors.annualRate && <p className="text-xs text-destructive">{errors.annualRate.message}</p>}
              </div>
              {isMixed && (
                <div className="space-y-1">
                  <Label className="text-xs">{t('mortgage.fixedPeriod')}<InfoTooltip text={t('mortgage.fixedPeriodTooltip')} /></Label>
                  <Input type="number" placeholder="10" min="1" max="30" {...register('fixedPeriodYears')} />
                  {errors.fixedPeriodYears && <p className="text-xs text-destructive">{errors.fixedPeriodYears.message}</p>}
                </div>
              )}
            </div>
          )}

          {/* Variable without country */}
          {isVariable && !region && (
            <div className="space-y-2">
              <p className="text-xs text-amber-600 p-2 rounded bg-amber-50 border border-amber-200">
                {t('mortgage.noCountryWarning')}
              </p>
              <div className="space-y-1">
                <Label className="text-xs">{t('mortgage.annualRate')}</Label>
                <Input type="number" step="0.01" placeholder="3.5" {...register('annualRate')} />
              </div>
            </div>
          )}

          {/* Variable rate details */}
          {showVariableFields && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground">
                {isMixed ? t('mortgage.afterFixedPeriod') : t('mortgage.variableBreakdown')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('mortgage.referenceRate')}<InfoTooltip text={t('mortgage.referenceRateTooltip')} /></Label>
                  <Select {...register('referenceRateId')} className="h-9 text-sm">
                    {availableRates.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('mortgage.currentValue')}</Label>
                  <Input type="number" step="0.01" placeholder="3.2" {...register('currentReferenceRate')} />
                  {errors.currentReferenceRate && <p className="text-xs text-destructive">{errors.currentReferenceRate.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('mortgage.spreadMargin')}<InfoTooltip text={t('mortgage.spreadTooltip')} /></Label>
                  <Input type="number" step="0.01" placeholder="0.9" {...register('spread')} />
                  {errors.spread && <p className="text-xs text-destructive">{errors.spread.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('mortgage.reviewFrequency')}<InfoTooltip text={t('mortgage.reviewFrequencyTooltip')} /></Label>
                  <Select {...register('reviewFrequencyMonths')} className="h-9 text-sm">
                    <option value="0">{t('mortgage.immediate')}</option>
                    <option value="3">{t('mortgage.every3Months')}</option>
                    <option value="6">{t('mortgage.every6Months')}</option>
                    <option value="12">{t('mortgage.every12Months')}</option>
                  </Select>
                </div>
              </div>
              {computedRate !== null && (
                <p className="text-sm font-medium p-2 rounded bg-background">
                  {t('mortgage.yourRatePlain', { ref: currentReferenceRate, spread, effective: computedRate })}
                </p>
              )}
              {region === 'usa' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('mortgage.fixedIntroPeriod')}<InfoTooltip text={t('mortgage.fixedIntroPeriodTooltip')} /></Label>
                      <Input type="number" placeholder="5" {...register('fixedIntroPeriodYears')} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('mortgage.rateFloor')}<InfoTooltip text={t('mortgage.rateFloorTooltipUSA')} /></Label>
                      <Input type="number" step="0.01" placeholder="Optional" {...register('rateFloor')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('mortgage.initialCap')}<InfoTooltip text={t('mortgage.initialCapTooltip')} /></Label>
                      <Input type="number" step="0.1" {...register('initialAdjustmentCap')} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('mortgage.periodicCap')}<InfoTooltip text={t('mortgage.periodicCapTooltip')} /></Label>
                      <Input type="number" step="0.1" {...register('periodicAdjustmentCap')} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('mortgage.lifetimeCap')}<InfoTooltip text={t('mortgage.lifetimeCapTooltip')} /></Label>
                      <Input type="number" step="0.1" {...register('lifetimeCap')} />
                    </div>
                  </div>
                </>
              )}
              {region === 'europe' && (
                <div className="space-y-1">
                  <Label className="text-xs">{t('mortgage.rateFloor')}<InfoTooltip text={t('mortgage.rateFloorTooltipEurope')} /> <span className="text-muted-foreground">{t('common.optional')}</span></Label>
                  <Input type="number" step="0.01" placeholder="e.g. 0" {...register('rateFloor')} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Section 3: Payment ── */}
      {!isEditing && (
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{t('mortgage.payment')}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('mortgage.installmentType')}<InfoTooltip text={t('mortgage.installmentTooltip')} /></Label>
              <Select {...register('amortizationType')} className="h-9">
                <option value="french">{t('mortgage.fixedInstallment')}</option>
                <option value="italian">{t('mortgage.decreasingInstallment')}</option>
              </Select>
            </div>
            {isItalianForm ? (
              <div className="space-y-1">
                <Label className="text-xs">{t('mortgage.firstPayment')}</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">
                  {(() => {
                    const p = parseFloat(principal)
                    const r = effectiveRate
                    const ty = parseInt(termYears)
                    if (p > 0 && r && r > 0 && ty > 0) {
                      const principalPortion = Math.round((p * 100) / (ty * 12))
                      const interestPortion = Math.round(p * (r / 100 / 12) * 100)
                      return formatCurrency(principalPortion + interestPortion)
                    }
                    return '—'
                  })()}
                </div>
                <p className="text-xs text-muted-foreground">{t('mortgage.decreasesMonthly')}</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('mortgage.monthlyPayment')}</Label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" {...register('useCustomPayment')} className="rounded" />
                    {t('mortgage.customPayment')}
                  </label>
                </div>
                {useCustomPayment ? (
                  <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...register('monthlyPayment')} />
                ) : (
                  <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">
                    {calculatedPayment > 0 ? formatCurrency(calculatedPayment) : '—'}
                  </div>
                )}
              </div>
            )}
          </div>
          {paymentTooLow && (
            <p className="text-xs text-amber-600">
              {t('mortgage.paymentTooLow', { amount: formatCurrency(monthlyInterest) })}
            </p>
          )}
        </div>
      </div>
      )}

      {isEditing && (
        <p className="text-xs text-muted-foreground text-center">
          {t('mortgage.editModeNote')}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t('common.saving') : defaultValues ? t('mortgage.updateMortgage') : t('mortgage.setUpMortgageBtn')}
      </Button>
    </form>
  )
}
