import { describe, it, expect } from 'vitest'
import { buildComparisonConfig, buildResult, compareMortgages } from './mortgage-comparison'
import { calculateMonthlyPayment, generateAmortizationSchedule, getMortgageStats } from './mortgage-utils'
import type { MortgageConfig, ComparisonScenario } from '@/types/mortgage'

function baseMortgage(overrides: Partial<MortgageConfig> = {}): MortgageConfig {
  return {
    principal: 15000000, // €150,000
    annualRate: 3.5,
    rateType: 'fixed',
    termYears: 30,
    startDate: '2025-01-01',
    monthlyPayment: calculateMonthlyPayment(15000000, 3.5, 360),
    monthlyPaymentOverride: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function baseScenario(overrides: Partial<ComparisonScenario> = {}): ComparisonScenario {
  return {
    principal: 15000000,
    annualRate: 3.5,
    termYears: 30,
    amortizationType: 'french',
    extraRepayments: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────
// buildComparisonConfig
// ─────────────────────────────────────────────

describe('buildComparisonConfig', () => {
  it('produces a valid MortgageConfig that generates a schedule', () => {
    const config = buildComparisonConfig(baseScenario(), '2025-01-01')
    const schedule = generateAmortizationSchedule(config)
    expect(schedule.length).toBeGreaterThan(0)
    expect(schedule[schedule.length - 1].remainingBalance).toBe(0)
  })

  it('uses the provided start date', () => {
    const config = buildComparisonConfig(baseScenario(), '2024-06-01')
    expect(config.startDate).toBe('2024-06-01')
  })

  it('calculates the correct monthly payment', () => {
    const config = buildComparisonConfig(baseScenario(), '2025-01-01')
    const expected = calculateMonthlyPayment(15000000, 3.5, 360)
    expect(config.monthlyPayment).toBe(expected)
  })

  it('sets rateType to fixed with no extras or corrections', () => {
    const config = buildComparisonConfig(baseScenario(), '2025-01-01')
    expect(config.rateType).toBe('fixed')
    expect(config.extraRepayments).toBeUndefined()
    expect(config.balanceCorrections).toBeUndefined()
    expect(config.ratePeriods).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// compareMortgages — identical configs
// ─────────────────────────────────────────────

describe('compareMortgages — same config produces zero diff', () => {
  it('returns zero diffs when scenario matches current mortgage', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario()
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.monthlyPayment).toBe(0)
    expect(result.diff.totalInterest).toBe(0)
    expect(result.diff.totalPayments).toBe(0)
    expect(result.diff.months).toBe(0)
  })
})

// ─────────────────────────────────────────────
// compareMortgages — lower rate
// ─────────────────────────────────────────────

describe('compareMortgages — lower rate scenario', () => {
  it('lower rate means less total interest', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ annualRate: 2.5 })
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.totalInterest).toBeLessThan(0)
    expect(result.scenario.totalInterest).toBeLessThan(result.current.totalInterest)
  })

  it('lower rate means lower monthly payment', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ annualRate: 2.5 })
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.monthlyPayment).toBeLessThan(0)
  })

  it('lower rate with same term means roughly same number of months', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ annualRate: 2.5 })
    const result = compareMortgages(mortgage, scenario)

    // Rounding in the schedule can cause ±1 month difference
    expect(Math.abs(result.diff.months)).toBeLessThanOrEqual(1)
  })
})

// ─────────────────────────────────────────────
// compareMortgages — shorter term
// ─────────────────────────────────────────────

describe('compareMortgages — shorter term scenario', () => {
  it('shorter term means higher monthly payment', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ termYears: 20 })
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.monthlyPayment).toBeGreaterThan(0)
  })

  it('shorter term means less total interest', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ termYears: 20 })
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.totalInterest).toBeLessThan(0)
  })

  it('shorter term means fewer months', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ termYears: 20 })
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.months).toBeLessThan(0)
    expect(result.scenario.totalMonths).toBe(240)
    expect(result.current.totalMonths).toBe(360)
  })
})

// ─────────────────────────────────────────────
// compareMortgages — Italian vs French
// ─────────────────────────────────────────────

describe('compareMortgages — Italian vs French amortization', () => {
  it('Italian amortization has lower total interest than French', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ amortizationType: 'italian' })
    const result = compareMortgages(mortgage, scenario)

    // Italian pays less total interest because principal is repaid faster
    expect(result.diff.totalInterest).toBeLessThan(0)
  })

  it('Italian first payment is higher than French fixed payment', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ amortizationType: 'italian' })
    const result = compareMortgages(mortgage, scenario)

    // Italian first payment = principal/360 + full interest > French annuity
    expect(result.scenario.monthlyPayment).toBeGreaterThan(result.current.monthlyPayment)
  })
})

// ─────────────────────────────────────────────
// compareMortgages — edge cases
// ─────────────────────────────────────────────

describe('compareMortgages — edge cases', () => {
  it('handles 0% interest rate scenario', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ annualRate: 0 })
    const result = compareMortgages(mortgage, scenario)

    expect(result.scenario.totalInterest).toBe(0)
    expect(result.diff.totalInterest).toBeLessThan(0)
    expect(result.scenario.monthlyPayment).toBe(Math.round(15000000 / 360))
  })

  it('handles very short term (1 year)', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ termYears: 1 })
    const result = compareMortgages(mortgage, scenario)

    // Rounding can add ±1 month
    expect(result.scenario.totalMonths).toBeGreaterThanOrEqual(12)
    expect(result.scenario.totalMonths).toBeLessThanOrEqual(13)
    expect(result.diff.months).toBeLessThan(0)
    expect(result.scenario.monthlyPayment).toBeGreaterThan(result.current.monthlyPayment)
  })

  it('handles very long term (50 years)', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ termYears: 50 })
    const result = compareMortgages(mortgage, scenario)

    // Rounding can add ±1 month
    expect(result.scenario.totalMonths).toBeGreaterThanOrEqual(600)
    expect(result.scenario.totalMonths).toBeLessThanOrEqual(601)
    expect(result.diff.months).toBeGreaterThan(200)
    expect(result.diff.totalInterest).toBeGreaterThan(0)
  })

  it('handles different principal amounts', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({ principal: 20000000 }) // €200k vs €150k
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.monthlyPayment).toBeGreaterThan(0)
    expect(result.diff.totalPayments).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────
// compareMortgages — current mortgage with extras
// ─────────────────────────────────────────────

describe('compareMortgages — current mortgage with extras', () => {
  it('comparison accounts for extra repayments on current mortgage', () => {
    const mortgage = baseMortgage({
      extraRepayments: [{
        id: '1',
        date: '2025-06-01',
        amount: 1000000, // €10,000 lump sum
        recurring: false,
        mode: 'reduce_term',
      }],
    })
    const scenario = baseScenario() // clean scenario without extras

    const result = compareMortgages(mortgage, scenario)

    // Current mortgage with extra repayment finishes sooner
    expect(result.current.totalMonths).toBeLessThan(result.scenario.totalMonths)
    // So scenario takes longer
    expect(result.diff.months).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────
// compareMortgages — scenario with extra repayments
// ─────────────────────────────────────────────

describe('compareMortgages — scenario with extra repayments', () => {
  it('recurring extra shortens the loan and saves interest', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({
      extraRepayments: [{
        id: 's1', date: '2025-01-01', amount: 20000, recurring: true, mode: 'reduce_term',
      }],
    })
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.months).toBeLessThan(0)
    expect(result.diff.totalInterest).toBeLessThan(0)
  })

  it('reduce_term saves more than reduce_payment', () => {
    const mortgage = baseMortgage()
    const scenarioTerm = baseScenario({
      extraRepayments: [{
        id: 's1', date: '2025-01-01', amount: 20000, recurring: true, mode: 'reduce_term',
      }],
    })
    const scenarioPayment = baseScenario({
      extraRepayments: [{
        id: 's1', date: '2025-01-01', amount: 20000, recurring: true, mode: 'reduce_payment',
      }],
    })

    const resultTerm = compareMortgages(mortgage, scenarioTerm)
    const resultPayment = compareMortgages(mortgage, scenarioPayment)

    // Both save interest
    expect(resultPayment.diff.totalInterest).toBeLessThan(0)
    // reduce_term shortens loan more
    expect(resultTerm.diff.months).toBeLessThan(resultPayment.diff.months)
    // reduce_term saves more interest
    expect(resultTerm.diff.totalInterest).toBeLessThan(resultPayment.diff.totalInterest)
  })

  it('one-time lump sum shortens the loan', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({
      extraRepayments: [{
        id: 's1', date: '2026-06-01', amount: 1000000, recurring: false, mode: 'reduce_term',
      }],
    })
    const result = compareMortgages(mortgage, scenario)

    expect(result.diff.months).toBeLessThan(0)
    expect(result.diff.totalInterest).toBeLessThan(0)
  })

  it('buildComparisonConfig passes extras through', () => {
    const extras = [
      { id: 's1', date: '2025-01-01', amount: 15000, recurring: true, mode: 'reduce_term' as const },
      { id: 's2', date: '2026-06-01', amount: 500000, recurring: false, mode: 'reduce_term' as const },
    ]
    const scenario = baseScenario({ extraRepayments: extras })
    const config = buildComparisonConfig(scenario, '2025-01-01')

    expect(config.extraRepayments).toBeDefined()
    expect(config.extraRepayments).toHaveLength(2)
    expect(config.extraRepayments![0].recurring).toBe(true)
    expect(config.extraRepayments![1].recurring).toBe(false)
  })

  it('buildComparisonConfig omits extras when list is empty', () => {
    const scenario = baseScenario({ extraRepayments: [] })
    const config = buildComparisonConfig(scenario, '2025-01-01')
    expect(config.extraRepayments).toBeUndefined()
  })

  it('extras combined with lower rate saves even more', () => {
    const mortgage = baseMortgage()
    const scenarioRateOnly = baseScenario({ annualRate: 2.5 })
    const scenarioRateAndExtras = baseScenario({
      annualRate: 2.5,
      extraRepayments: [{
        id: 's1', date: '2025-01-01', amount: 10000, recurring: true, mode: 'reduce_term',
      }],
    })

    const resultRateOnly = compareMortgages(mortgage, scenarioRateOnly)
    const resultCombined = compareMortgages(mortgage, scenarioRateAndExtras)

    expect(resultCombined.diff.totalInterest).toBeLessThan(resultRateOnly.diff.totalInterest)
    expect(resultCombined.diff.months).toBeLessThan(resultRateOnly.diff.months)
  })
})

// ─────────────────────────────────────────────
// Calculation validation — cross-check against getMortgageStats
// ─────────────────────────────────────────────

describe('buildResult — matches getMortgageStats', () => {
  it('totalInterest matches for a basic fixed mortgage', () => {
    const config = baseMortgage()
    const result = buildResult(config)
    const stats = getMortgageStats(config)

    expect(result.totalInterest).toBe(stats.totalInterest)
    expect(result.totalPayments).toBe(stats.totalPayments)
    expect(result.totalMonths).toBe(stats.totalMonths)
    expect(result.payoffDate).toBe(stats.payoffDate)
  })

  it('totalInterest matches for Italian amortization', () => {
    const config = baseMortgage({ amortizationType: 'italian' })
    const result = buildResult(config)
    const stats = getMortgageStats(config)

    expect(result.totalInterest).toBe(stats.totalInterest)
    expect(result.totalPayments).toBe(stats.totalPayments)
    expect(result.totalMonths).toBe(stats.totalMonths)
  })

  it('totalInterest matches for mortgage with extra repayments', () => {
    const config = baseMortgage({
      extraRepayments: [
        { id: '1', date: '2025-06-01', amount: 500000, recurring: false, mode: 'reduce_term' },
        { id: '2', date: '2026-01-01', amount: 20000, recurring: true, mode: 'reduce_term' },
      ],
    })
    const result = buildResult(config)
    const stats = getMortgageStats(config)

    expect(result.totalInterest).toBe(stats.totalInterest)
    expect(result.totalPayments).toBe(stats.totalPayments)
    expect(result.totalMonths).toBe(stats.totalMonths)
  })

  it('totalInterest matches for mortgage with rate periods', () => {
    const config = baseMortgage({
      rateType: 'variable',
      ratePeriods: [
        { id: '1', startDate: '2026-01-01', annualRate: 4.0, rateType: 'variable' },
        { id: '2', startDate: '2027-01-01', annualRate: 3.0, rateType: 'variable' },
      ],
    })
    const result = buildResult(config)
    const stats = getMortgageStats(config)

    expect(result.totalInterest).toBe(stats.totalInterest)
    expect(result.totalPayments).toBe(stats.totalPayments)
    expect(result.totalMonths).toBe(stats.totalMonths)
  })
})

// ─────────────────────────────────────────────
// Invariant: totalPayments = principal + totalInterest
// ─────────────────────────────────────────────

describe('totalPayments invariant — always equals principal + totalInterest', () => {
  it('holds for basic fixed mortgage', () => {
    const config = baseMortgage()
    const result = buildResult(config)

    // totalPayments = sum of all payments = principal repaid + interest paid
    expect(result.totalPayments).toBe(config.principal + result.totalInterest)
  })

  it('holds for Italian amortization', () => {
    const config = baseMortgage({ amortizationType: 'italian' })
    const result = buildResult(config)

    expect(result.totalPayments).toBe(config.principal + result.totalInterest)
  })

  it('holds for mortgage with recurring extras (reduce_term)', () => {
    const scenario = baseScenario({
      extraRepayments: [{
        id: 's1', date: '2025-01-01', amount: 20000, recurring: true, mode: 'reduce_term',
      }],
    })
    const config = buildComparisonConfig(scenario, '2025-01-01')
    const result = buildResult(config)

    // Extras go to principal, not to a separate bucket
    expect(result.totalPayments).toBe(config.principal + result.totalInterest)
  })

  it('holds for mortgage with recurring extras (reduce_payment)', () => {
    const scenario = baseScenario({
      extraRepayments: [{
        id: 's1', date: '2025-01-01', amount: 20000, recurring: true, mode: 'reduce_payment',
      }],
    })
    const config = buildComparisonConfig(scenario, '2025-01-01')
    const result = buildResult(config)

    expect(result.totalPayments).toBe(config.principal + result.totalInterest)
  })

  it('holds for mortgage with one-time lump sum extra', () => {
    const scenario = baseScenario({
      extraRepayments: [{
        id: 's1', date: '2026-06-01', amount: 2000000, recurring: false, mode: 'reduce_term',
      }],
    })
    const config = buildComparisonConfig(scenario, '2025-01-01')
    const result = buildResult(config)

    expect(result.totalPayments).toBe(config.principal + result.totalInterest)
  })
})

// ─────────────────────────────────────────────
// Edge cases — calculation integrity
// ─────────────────────────────────────────────

describe('calculation edge cases', () => {
  it('lump sum larger than remaining balance does not overshoot', () => {
    const scenario = baseScenario({
      principal: 1000000, // €10,000 — small mortgage
      termYears: 5,
      extraRepayments: [{
        id: 's1', date: '2025-02-01', amount: 2000000, // €20,000 — way more than remaining
        recurring: false, mode: 'reduce_term',
      }],
    })
    const config = buildComparisonConfig(scenario, '2025-01-01')
    const result = buildResult(config)

    // Should pay off immediately after the lump sum
    expect(result.totalMonths).toBeLessThanOrEqual(2)
    // Balance should be 0
    expect(result.schedule[result.schedule.length - 1].remainingBalance).toBe(0)
    // Total payments should still equal principal + interest
    expect(result.totalPayments).toBe(config.principal + result.totalInterest)
  })

  it('Italian amortization with extras in scenario', () => {
    const mortgage = baseMortgage()
    const scenario = baseScenario({
      amortizationType: 'italian',
      extraRepayments: [{
        id: 's1', date: '2025-06-01', amount: 50000, recurring: true, mode: 'reduce_term',
      }],
    })
    const result = compareMortgages(mortgage, scenario)

    // Italian + extras should save more interest than French baseline
    expect(result.diff.totalInterest).toBeLessThan(0)
    // Italian first payment is higher
    expect(result.scenario.monthlyPayment).toBeGreaterThan(result.current.monthlyPayment)
  })

  it('both sides with extras — diffs are relative', () => {
    const mortgage = baseMortgage({
      extraRepayments: [{
        id: '1', date: '2025-01-01', amount: 30000, recurring: true, mode: 'reduce_term',
      }],
    })
    const scenario = baseScenario({
      extraRepayments: [{
        id: 's1', date: '2025-01-01', amount: 30000, recurring: true, mode: 'reduce_term',
      }],
    })
    const result = compareMortgages(mortgage, scenario)

    // Same mortgage params + same extras = zero diff
    expect(result.diff.monthlyPayment).toBe(0)
    expect(result.diff.totalInterest).toBe(0)
    expect(result.diff.months).toBe(0)
  })

  it('lower rate always means less total interest (with same term/principal)', () => {
    const mortgage = baseMortgage()
    for (const rate of [0.5, 1.0, 2.0, 2.5, 3.0, 3.49]) {
      const scenario = baseScenario({ annualRate: rate })
      const result = compareMortgages(mortgage, scenario)
      expect(result.diff.totalInterest).toBeLessThan(0)
    }
  })

  it('higher rate always means more total interest', () => {
    const mortgage = baseMortgage()
    for (const rate of [3.51, 4.0, 5.0, 7.5, 10.0]) {
      const scenario = baseScenario({ annualRate: rate })
      const result = compareMortgages(mortgage, scenario)
      expect(result.diff.totalInterest).toBeGreaterThan(0)
    }
  })

  it('shorter term always means less total interest (same rate/principal)', () => {
    const mortgage = baseMortgage() // 30 years
    for (const term of [5, 10, 15, 20, 25, 29]) {
      const scenario = baseScenario({ termYears: term })
      const result = compareMortgages(mortgage, scenario)
      expect(result.diff.totalInterest).toBeLessThan(0)
    }
  })

  it('schedule last row always has remainingBalance = 0', () => {
    // Use buildComparisonConfig to ensure payment is consistent with rate/term
    const scenarios: ComparisonScenario[] = [
      baseScenario(),
      baseScenario({ amortizationType: 'italian' }),
      baseScenario({ annualRate: 0 }),
      baseScenario({ termYears: 1 }),
      baseScenario({ annualRate: 5, termYears: 15 }),
    ]
    for (const scenario of scenarios) {
      const config = buildComparisonConfig(scenario, '2025-01-01')
      const result = buildResult(config)
      expect(result.schedule[result.schedule.length - 1].remainingBalance).toBe(0)
    }
  })

  it('monthly payment headline for Italian uses first row, not config.monthlyPayment', () => {
    const scenario = baseScenario({ amortizationType: 'italian' })
    const config = buildComparisonConfig(scenario, '2025-01-01')
    const result = buildResult(config)

    // Italian first payment = principal/term + first month interest
    // Should NOT equal config.monthlyPayment (which is calculated as French annuity)
    const schedule = generateAmortizationSchedule(config)
    expect(result.monthlyPayment).toBe(schedule[0].payment)
    expect(result.monthlyPayment).not.toBe(config.monthlyPayment)
  })
})
