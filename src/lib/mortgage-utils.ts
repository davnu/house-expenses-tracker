import { addMonths, format, differenceInMonths } from 'date-fns'
import type { MortgageConfig, AmortizationRow, MortgageStats, MortgageImpact, RateType } from '@/types/mortgage'

export function getMixedSwitchDate(startDate: string, fixedPeriodYears: number): string {
  return format(addMonths(new Date(startDate), fixedPeriodYears * 12), 'yyyy-MM-dd')
}

export function isMixedInFixedPeriod(config: MortgageConfig, asOf?: Date): boolean {
  if (config.rateType !== 'mixed' || !config.mixedRate) return false
  const now = asOf ?? new Date()
  return now < new Date(getMixedSwitchDate(config.startDate, config.mixedRate.fixedPeriodYears))
}

export function calculateMonthlyPayment(
  principalCents: number,
  annualRatePercent: number,
  termMonths: number
): number {
  if (principalCents <= 0 || termMonths <= 0) return 0
  const principal = principalCents / 100
  const monthlyRate = annualRatePercent / 100 / 12

  if (monthlyRate === 0) {
    return Math.round((principal / termMonths) * 100)
  }

  const factor = Math.pow(1 + monthlyRate, termMonths)
  const payment = principal * (monthlyRate * factor) / (factor - 1)
  return Math.round(payment * 100)
}

function getRateForMonth(
  monthDate: string,
  config: MortgageConfig,
  sortedPeriods?: Array<{ startDate: string; annualRate: number; rateType: RateType }>
): { rate: number; type: string; isChange: boolean } {
  const periods = sortedPeriods ?? config.ratePeriods ?? []
  if (periods.length === 0) {
    return { rate: config.annualRate, type: config.rateType, isChange: false }
  }

  let activeRate = config.annualRate
  let activeType = config.rateType
  let isChange = false

  for (const period of periods) {
    const periodMonth = period.startDate.substring(0, 7)
    if (periodMonth <= monthDate) {
      isChange = periodMonth === monthDate
      activeRate = period.annualRate
      activeType = period.rateType
    } else {
      break
    }
  }

  return { rate: activeRate, type: activeType, isChange }
}

interface ExtraPaymentResult {
  amount: number
  reducePaymentAmount: number
  hasReducePayment: boolean
}

function getExtraPaymentsForMonth(monthDate: string, config: MortgageConfig): ExtraPaymentResult {
  const extras = config.extraRepayments ?? []
  if (extras.length === 0) return { amount: 0, reducePaymentAmount: 0, hasReducePayment: false }

  let total = 0
  let reducePaymentTotal = 0
  let hasReducePayment = false
  for (const extra of extras) {
    const extraMonth = extra.date.substring(0, 7)
    let applies = false

    if (extra.recurring) {
      const endMonth = extra.endDate ? extra.endDate.substring(0, 7) : '9999-12'
      applies = monthDate >= extraMonth && monthDate <= endMonth
    } else {
      applies = extraMonth === monthDate
    }

    if (applies) {
      total += extra.amount
      if ((extra.mode ?? 'reduce_term') === 'reduce_payment') {
        hasReducePayment = true
        reducePaymentTotal += extra.amount
      }
    }
  }
  return { amount: total, reducePaymentAmount: reducePaymentTotal, hasReducePayment }
}

/**
 * Compute how many months are needed to pay off a balance at a given payment and rate.
 * Used to determine the effective remaining term after reduce_term extras have shortened it.
 */
function computeRemainingMonths(balanceCents: number, annualRate: number, paymentCents: number): number {
  if (balanceCents <= 0) return 0
  const monthlyRate = annualRate / 100 / 12
  if (monthlyRate <= 0) {
    return paymentCents > 0 ? Math.ceil(balanceCents / paymentCents) : 1
  }
  const ratio = balanceCents * monthlyRate / paymentCents
  if (ratio >= 1) return -1 // payment doesn't cover interest — caller should fallback
  return Math.ceil(-Math.log(1 - ratio) / Math.log(1 + monthlyRate))
}

export function generateAmortizationSchedule(config: MortgageConfig): AmortizationRow[] {
  const originalTermMonths = config.termYears * 12
  const maxMonths = originalTermMonths * 2 // safety cap
  // Sort rate periods once upfront for performance
  const sortedPeriods = [...(config.ratePeriods ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const startDate = new Date(config.startDate)

  const rows: AmortizationRow[] = []
  let remaining = config.principal
  let currentPayment = config.monthlyPayment
  let prevRate = config.annualRate

  // Track the effective end of the loan (in absolute month index from start).
  // reduce_term extras shorten this; reduce_payment uses it for recalculation.
  let effectiveTermEnd = originalTermMonths
  // basePayment tracks the payment without reduce_payment recalculations,
  // so reduce_term can compute its effect on the term without compounding bias.
  let basePayment = config.monthlyPayment

  // Sort balance corrections by date for processing in order
  const sortedCorrections = [...(config.balanceCorrections ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
  const correctionMonths = new Map(
    sortedCorrections.map((c) => [c.date.substring(0, 7), c])
  )

  for (let i = 0; i < maxMonths && remaining > 0; i++) {
    const monthDate = format(addMonths(startDate, i), 'yyyy-MM')

    // Apply balance correction if one exists for this month
    const correction = correctionMonths.get(monthDate)
    if (correction) {
      remaining = correction.balance
      correctionMonths.delete(monthDate) // only apply once
      // Recalculate payment — only for French (Italian recalculates naturally)
      const amortCheck = config.amortizationType ?? 'french'
      if (amortCheck !== 'italian' && !correction.keepCurrentPayment && !config.monthlyPaymentOverride) {
        const remainingMonths = Math.max(1, originalTermMonths - i)
        currentPayment = calculateMonthlyPayment(remaining, prevRate, remainingMonths)
        basePayment = currentPayment
      }
    }

    const { rate, isChange } = getRateForMonth(monthDate, config, sortedPeriods)
    const monthlyRate = rate / 100 / 12

    const amortType = config.amortizationType ?? 'french'

    // Recalculate payment at rate boundaries — only for French (Italian recalculates every month naturally)
    if (amortType !== 'italian' && isChange && !config.monthlyPaymentOverride && rate !== prevRate) {
      const remainingMonths = Math.max(1, originalTermMonths - i)
      currentPayment = calculateMonthlyPayment(remaining, rate, remainingMonths)
      basePayment = currentPayment
    }
    prevRate = rate

    // Calculate interest for this month
    const interestCents = Math.round((remaining / 100) * monthlyRate * 100)
    let basePrincipal: number

    if (amortType === 'italian') {
      // Italian: constant principal portion each month
      const remainingMonths = Math.max(1, originalTermMonths - i)
      basePrincipal = Math.round(remaining / remainingMonths)
      currentPayment = basePrincipal + interestCents
    } else {
      // French (default): constant payment, variable P/I split
      basePrincipal = Math.max(0, currentPayment - interestCents)
    }

    // Extra payments this month
    const { amount: extraThisMonth, reducePaymentAmount, hasReducePayment } = getExtraPaymentsForMonth(monthDate, config)

    // Total principal reduction
    const totalPrincipalReduction = basePrincipal + extraThisMonth

    // Check if this pays off the loan
    if (totalPrincipalReduction >= remaining) {
      const actualBasePrincipal = Math.min(basePrincipal, remaining)
      const actualExtra = Math.min(extraThisMonth, remaining - actualBasePrincipal)
      const actualPayment = interestCents + actualBasePrincipal + actualExtra

      rows.push({
        month: i + 1,
        date: monthDate,
        payment: actualPayment,
        principalPortion: actualBasePrincipal,
        interestPortion: interestCents,
        remainingBalance: 0,
        extraPayment: actualExtra > 0 ? actualExtra : undefined,
        rateApplied: rate,
        isRateChange: isChange || undefined,
      })
      break
    }

    // Normal month — reduce balance
    remaining -= totalPrincipalReduction

    // If reduce_term extras exist, shorten the effective loan term.
    // Use basePayment (unaffected by reduce_payment recalculations) so the
    // term calculation is stable and doesn't compound with payment reductions.
    const reduceTermAmount = extraThisMonth - reducePaymentAmount
    if (amortType !== 'italian' && reduceTermAmount > 0) {
      const balanceAfterReduceTermOnly = remaining + reducePaymentAmount
      const months = computeRemainingMonths(balanceAfterReduceTermOnly, rate, basePayment)
      if (months > 0) {
        effectiveTermEnd = Math.min(effectiveTermEnd, i + 1 + months)
      }
    }

    // If extra payment is "reduce payment" mode, recalculate monthly payment
    // to finish by the effective end date (which may have been shortened by reduce_term).
    // Only for French — Italian recalculates naturally each iteration
    if (amortType !== 'italian' && hasReducePayment && extraThisMonth > 0 && !config.monthlyPaymentOverride) {
      const remainingMonths = Math.max(1, effectiveTermEnd - i - 1)
      currentPayment = calculateMonthlyPayment(remaining, rate, remainingMonths)
    }

    rows.push({
      month: i + 1,
      date: monthDate,
      payment: interestCents + basePrincipal + extraThisMonth,
      principalPortion: basePrincipal,
      interestPortion: interestCents,
      remainingBalance: remaining,
      extraPayment: extraThisMonth > 0 ? extraThisMonth : undefined,
      rateApplied: rate,
      isRateChange: isChange || undefined,
    })
  }

  return rows
}

export function getMortgageStats(config: MortgageConfig, asOfDate?: Date): MortgageStats {
  const now = asOfDate ?? new Date()
  const schedule = generateAmortizationSchedule(config)
  const totalMonths = schedule.length
  const startDate = new Date(config.startDate)

  const monthsElapsed = Math.max(0, Math.min(totalMonths, differenceInMonths(now, startDate)))
  const monthsRemaining = Math.max(0, totalMonths - monthsElapsed)

  const totalInterest = schedule.reduce((s, r) => s + r.interestPortion, 0)
  const totalPayments = schedule.reduce((s, r) => s + r.payment, 0)

  const pastPayments = schedule.slice(0, monthsElapsed)
  const principalPaidSoFar = pastPayments.reduce((s, r) => s + r.principalPortion + (r.extraPayment ?? 0), 0)
  const interestPaidSoFar = pastPayments.reduce((s, r) => s + r.interestPortion, 0)
  const remainingBalance = monthsElapsed > 0 && monthsElapsed <= schedule.length
    ? schedule[monthsElapsed - 1].remainingBalance
    : config.principal

  const currentRow = monthsElapsed > 0 && monthsElapsed <= schedule.length
    ? schedule[monthsElapsed - 1]
    : schedule[0]

  const lastRow = schedule[schedule.length - 1]
  const payoffDate = lastRow?.date ?? format(addMonths(startDate, config.termYears * 12), 'yyyy-MM')

  const progressPercent = config.principal > 0
    ? Math.min(100, (principalPaidSoFar / config.principal) * 100)
    : 0

  return {
    totalPayments,
    totalInterest,
    monthsElapsed,
    monthsRemaining,
    totalMonths,
    remainingBalance,
    principalPaidSoFar,
    interestPaidSoFar,
    currentMonthPrincipal: currentRow?.principalPortion ?? 0,
    currentMonthInterest: currentRow?.interestPortion ?? 0,
    payoffDate,
    progressPercent,
  }
}

export function calculateMortgageImpact(config: MortgageConfig): MortgageImpact | null {
  if (!config.extraRepayments?.length) return null

  const withExtras = generateAmortizationSchedule(config)

  const baseConfig = { ...config, extraRepayments: undefined }
  const withoutExtras = generateAmortizationSchedule(baseConfig)

  const originalLast = withoutExtras[withoutExtras.length - 1]
  const newLast = withExtras[withExtras.length - 1]

  if (!originalLast || !newLast) return null

  const originalInterest = withoutExtras.reduce((s, r) => s + r.interestPortion, 0)
  const newInterest = withExtras.reduce((s, r) => s + r.interestPortion, 0)

  return {
    originalPayoffDate: originalLast.date,
    newPayoffDate: newLast.date,
    monthsSaved: withoutExtras.length - withExtras.length,
    interestSaved: originalInterest - newInterest,
    originalTotalInterest: originalInterest,
    newTotalInterest: newInterest,
  }
}
