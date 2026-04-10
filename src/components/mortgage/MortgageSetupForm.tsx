import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formatCurrency, cn } from '@/lib/utils'
import { calculateMonthlyPayment } from '@/lib/mortgage-utils'
import { getRegion, getReferenceRatesForCountry, REFERENCE_RATES, computeEffectiveRate } from '@/lib/mortgage-country'
import { useHousehold } from '@/context/HouseholdContext'
import type { MortgageConfig, VariableRateConfig, VariableRateSubtype, MixedRateConfig, RateType } from '@/types/mortgage'

const mortgageSchema = z.object({
  principal: z.string().min(1, 'Required').refine((v) => parseFloat(v) > 0, 'Must be positive'),
  propertyValue: z.string().optional(),
  annualRate: z.string().optional(),
  rateType: z.string().min(1),
  termYears: z.string().min(1, 'Required').refine((v) => parseInt(v) > 0 && parseInt(v) <= 50, 'Must be 1-50 years'),
  startDate: z.string().min(1, 'Required'),
  monthlyPayment: z.string().optional(),
  useCustomPayment: z.boolean(),
  // Mixed rate fields
  fixedPeriodYears: z.string().optional(),
  // Variable rate fields
  referenceRateId: z.string().optional(),
  currentReferenceRate: z.string().optional(),
  spread: z.string().optional(),
  variableSubtype: z.string().optional(),
  reviewFrequencyMonths: z.string().optional(),
  // ARM fields
  fixedIntroPeriodYears: z.string().optional(),
  initialAdjustmentCap: z.string().optional(),
  periodicAdjustmentCap: z.string().optional(),
  lifetimeCap: z.string().optional(),
  rateFloor: z.string().optional(),
})

type FormData = z.infer<typeof mortgageSchema>

interface MortgageSetupFormProps {
  defaultValues?: MortgageConfig | null
  onSubmit: (config: MortgageConfig) => Promise<void>
}

export function MortgageSetupForm({ defaultValues, onSubmit }: MortgageSetupFormProps) {
  const { house } = useHousehold()
  const region = house?.country ? getRegion(house.country) : undefined
  const availableRates = house?.country ? getReferenceRatesForCountry(house.country) : []

  const vr = defaultValues?.variableRate
  const mr = defaultValues?.mixedRate

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(mortgageSchema),
    defaultValues: defaultValues ? {
      principal: String(defaultValues.principal / 100),
      annualRate: String(defaultValues.annualRate),
      rateType: defaultValues.rateType,
      termYears: String(defaultValues.termYears),
      startDate: defaultValues.startDate,
      monthlyPayment: String(defaultValues.monthlyPayment / 100),
      useCustomPayment: defaultValues.monthlyPaymentOverride,
      propertyValue: defaultValues.propertyValue ? String(defaultValues.propertyValue / 100) : '',
      fixedPeriodYears: mr ? String(mr.fixedPeriodYears) : '',
      referenceRateId: vr?.referenceRateId ?? mr?.referenceRateId ?? '',
      currentReferenceRate: vr ? String(vr.currentReferenceRate) : mr ? String(mr.currentReferenceRate) : '',
      spread: vr ? String(vr.spread) : mr ? String(mr.spread) : '',
      variableSubtype: vr?.subtype ?? 'tracker',
      reviewFrequencyMonths: vr ? String(vr.reviewFrequencyMonths) : mr ? String(mr.reviewFrequencyMonths) : '',
      fixedIntroPeriodYears: vr?.fixedIntroPeriodYears ? String(vr.fixedIntroPeriodYears) : '',
      initialAdjustmentCap: vr?.initialAdjustmentCap ? String(vr.initialAdjustmentCap) : '2',
      periodicAdjustmentCap: vr?.periodicAdjustmentCap ? String(vr.periodicAdjustmentCap) : '2',
      lifetimeCap: vr?.lifetimeCap ? String(vr.lifetimeCap) : '5',
      rateFloor: vr?.rateFloor ? String(vr.rateFloor) : '',
    } : {
      principal: '',
      propertyValue: '',
      annualRate: '',
      rateType: 'fixed',
      termYears: '30',
      startDate: '',
      monthlyPayment: '',
      useCustomPayment: false,
      fixedPeriodYears: '10',
      referenceRateId: availableRates[0]?.id ?? '',
      currentReferenceRate: '',
      spread: '',
      variableSubtype: region === 'usa' ? 'arm' : 'tracker',
      reviewFrequencyMonths: '',
      fixedIntroPeriodYears: '5',
      initialAdjustmentCap: '2',
      periodicAdjustmentCap: '2',
      lifetimeCap: '5',
      rateFloor: '',
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
  const hasVariableConfig = (isVariable || isMixed) && region && currentReferenceRate && spread

  // Auto-compute effective rate from reference + spread for variable/mixed
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
    // Only auto-set annualRate for pure variable — mixed uses the fixed rate as annualRate
    if (isVariable) {
      setValue('annualRate', String(effective))
    }
  }, [isVariable, isMixed, currentReferenceRate, spread, setValue])

  // Auto-set review frequency from reference rate selection
  useEffect(() => {
    if (!referenceRateId) return
    const rateConfig = REFERENCE_RATES[referenceRateId]
    if (rateConfig) {
      setValue('reviewFrequencyMonths', String(rateConfig.defaultReviewMonths))
    }
  }, [referenceRateId, setValue])

  // Auto-calculate monthly payment
  // For mixed: use the fixed rate (annualRate). For variable: use computed rate.
  const effectiveRate = (isVariable && hasVariableConfig) ? computedRate : (annualRate ? parseFloat(annualRate) : null)
  useEffect(() => {
    if (useCustomPayment) return
    const p = parseFloat(principal)
    const r = effectiveRate
    const t = parseInt(termYears)
    if (p > 0 && r && r > 0 && t > 0) {
      const payment = calculateMonthlyPayment(Math.round(p * 100), r, t * 12)
      setValue('monthlyPayment', String(payment / 100))
    }
  }, [principal, effectiveRate, termYears, useCustomPayment, setValue])

  const calculatedPayment = (() => {
    const p = parseFloat(principal)
    const r = effectiveRate
    const t = parseInt(termYears)
    if (p > 0 && r && r > 0 && t > 0) {
      return calculateMonthlyPayment(Math.round(p * 100), r, t * 12)
    }
    return 0
  })()

  const monthlyInterest = (() => {
    const p = parseFloat(principal)
    const r = effectiveRate
    if (p > 0 && r && r > 0) {
      return Math.round(p * (r / 100 / 12) * 100)
    }
    return 0
  })()

  const customPaymentVal = watch('monthlyPayment')
  const paymentTooLow = useCustomPayment && customPaymentVal
    ? Math.round(parseFloat(customPaymentVal) * 100) <= monthlyInterest && monthlyInterest > 0
    : false

  const onFormSubmit = async (data: FormData) => {
    const now = new Date().toISOString()
    const principalCents = Math.round(parseFloat(data.principal) * 100)

    // For mixed: use fixed rate. For variable: use computed rate. For fixed: use entered rate.
    const finalRate = (isVariable && hasVariableConfig && computedRate)
      ? computedRate
      : parseFloat(data.annualRate ?? '0')

    const paymentCents = data.useCustomPayment && data.monthlyPayment
      ? Math.round(parseFloat(data.monthlyPayment) * 100)
      : calculateMonthlyPayment(principalCents, finalRate, parseInt(data.termYears) * 12)

    const propertyValueCents = data.propertyValue && parseFloat(data.propertyValue) > 0
      ? Math.round(parseFloat(data.propertyValue) * 100)
      : undefined

    // Build variable rate config (pure variable only)
    let variableRate: VariableRateConfig | undefined
    if (isVariable && data.currentReferenceRate && data.spread && data.referenceRateId) {
      variableRate = {
        subtype: (data.variableSubtype ?? 'tracker') as VariableRateSubtype,
        referenceRateId: data.referenceRateId,
        currentReferenceRate: parseFloat(data.currentReferenceRate),
        spread: parseFloat(data.spread),
        reviewFrequencyMonths: parseInt(data.reviewFrequencyMonths ?? '12'),
        ...(region === 'usa' ? {
          fixedIntroPeriodYears: data.fixedIntroPeriodYears ? parseInt(data.fixedIntroPeriodYears) : undefined,
          adjustmentFrequencyYears: 1,
          initialAdjustmentCap: data.initialAdjustmentCap ? parseFloat(data.initialAdjustmentCap) : undefined,
          periodicAdjustmentCap: data.periodicAdjustmentCap ? parseFloat(data.periodicAdjustmentCap) : undefined,
          lifetimeCap: data.lifetimeCap ? parseFloat(data.lifetimeCap) : undefined,
        } : {}),
        ...(data.rateFloor ? { rateFloor: parseFloat(data.rateFloor) } : {}),
      }
    }

    // Build mixed rate config
    let mixedRate: MixedRateConfig | undefined
    if (isMixed && data.currentReferenceRate && data.spread && data.referenceRateId && data.fixedPeriodYears) {
      mixedRate = {
        fixedRate: finalRate,
        fixedPeriodYears: parseInt(data.fixedPeriodYears),
        referenceRateId: data.referenceRateId,
        currentReferenceRate: parseFloat(data.currentReferenceRate),
        spread: parseFloat(data.spread),
        reviewFrequencyMonths: parseInt(data.reviewFrequencyMonths ?? '12'),
        ...(data.rateFloor ? { rateFloor: parseFloat(data.rateFloor) } : {}),
      }
    }

    await onSubmit({
      principal: principalCents,
      annualRate: finalRate,
      rateType: data.rateType as RateType,
      termYears: parseInt(data.termYears),
      startDate: data.startDate,
      monthlyPayment: paymentCents,
      monthlyPaymentOverride: data.useCustomPayment,
      ...(propertyValueCents ? { propertyValue: propertyValueCents } : {}),
      ...(variableRate ? { variableRate } : {}),
      ...(mixedRate ? { mixedRate } : {}),
      // Preserve existing data (but clear rate periods if type changed to mixed)
      ...((isMixed && defaultValues?.rateType !== 'mixed') ? {} : defaultValues?.ratePeriods ? { ratePeriods: defaultValues.ratePeriods } : {}),
      ...(defaultValues?.extraRepayments ? { extraRepayments: defaultValues.extraRepayments } : {}),
      ...(defaultValues?.balanceCorrections ? { balanceCorrections: defaultValues.balanceCorrections } : {}),
      createdAt: defaultValues?.createdAt ?? now,
      updatedAt: now,
    })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="principal">Loan amount</Label>
          <Input id="principal" type="number" step="0.01" placeholder="250000" autoFocus {...register('principal')} />
          {errors.principal && <p className="text-xs text-destructive">{errors.principal.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="propertyValue">Property value <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="propertyValue" type="number" step="0.01" placeholder="300000" {...register('propertyValue')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Rate type</Label>
        <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
          <button type="button" onClick={() => setValue('rateType', 'fixed')}
            className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer', rateType === 'fixed' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>
            Fixed
          </button>
          <button type="button" onClick={() => setValue('rateType', 'mixed')}
            className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer', rateType === 'mixed' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>
            Mixed
          </button>
          <button type="button" onClick={() => setValue('rateType', 'variable')}
            className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer', rateType === 'variable' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>
            Variable
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Fixed rate field — shown for fixed and mixed */}
        {(rateType === 'fixed' || isMixed) && (
          <div className="space-y-2">
            <Label htmlFor="annualRate">{isMixed ? 'Fixed rate (%)' : 'Annual interest rate (%)'}</Label>
            <Input id="annualRate" type="number" step="0.01" placeholder="2.5" {...register('annualRate')} />
            {errors.annualRate && <p className="text-xs text-destructive">{errors.annualRate.message}</p>}
          </div>
        )}
        {/* Fixed period — shown for mixed only */}
        {isMixed && (
          <div className="space-y-2">
            <Label htmlFor="fixedPeriodYears">Fixed period (years)</Label>
            <Input id="fixedPeriodYears" type="number" placeholder="10" min="1" max="30" {...register('fixedPeriodYears')} />
          </div>
        )}
        {/* Pure variable with no country — fallback flat rate */}
        {isVariable && !region && (
          <div className="space-y-2">
            <p className="text-sm text-amber-600 p-2 rounded bg-amber-50 border border-amber-200">
              Set your country when creating the house for variable rate details.
            </p>
            <Label htmlFor="annualRate">Annual interest rate (%)</Label>
            <Input id="annualRate" type="number" step="0.01" placeholder="3.5" {...register('annualRate')} />
          </div>
        )}
      </div>

      {/* Variable rate details — shown for variable or mixed when country is set */}
      {showVariableFields && (
        <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {isMixed ? 'Variable Period Details (after fixed period)' : 'Variable Rate Details'}
          </p>

          {/* Reference rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Reference rate</Label>
              <Select {...register('referenceRateId')} className="h-8 text-sm">
                {availableRates.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Current value (%)</Label>
              <Input type="number" step="0.01" placeholder="3.2" {...register('currentReferenceRate')} className="h-8 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Spread / Margin (%)</Label>
              <Input type="number" step="0.01" placeholder="0.9" {...register('spread')} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Review frequency</Label>
              <Select {...register('reviewFrequencyMonths')} className="h-8 text-sm">
                <option value="0">Immediate</option>
                <option value="3">Every 3 months</option>
                <option value="6">Every 6 months</option>
                <option value="12">Every 12 months</option>
              </Select>
            </div>
          </div>

          {/* Computed rate */}
          {computedRate !== null && (
            <div className="text-sm font-medium p-2 rounded bg-background">
              Your rate: {currentReferenceRate}% + {spread}% = <span className="text-primary">{computedRate}%</span>
            </div>
          )}

          {/* USA ARM fields */}
          {region === 'usa' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fixed intro period (years)</Label>
                  <Input type="number" placeholder="5" {...register('fixedIntroPeriodYears')} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rate floor (%)</Label>
                  <Input type="number" step="0.01" placeholder="Optional" {...register('rateFloor')} className="h-8 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Initial cap (%)</Label>
                  <Input type="number" step="0.1" {...register('initialAdjustmentCap')} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Periodic cap (%)</Label>
                  <Input type="number" step="0.1" {...register('periodicAdjustmentCap')} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Lifetime cap (%)</Label>
                  <Input type="number" step="0.1" {...register('lifetimeCap')} className="h-8 text-sm" />
                </div>
              </div>
            </>
          )}

          {/* Europe floor clause */}
          {region === 'europe' && (
            <div className="space-y-1">
              <Label className="text-xs">Rate floor (%) <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input type="number" step="0.01" placeholder="e.g. 0" {...register('rateFloor')} className="h-8 text-sm" />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="termYears">Term (years)</Label>
          <Input id="termYears" type="number" placeholder="30" {...register('termYears')} />
          {errors.termYears && <p className="text-xs text-destructive">{errors.termYears.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" type="date" {...register('startDate')} />
          {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
        </div>
      </div>

      {/* Monthly payment */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="monthlyPayment">Monthly payment</Label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" {...register('useCustomPayment')} className="rounded" />
            Custom amount
          </label>
        </div>
        {useCustomPayment ? (
          <>
            <Input id="monthlyPayment" type="number" step="0.01" min="0.01" placeholder="0.00" {...register('monthlyPayment')} />
            {paymentTooLow && (
              <p className="text-xs text-amber-600">
                Payment is less than monthly interest ({formatCurrency(monthlyInterest)}). The loan balance will never decrease.
              </p>
            )}
          </>
        ) : (
          <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">
            {calculatedPayment > 0 ? formatCurrency(calculatedPayment) : 'Enter loan details above'}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : defaultValues ? 'Update Mortgage' : 'Set Up Mortgage'}
      </Button>
    </form>
  )
}
