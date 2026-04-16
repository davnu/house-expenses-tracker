import { addMonths, format } from 'date-fns'
import type { MortgageConfig, ComparisonScenario, ComparisonResult } from '@/types/mortgage'
import { calculateMonthlyPayment, generateAmortizationSchedule } from './mortgage-utils'

/**
 * Converts a ComparisonScenario into a minimal MortgageConfig that can be
 * fed into the existing calculation engine. Uses the current mortgage's start
 * date so both schedules align temporally.
 */
export function buildComparisonConfig(
  scenario: ComparisonScenario,
  startDate: string
): MortgageConfig {
  const termMonths = scenario.termYears * 12
  const monthlyPayment = calculateMonthlyPayment(
    scenario.principal,
    scenario.annualRate,
    termMonths
  )

  return {
    principal: scenario.principal,
    annualRate: scenario.annualRate,
    rateType: 'fixed',
    termYears: scenario.termYears,
    startDate,
    monthlyPayment,
    monthlyPaymentOverride: false,
    amortizationType: scenario.amortizationType,
    ...(scenario.extraRepayments.length > 0 && {
      extraRepayments: scenario.extraRepayments,
    }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/** Builds a ComparisonResult from a config, generating the schedule only once. */
export function buildResult(config: MortgageConfig): ComparisonResult {
  const schedule = generateAmortizationSchedule(config)
  const isItalian = (config.amortizationType ?? 'french') === 'italian'

  // Extract stats directly from the schedule — avoids calling getMortgageStats
  // which would regenerate the schedule a second time.
  const totalInterest = schedule.reduce((s, r) => s + r.interestPortion, 0)
  const totalPayments = schedule.reduce((s, r) => s + r.payment, 0)
  const lastRow = schedule[schedule.length - 1]
  const payoffDate = lastRow?.date
    ?? format(addMonths(new Date(config.startDate), config.termYears * 12), 'yyyy-MM')

  // For Italian, monthly payment is the first month's payment (it decreases)
  const monthlyPayment = isItalian && schedule.length > 0
    ? schedule[0].payment
    : config.monthlyPayment

  return {
    monthlyPayment,
    totalInterest,
    totalPayments,
    totalMonths: schedule.length,
    payoffDate,
    schedule,
  }
}

export interface ComparisonDiff {
  monthlyPayment: number // cents, positive = scenario costs more
  totalInterest: number // cents, positive = scenario costs more
  totalPayments: number // cents, positive = scenario costs more
  months: number // positive = scenario takes longer
}

export interface ComparisonOutput {
  current: ComparisonResult
  scenario: ComparisonResult
  diff: ComparisonDiff
}

/**
 * Compares the user's actual mortgage against a what-if scenario.
 * The current mortgage uses the full config (with rate periods, extras, etc.)
 * while the scenario is a clean, idealized fixed-rate calculation.
 */
export function compareMortgages(
  currentConfig: MortgageConfig,
  scenario: ComparisonScenario
): ComparisonOutput {
  const current = buildResult(currentConfig)
  const scenarioConfig = buildComparisonConfig(scenario, currentConfig.startDate)
  const scenarioResult = buildResult(scenarioConfig)

  return {
    current,
    scenario: scenarioResult,
    diff: {
      monthlyPayment: scenarioResult.monthlyPayment - current.monthlyPayment,
      totalInterest: scenarioResult.totalInterest - current.totalInterest,
      totalPayments: scenarioResult.totalPayments - current.totalPayments,
      months: scenarioResult.totalMonths - current.totalMonths,
    },
  }
}
