import { describe, it, expect } from 'vitest'
import {
  calculateMonthlyPayment,
  generateAmortizationSchedule,
  getMortgageStats,
  calculateMortgageImpact,
  getMixedSwitchDate,
  isMixedInFixedPeriod,
} from './mortgage-utils'
import type { MortgageConfig } from '@/types/mortgage'

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

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

function totalInterest(config: MortgageConfig): number {
  return generateAmortizationSchedule(config).reduce((s, r) => s + r.interestPortion, 0)
}

// ─────────────────────────────────────────────
// 1. Monthly payment calculation
// ─────────────────────────────────────────────

describe('calculateMonthlyPayment', () => {
  it('€150k at 3.5% for 30 years ≈ €673/month', () => {
    const payment = calculateMonthlyPayment(15000000, 3.5, 360)
    expect(payment).toBeGreaterThan(67000)
    expect(payment).toBeLessThan(68000)
  })

  it('€100k at 5% for 1 year ≈ €8,560/month', () => {
    const payment = calculateMonthlyPayment(10000000, 5, 12)
    expect(payment).toBeGreaterThan(850000)
    expect(payment).toBeLessThan(860000)
  })

  it('0% interest = principal / months', () => {
    expect(calculateMonthlyPayment(12000000, 0, 120)).toBe(100000)
  })

  it('returns 0 for invalid inputs', () => {
    expect(calculateMonthlyPayment(0, 3.5, 360)).toBe(0)
    expect(calculateMonthlyPayment(15000000, 3.5, 0)).toBe(0)
    expect(calculateMonthlyPayment(-100, 3.5, 360)).toBe(0)
  })

  it('takes MONTHS not years (regression: years-vs-months bug)', () => {
    const months360 = calculateMonthlyPayment(15000000, 3.5, 360)
    const months30 = calculateMonthlyPayment(15000000, 3.5, 30)
    expect(months30).toBeGreaterThan(months360 * 5)
  })
})

// ─────────────────────────────────────────────
// 2. Basic amortization schedule
// ─────────────────────────────────────────────

describe('amortization schedule — basics', () => {
  it('generates 360 rows for a 30-year mortgage', () => {
    expect(generateAmortizationSchedule(baseMortgage()).length).toBe(360)
  })

  it('ends with zero balance', () => {
    const schedule = generateAmortizationSchedule(baseMortgage())
    expect(schedule[schedule.length - 1].remainingBalance).toBe(0)
  })

  it('first month interest ≈ €437 (150k × 3.5% / 12)', () => {
    const schedule = generateAmortizationSchedule(baseMortgage())
    expect(schedule[0].interestPortion).toBeGreaterThan(43000)
    expect(schedule[0].interestPortion).toBeLessThan(44000)
  })

  it('principal portion grows each month (amortization effect)', () => {
    const s = generateAmortizationSchedule(baseMortgage())
    expect(s[100].principalPortion).toBeGreaterThan(s[0].principalPortion)
    expect(s[200].principalPortion).toBeGreaterThan(s[100].principalPortion)
  })

  it('interest portion decreases each month', () => {
    const s = generateAmortizationSchedule(baseMortgage())
    expect(s[100].interestPortion).toBeLessThan(s[0].interestPortion)
  })

  it('balance decreases monotonically', () => {
    const s = generateAmortizationSchedule(baseMortgage())
    for (let i = 1; i < s.length; i++) {
      expect(s[i].remainingBalance).toBeLessThanOrEqual(s[i - 1].remainingBalance)
    }
  })

  it('total principal paid ≈ original loan amount', () => {
    const s = generateAmortizationSchedule(baseMortgage())
    const totalPrincipal = s.reduce((sum, r) => sum + r.principalPortion, 0)
    expect(Math.abs(totalPrincipal - 15000000)).toBeLessThan(100)
  })

  it('short mortgage (1 year) works', () => {
    const config = baseMortgage({
      termYears: 1,
      monthlyPayment: calculateMonthlyPayment(15000000, 3.5, 12),
    })
    const s = generateAmortizationSchedule(config)
    expect(s.length).toBeLessThanOrEqual(13) // 12 or 13 due to rounding
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('payment less than interest → no principal reduction', () => {
    const config = baseMortgage({ monthlyPayment: 10000, monthlyPaymentOverride: true })
    const s = generateAmortizationSchedule(config)
    expect(s[0].principalPortion).toBe(0)
    expect(s[0].remainingBalance).toBe(15000000)
  })
})

// ─────────────────────────────────────────────
// 3. Rate changes
// ─────────────────────────────────────────────

describe('amortization schedule — rate changes', () => {
  it('applies rate change at correct month', () => {
    const config = baseMortgage({
      ratePeriods: [{ id: '1', startDate: '2027-01-01', annualRate: 5.0, rateType: 'variable' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[23].rateApplied).toBe(3.5)  // Dec 2026
    expect(s[24].rateApplied).toBe(5.0)  // Jan 2027
    expect(s[24].isRateChange).toBe(true)
  })

  it('recalculates payment when rate increases', () => {
    const config = baseMortgage({
      ratePeriods: [{ id: '1', startDate: '2027-01-01', annualRate: 5.0, rateType: 'variable' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[24].payment).toBeGreaterThan(s[23].payment)
  })

  it('handles multiple rate changes', () => {
    const config = baseMortgage({
      ratePeriods: [
        { id: '1', startDate: '2026-01-01', annualRate: 4.0, rateType: 'variable' },
        { id: '2', startDate: '2027-01-01', annualRate: 5.0, rateType: 'variable' },
        { id: '3', startDate: '2028-01-01', annualRate: 3.0, rateType: 'variable' },
      ],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[11].rateApplied).toBe(3.5) // Dec 2025 — initial
    expect(s[12].rateApplied).toBe(4.0) // Jan 2026
    expect(s[24].rateApplied).toBe(5.0) // Jan 2027
    expect(s[36].rateApplied).toBe(3.0) // Jan 2028
  })

  it('recalculates at each rate boundary', () => {
    const config = baseMortgage({
      ratePeriods: [
        { id: '1', startDate: '2026-01-01', annualRate: 4.0, rateType: 'variable' },
        { id: '2', startDate: '2027-01-01', annualRate: 2.0, rateType: 'variable' },
      ],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[12].payment).toBeGreaterThan(s[0].payment)  // 4% > 3.5%
    expect(s[24].payment).toBeLessThan(s[12].payment)     // 2% < 4%
  })

  it('handles unsorted rate periods', () => {
    const config = baseMortgage({
      ratePeriods: [
        { id: '2', startDate: '2028-01-01', annualRate: 3.0, rateType: 'variable' },
        { id: '1', startDate: '2026-01-01', annualRate: 4.0, rateType: 'variable' },
      ],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[12].rateApplied).toBe(4.0)
    expect(s[36].rateApplied).toBe(3.0)
  })
})

// ─────────────────────────────────────────────
// 4. Extra repayments — reduce term
// ─────────────────────────────────────────────

describe('extra repayments — reduce term', () => {
  it('one-time extra shortens the loan', () => {
    const config = baseMortgage({
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s.length).toBeLessThan(360)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('payment stays the same after extra', () => {
    const config = baseMortgage({
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' }],
    })
    const s = generateAmortizationSchedule(config)
    const before = s[10].principalPortion + s[10].interestPortion
    const after = s[13].principalPortion + s[13].interestPortion
    expect(Math.abs(before - after) / before).toBeLessThan(0.01)
  })

  it('recurring extra significantly shortens the loan', () => {
    const config = baseMortgage({
      extraRepayments: [{ id: '1', date: '2025-01-01', amount: 10000, recurring: true, mode: 'reduce_term' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s.length).toBeLessThan(340)
    expect(s[5].extraPayment).toBe(10000)
  })

  it('extra larger than balance pays off immediately', () => {
    const config = baseMortgage({
      principal: 100000,
      monthlyPayment: calculateMonthlyPayment(100000, 3.5, 360),
      extraRepayments: [{ id: '1', date: '2025-02-01', amount: 200000, recurring: false, mode: 'reduce_term' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s.length).toBe(2)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('recurring with end date stops after end', () => {
    const config = baseMortgage({
      extraRepayments: [{
        id: '1', date: '2025-06-01', amount: 20000,
        recurring: true, endDate: '2026-06-01', mode: 'reduce_term',
      }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[5].extraPayment).toBe(20000)   // Jun 2025 — active
    expect(s[17].extraPayment).toBe(20000)  // Jun 2026 — last month
    expect(s[18].extraPayment).toBeUndefined() // Jul 2026 — stopped
  })
})

// ─────────────────────────────────────────────
// 5. Extra repayments — reduce payment
// ─────────────────────────────────────────────

describe('extra repayments — reduce payment', () => {
  it('lowers monthly payment after extra', () => {
    const config = baseMortgage({
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_payment' }],
    })
    const s = generateAmortizationSchedule(config)
    const before = s[10].principalPortion + s[10].interestPortion
    const after = s[13].principalPortion + s[13].interestPortion
    expect(after).toBeLessThan(before)
  })

  it('keeps approximately same term length', () => {
    const withExtra = baseMortgage({
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_payment' }],
    })
    const scheduleWith = generateAmortizationSchedule(withExtra)
    const scheduleWithout = generateAmortizationSchedule(baseMortgage())
    expect(Math.abs(scheduleWith.length - scheduleWithout.length)).toBeLessThan(5)
  })

  it('saves less interest than reduce_term', () => {
    const extras = [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false as const }]
    const termInterest = totalInterest(baseMortgage({ extraRepayments: [{ ...extras[0], mode: 'reduce_term' as const }] }))
    const payInterest = totalInterest(baseMortgage({ extraRepayments: [{ ...extras[0], mode: 'reduce_payment' as const }] }))
    expect(termInterest).toBeLessThan(payInterest)
  })

  it('multiple reduce_payment extras still pay off the loan', () => {
    const config = baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' as const },
        { id: '2', date: '2027-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' as const },
        { id: '3', date: '2028-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' as const },
      ],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 6. Balance corrections
// ─────────────────────────────────────────────

describe('balance corrections', () => {
  it('resets balance at correction date', () => {
    const config = baseMortgage({
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 14000000, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    // Jan 2026 = month 13 = index 12
    expect(s[12].remainingBalance).toBeLessThan(14000000)
    expect(s[12].remainingBalance).toBeGreaterThan(13900000)
  })

  it('recalculates payment when keepCurrentPayment=false', () => {
    const config = baseMortgage({
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 10000000, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[13].payment).toBeLessThan(s[10].payment) // lower balance → lower payment
  })

  it('keeps payment when keepCurrentPayment=true', () => {
    const config = baseMortgage({
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 10000000, keepCurrentPayment: true }],
    })
    const s = generateAmortizationSchedule(config)
    expect(Math.abs(s[10].payment - s[13].payment)).toBeLessThan(s[10].payment * 0.01)
  })

  it('handles multiple corrections in date order', () => {
    const config = baseMortgage({
      balanceCorrections: [
        { id: '2', date: '2027-01-01', balance: 13000000, keepCurrentPayment: false },
        { id: '1', date: '2026-01-01', balance: 14000000, keepCurrentPayment: false },
      ],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[12].remainingBalance).toBeLessThan(14000000)  // first correction
    expect(s[24].remainingBalance).toBeLessThan(13000000)  // second correction
  })

  it('handles correction with balance HIGHER than calculated', () => {
    const config = baseMortgage({
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 15500000, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[12].remainingBalance).toBeGreaterThan(15400000)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 7. Combined scenarios
// ─────────────────────────────────────────────

describe('combined: rate changes + extras + corrections', () => {
  it('rate change and extra repayment in same month', () => {
    const config = baseMortgage({
      ratePeriods: [{ id: '1', startDate: '2026-01-01', annualRate: 5.0, rateType: 'variable' }],
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_term' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[12].rateApplied).toBe(5.0)
    expect(s[12].isRateChange).toBe(true)
    expect(s[12].extraPayment).toBe(500000)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('balance correction and rate change in same month', () => {
    const config = baseMortgage({
      ratePeriods: [{ id: '1', startDate: '2026-01-01', annualRate: 5.0, rateType: 'variable' }],
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 14000000, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[12].rateApplied).toBe(5.0)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('recurring extra + multiple rate changes = valid schedule', () => {
    const config = baseMortgage({
      ratePeriods: [
        { id: '1', startDate: '2026-01-01', annualRate: 4.0, rateType: 'variable' },
        { id: '2', startDate: '2027-01-01', annualRate: 5.5, rateType: 'variable' },
      ],
      extraRepayments: [{ id: '1', date: '2025-06-01', amount: 20000, recurring: true, mode: 'reduce_term' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s.length).toBeLessThan(350)
    for (const row of s) {
      expect(row.payment).toBeGreaterThan(0)
      expect(row.interestPortion).toBeGreaterThanOrEqual(0)
      expect(row.remainingBalance).toBeGreaterThanOrEqual(0)
    }
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 8. Stats
// ─────────────────────────────────────────────

describe('getMortgageStats', () => {
  it('new mortgage: 0 months elapsed, full balance', () => {
    const stats = getMortgageStats(baseMortgage(), new Date('2025-01-15'))
    expect(stats.totalMonths).toBe(360)
    expect(stats.monthsElapsed).toBe(0)
    expect(stats.monthsRemaining).toBe(360)
    expect(stats.remainingBalance).toBe(15000000)
    expect(stats.progressPercent).toBe(0)
  })

  it('after 12 months: balance reduced, progress > 0', () => {
    const stats = getMortgageStats(baseMortgage(), new Date('2026-01-15'))
    expect(stats.monthsElapsed).toBe(12)
    expect(stats.monthsRemaining).toBe(348)
    expect(stats.principalPaidSoFar).toBeGreaterThan(0)
    expect(stats.interestPaidSoFar).toBeGreaterThan(0)
    expect(stats.remainingBalance).toBeLessThan(15000000)
    expect(stats.progressPercent).toBeGreaterThan(0)
  })

  it('total principal paid ≈ loan amount', () => {
    const s = generateAmortizationSchedule(baseMortgage())
    const totalPrincipal = s.reduce((sum, r) => sum + r.principalPortion, 0)
    expect(Math.abs(totalPrincipal - 15000000)).toBeLessThan(100)
  })

  it('fully paid off: 100% progress, zero balance', () => {
    const stats = getMortgageStats(baseMortgage(), new Date('2060-01-01'))
    expect(stats.monthsElapsed).toBe(360)
    expect(stats.monthsRemaining).toBe(0)
    expect(stats.remainingBalance).toBe(0)
    expect(stats.progressPercent).toBeCloseTo(100, 0)
  })

  it('before start date: 0 elapsed, full balance', () => {
    const stats = getMortgageStats(baseMortgage(), new Date('2024-06-01'))
    expect(stats.monthsElapsed).toBe(0)
    expect(stats.remainingBalance).toBe(15000000)
    expect(stats.progressPercent).toBe(0)
  })

  it('with extra repayments that pay off early', () => {
    const config = baseMortgage({
      extraRepayments: [
        { id: '1', date: '2025-06-01', amount: 10000000, recurring: false, mode: 'reduce_term' as const },
      ],
    })
    const stats = getMortgageStats(config, new Date('2025-01-15'))
    expect(stats.totalMonths).toBeLessThan(360) // shortened by extra payment
  })
})

// ─────────────────────────────────────────────
// 9. Impact calculation
// ─────────────────────────────────────────────

describe('calculateMortgageImpact', () => {
  it('returns null without extra repayments', () => {
    expect(calculateMortgageImpact(baseMortgage())).toBeNull()
  })

  it('shows months and interest saved', () => {
    const config = baseMortgage({
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' }],
    })
    const impact = calculateMortgageImpact(config)!
    expect(impact.monthsSaved).toBeGreaterThan(0)
    expect(impact.interestSaved).toBeGreaterThan(0)
  })

  it('recurring extra saves more than one-time', () => {
    const oneTime = calculateMortgageImpact(baseMortgage({
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 10000, recurring: false, mode: 'reduce_term' }],
    }))!
    const recurring = calculateMortgageImpact(baseMortgage({
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 10000, recurring: true, mode: 'reduce_term' }],
    }))!
    expect(recurring.interestSaved).toBeGreaterThan(oneTime.interestSaved)
    expect(recurring.monthsSaved).toBeGreaterThan(oneTime.monthsSaved)
  })
})

// ─────────────────────────────────────────────
// 10. Edge cases
// ─────────────────────────────────────────────

describe('edge cases', () => {
  it('variable config but no rate periods', () => {
    const config = baseMortgage({
      rateType: 'variable',
      variableRate: {
        subtype: 'tracker', referenceRateId: 'euribor_12m',
        currentReferenceRate: 2.6, spread: 0.9, reviewFrequencyMonths: 12,
      },
    })
    const s = generateAmortizationSchedule(config)
    expect(s.length).toBe(360)
    expect(s[0].rateApplied).toBe(3.5) // uses annualRate
  })

  it('rate periods but no variableRate config', () => {
    const config = baseMortgage({
      ratePeriods: [{ id: '1', startDate: '2026-01-01', annualRate: 4.0, rateType: 'variable' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[12].rateApplied).toBe(4.0)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 11. Amortization methods
// ─────────────────────────────────────────────

describe('Italian amortization (constant principal)', () => {
  it('principal portion is approximately constant', () => {
    const config = baseMortgage({ amortizationType: 'italian' })
    const s = generateAmortizationSchedule(config)
    const firstPrincipal = s[0].principalPortion
    const midPrincipal = s[180].principalPortion
    expect(Math.abs(firstPrincipal - midPrincipal)).toBeLessThan(200)
  })

  it('total payment decreases over time', () => {
    const config = baseMortgage({ amortizationType: 'italian' })
    const s = generateAmortizationSchedule(config)
    expect(s[0].payment).toBeGreaterThan(s[100].payment)
    expect(s[100].payment).toBeGreaterThan(s[200].payment)
  })

  it('first payment higher than French', () => {
    const french = generateAmortizationSchedule(baseMortgage())
    const italian = generateAmortizationSchedule(baseMortgage({ amortizationType: 'italian' }))
    expect(italian[0].payment).toBeGreaterThan(french[0].payment)
  })

  it('ends with zero balance', () => {
    const s = generateAmortizationSchedule(baseMortgage({ amortizationType: 'italian' }))
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('less total interest than French', () => {
    expect(totalInterest(baseMortgage({ amortizationType: 'italian' }))).toBeLessThan(totalInterest(baseMortgage()))
  })

  it('extra repayment (reduce_term) saves interest', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' }],
    })
    const withExtra = totalInterest(config)
    const without = totalInterest(baseMortgage({ amortizationType: 'italian' }))
    expect(withExtra).toBeLessThan(without)
    const s = generateAmortizationSchedule(config)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('extra repayment (reduce_payment) stays Italian style (not French)', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_payment' }],
    })
    const s = generateAmortizationSchedule(config)
    // After extra payment, payments should still decrease (Italian behavior)
    // NOT become constant (French behavior)
    expect(s[14].payment).toBeGreaterThan(s[15].payment)
    expect(s[15].payment).toBeGreaterThan(s[16].payment)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('rate change + Italian: payments adjust naturally', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      ratePeriods: [{ id: '1', startDate: '2027-01-01', annualRate: 5.0, rateType: 'variable' }],
    })
    const s = generateAmortizationSchedule(config)
    // At rate change (month 25), interest jumps but principal stays ~constant
    const beforeChange = s[23] // Dec 2026
    const afterChange = s[24]  // Jan 2027
    // Interest should increase (rate went from 3.5% to 5%)
    expect(afterChange.interestPortion).toBeGreaterThan(beforeChange.interestPortion)
    // Principal should be approximately the same
    expect(Math.abs(afterChange.principalPortion - beforeChange.principalPortion)).toBeLessThan(500)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('balance correction + Italian: adjusts naturally', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 14000000, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    // After correction, payments should still decrease
    expect(s[13].payment).toBeGreaterThan(s[14].payment)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 12. Mixed mortgage
// ─────────────────────────────────────────────

describe('mixed mortgage', () => {
  // Helper: 250k, 2.5% fixed for 10 years, then variable at Euribor + 0.9%
  function mixedMortgage(overrides: Partial<MortgageConfig> = {}): MortgageConfig {
    return {
      principal: 25000000, // €250,000
      annualRate: 2.5,     // fixed rate
      rateType: 'mixed',
      termYears: 30,
      startDate: '2020-01-01',
      monthlyPayment: calculateMonthlyPayment(25000000, 2.5, 360),
      monthlyPaymentOverride: false,
      mixedRate: {
        fixedRate: 2.5,
        fixedPeriodYears: 10,
        referenceRateId: 'euribor_12m',
        currentReferenceRate: 2.6,
        spread: 0.9,
        reviewFrequencyMonths: 12,
      },
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
      ...overrides,
    }
  }

  describe('getMixedSwitchDate', () => {
    it('calculates switch date correctly', () => {
      expect(getMixedSwitchDate('2020-01-01', 10)).toBe('2030-01-01')
      expect(getMixedSwitchDate('2024-06-15', 5)).toBe('2029-06-15')
    })
  })

  describe('isMixedInFixedPeriod', () => {
    it('returns true during fixed period', () => {
      expect(isMixedInFixedPeriod(mixedMortgage(), new Date('2025-06-01'))).toBe(true)
    })

    it('returns false after fixed period', () => {
      expect(isMixedInFixedPeriod(mixedMortgage(), new Date('2031-01-01'))).toBe(false)
    })

    it('returns false for non-mixed mortgages', () => {
      expect(isMixedInFixedPeriod(baseMortgage())).toBe(false)
    })
  })

  describe('amortization during fixed period', () => {
    it('uses fixed rate for all months in fixed period', () => {
      const s = generateAmortizationSchedule(mixedMortgage())
      // First 120 months (10 years) should use 2.5%
      for (let i = 0; i < 120; i++) {
        expect(s[i].rateApplied).toBe(2.5)
      }
    })

    it('payment is constant during fixed period', () => {
      const s = generateAmortizationSchedule(mixedMortgage())
      const payment = s[0].payment
      for (let i = 1; i < 120; i++) {
        expect(s[i].payment).toBe(payment)
      }
    })

    it('payment is based on fixed rate for full term (not just fixed period)', () => {
      const m = mixedMortgage()
      // Payment should be for 250k at 2.5% for 360 months
      const expected = calculateMonthlyPayment(25000000, 2.5, 360)
      expect(m.monthlyPayment).toBe(expected)
    })
  })

  describe('switch to variable', () => {
    it('recalculates payment at switch date', () => {
      const config = mixedMortgage({
        ratePeriods: [{
          id: '1',
          startDate: '2030-01-01', // switch date
          annualRate: 3.5,         // Euribor 2.6% + 0.9%
          rateType: 'variable',
        }],
      })
      const s = generateAmortizationSchedule(config)
      // Month 120 (Dec 2029) = last fixed month
      expect(s[119].rateApplied).toBe(2.5)
      // Month 121 (Jan 2030) = first variable month
      expect(s[120].rateApplied).toBe(3.5)
      expect(s[120].isRateChange).toBe(true)
      // Payment should change (higher rate = higher payment)
      expect(s[120].payment).toBeGreaterThan(s[119].payment)
    })

    it('uses remaining balance and remaining term for new payment', () => {
      const config = mixedMortgage({
        ratePeriods: [{
          id: '1', startDate: '2030-01-01', annualRate: 3.5, rateType: 'variable',
        }],
      })
      const s = generateAmortizationSchedule(config)
      // At month 120, remaining balance
      const balanceAtSwitch = s[119].remainingBalance
      // New payment should equal: amortization(balance, 3.5%, 240 months)
      const expectedPayment = calculateMonthlyPayment(balanceAtSwitch, 3.5, 240)
      // Allow small rounding tolerance
      expect(Math.abs(s[120].payment - (s[120].extraPayment ?? 0) - expectedPayment)).toBeLessThan(200)
    })
  })

  describe('multiple rate changes after switch', () => {
    it('handles subsequent variable rate reviews', () => {
      const config = mixedMortgage({
        ratePeriods: [
          { id: '1', startDate: '2030-01-01', annualRate: 3.5, rateType: 'variable' },
          { id: '2', startDate: '2031-01-01', annualRate: 4.0, rateType: 'variable' },
          { id: '3', startDate: '2032-01-01', annualRate: 3.0, rateType: 'variable' },
        ],
      })
      const s = generateAmortizationSchedule(config)
      expect(s[120].rateApplied).toBe(3.5) // Jan 2030
      expect(s[132].rateApplied).toBe(4.0) // Jan 2031
      expect(s[144].rateApplied).toBe(3.0) // Jan 2032
      expect(s[s.length - 1].remainingBalance).toBe(0)
    })
  })

  describe('no rate periods = pure fixed behavior', () => {
    it('uses fixed rate for entire term', () => {
      const config = mixedMortgage() // no ratePeriods
      const s = generateAmortizationSchedule(config)
      expect(s.length).toBeLessThanOrEqual(361) // may be 360 or 361 due to rounding
      expect(s.length).toBeGreaterThanOrEqual(360)
      for (const row of s) {
        expect(row.rateApplied).toBe(2.5)
      }
      expect(s[s.length - 1].remainingBalance).toBe(0)
    })
  })

  describe('extra repayments with mixed mortgage', () => {
    it('extra during fixed period works', () => {
      const config = mixedMortgage({
        extraRepayments: [{ id: '1', date: '2025-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' }],
      })
      const s = generateAmortizationSchedule(config)
      expect(s.length).toBeLessThan(360)
      expect(s[s.length - 1].remainingBalance).toBe(0)
    })

    it('recurring extra across the switch continues', () => {
      const config = mixedMortgage({
        ratePeriods: [{ id: '1', startDate: '2030-01-01', annualRate: 3.5, rateType: 'variable' }],
        extraRepayments: [{ id: '1', date: '2029-06-01', amount: 10000, recurring: true, mode: 'reduce_term' }],
      })
      const s = generateAmortizationSchedule(config)
      // Extra in June 2029 (before switch)
      expect(s[113].extraPayment).toBe(10000)
      // Extra in June 2030 (after switch)
      expect(s[125].extraPayment).toBe(10000)
    })
  })

  describe('balance correction at switch date', () => {
    it('correction applied before rate change', () => {
      const config = mixedMortgage({
        ratePeriods: [{ id: '1', startDate: '2030-01-01', annualRate: 3.5, rateType: 'variable' }],
        balanceCorrections: [{ id: '1', date: '2030-01-01', balance: 18000000, keepCurrentPayment: false }],
      })
      const s = generateAmortizationSchedule(config)
      // Should use corrected balance for payment recalculation at switch
      expect(s[120].rateApplied).toBe(3.5)
      expect(s[s.length - 1].remainingBalance).toBe(0)
    })
  })

  describe('edge: fixed period = 0 (effectively variable)', () => {
    it('behaves like variable from month 1', () => {
      const config = mixedMortgage({
        mixedRate: {
          fixedRate: 2.5,
          fixedPeriodYears: 0,
          referenceRateId: 'euribor_12m',
          currentReferenceRate: 2.6,
          spread: 0.9,
          reviewFrequencyMonths: 12,
        },
        ratePeriods: [{ id: '1', startDate: '2020-01-01', annualRate: 3.5, rateType: 'variable' }],
      })
      const s = generateAmortizationSchedule(config)
      expect(s[0].rateApplied).toBe(3.5)
    })
  })
})

// ─────────────────────────────────────────────
// 13. Cross-feature combinations
// ─────────────────────────────────────────────

describe('cross-feature combinations', () => {
  it('mixed + Italian amortization during fixed period', () => {
    const config: MortgageConfig = {
      principal: 25000000,
      annualRate: 2.5,
      rateType: 'mixed',
      termYears: 30,
      startDate: '2020-01-01',
      monthlyPayment: calculateMonthlyPayment(25000000, 2.5, 360),
      monthlyPaymentOverride: false,
      amortizationType: 'italian',
      mixedRate: {
        fixedRate: 2.5, fixedPeriodYears: 10,
        referenceRateId: 'euribor_12m', currentReferenceRate: 2.6, spread: 0.9, reviewFrequencyMonths: 12,
      },
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    }
    const s = generateAmortizationSchedule(config)
    // Italian: payments should decrease during fixed period
    expect(s[0].payment).toBeGreaterThan(s[60].payment)
    // Rate stays fixed at 2.5%
    expect(s[0].rateApplied).toBe(2.5)
    expect(s[119].rateApplied).toBe(2.5)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('mixed + Italian + rate change after switch', () => {
    const config: MortgageConfig = {
      principal: 25000000,
      annualRate: 2.5,
      rateType: 'mixed',
      termYears: 30,
      startDate: '2020-01-01',
      monthlyPayment: calculateMonthlyPayment(25000000, 2.5, 360),
      monthlyPaymentOverride: false,
      amortizationType: 'italian',
      mixedRate: {
        fixedRate: 2.5, fixedPeriodYears: 10,
        referenceRateId: 'euribor_12m', currentReferenceRate: 2.6, spread: 0.9, reviewFrequencyMonths: 12,
      },
      ratePeriods: [
        { id: '1', startDate: '2030-01-01', annualRate: 3.5, rateType: 'variable' },
      ],
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    }
    const s = generateAmortizationSchedule(config)
    // After switch: rate changes, Italian continues (decreasing payments)
    expect(s[120].rateApplied).toBe(3.5)
    expect(s[120].payment).toBeGreaterThan(s[121].payment) // still Italian: decreasing
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('Italian stats: currentMonthPrincipal stays ~constant', () => {
    const config = baseMortgage({ amortizationType: 'italian' })
    const statsMonth6 = getMortgageStats(config, new Date('2025-07-15'))
    const statsMonth12 = getMortgageStats(config, new Date('2026-01-15'))
    // Principal should be approximately constant
    expect(Math.abs(statsMonth6.currentMonthPrincipal - statsMonth12.currentMonthPrincipal)).toBeLessThan(200)
    // Interest should decrease
    expect(statsMonth12.currentMonthInterest).toBeLessThan(statsMonth6.currentMonthInterest)
  })

  it('Italian impact calculation works', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' }],
    })
    const impact = calculateMortgageImpact(config)
    expect(impact).not.toBeNull()
    expect(impact!.interestSaved).toBeGreaterThan(0)
  })

  it('0% rate schedule works', () => {
    const config = baseMortgage({
      annualRate: 0,
      monthlyPayment: calculateMonthlyPayment(15000000, 0, 360),
    })
    const s = generateAmortizationSchedule(config)
    // All interest should be 0
    for (const row of s) {
      expect(row.interestPortion).toBe(0)
    }
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('very large extra payment for Italian reduces interest dramatically', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      extraRepayments: [{ id: '1', date: '2025-02-01', amount: 14000000, recurring: false, mode: 'reduce_term' }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[s.length - 1].remainingBalance).toBe(0)
    // Italian term stays the same, but interest drops dramatically
    const withExtra = totalInterest(config)
    const without = totalInterest(baseMortgage({ amortizationType: 'italian' }))
    expect(withExtra).toBeLessThan(without * 0.1) // should save >90% interest
  })
})

// ─────────────────────────────────────────────
// 14. monthlyPaymentOverride behavior
// ─────────────────────────────────────────────

describe('monthlyPaymentOverride flag', () => {
  it('prevents recalculation after rate change', () => {
    const payment = calculateMonthlyPayment(15000000, 3.5, 360)
    const config = baseMortgage({
      monthlyPaymentOverride: true,
      monthlyPayment: payment,
      ratePeriods: [{ id: '1', startDate: '2027-01-01', annualRate: 5.0, rateType: 'variable' }],
    })
    const s = generateAmortizationSchedule(config)
    // Payment should stay the same before and after rate change
    const basePayment = s[0].principalPortion + s[0].interestPortion
    const afterChange = s[24].principalPortion + s[24].interestPortion
    // With override, payment doesn't recalculate — only P/I split changes
    expect(afterChange).toBe(basePayment)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('prevents recalculation after balance correction', () => {
    const payment = calculateMonthlyPayment(15000000, 3.5, 360)
    const config = baseMortgage({
      monthlyPaymentOverride: true,
      monthlyPayment: payment,
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 10000000, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    // Despite keepCurrentPayment=false, override takes precedence
    expect(s[10].payment).toBe(s[13].payment)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('prevents recalculation after reduce_payment extra', () => {
    const payment = calculateMonthlyPayment(15000000, 3.5, 360)
    const config = baseMortgage({
      monthlyPaymentOverride: true,
      monthlyPayment: payment,
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_payment' }],
    })
    const s = generateAmortizationSchedule(config)
    // Payment should NOT decrease — override blocks reduce_payment recalculation
    const before = s[10].principalPortion + s[10].interestPortion
    const after = s[13].principalPortion + s[13].interestPortion
    expect(after).toBe(before)
  })
})

// ─────────────────────────────────────────────
// 15. Rounding and precision
// ─────────────────────────────────────────────

describe('rounding and precision', () => {
  it('total principal paid equals loan within 1 cent over 30 years', () => {
    const s = generateAmortizationSchedule(baseMortgage())
    const totalPrincipal = s.reduce((sum, r) => sum + r.principalPortion + (r.extraPayment ?? 0), 0)
    expect(Math.abs(totalPrincipal - 15000000)).toBeLessThanOrEqual(1)
  })

  it('0% rate: total payments equal exactly the principal', () => {
    const config = baseMortgage({
      annualRate: 0,
      monthlyPayment: calculateMonthlyPayment(15000000, 0, 360),
    })
    const s = generateAmortizationSchedule(config)
    const totalPayments = s.reduce((sum, r) => sum + r.payment, 0)
    expect(totalPayments).toBe(15000000)
  })

  it('very small principal (€100) amortizes correctly', () => {
    const config = baseMortgage({
      principal: 10000, // €100
      monthlyPayment: calculateMonthlyPayment(10000, 3.5, 360),
    })
    const s = generateAmortizationSchedule(config)
    expect(s[s.length - 1].remainingBalance).toBe(0)
    expect(s.length).toBeLessThanOrEqual(361)
  })
})

// ─────────────────────────────────────────────
// 16. Italian amortization — deeper coverage
// ─────────────────────────────────────────────

describe('Italian amortization — advanced', () => {
  it('multiple rate changes: principal stays constant, interest jumps', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      ratePeriods: [
        { id: '1', startDate: '2026-01-01', annualRate: 5.0, rateType: 'variable' },
        { id: '2', startDate: '2027-01-01', annualRate: 2.0, rateType: 'variable' },
      ],
    })
    const s = generateAmortizationSchedule(config)
    // Principal portion stays approximately constant across rate changes
    expect(Math.abs(s[11].principalPortion - s[13].principalPortion)).toBeLessThan(500)
    expect(Math.abs(s[23].principalPortion - s[25].principalPortion)).toBeLessThan(500)
    // Interest jumps at rate change boundaries
    expect(s[12].interestPortion).toBeGreaterThan(s[11].interestPortion) // 3.5→5%
    expect(s[24].interestPortion).toBeLessThan(s[23].interestPortion)   // 5→2%
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('recurring reduce_term extra shortens loan', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      extraRepayments: [{ id: '1', date: '2025-01-01', amount: 20000, recurring: true, mode: 'reduce_term' }],
    })
    const base = generateAmortizationSchedule(baseMortgage({ amortizationType: 'italian' }))
    const s = generateAmortizationSchedule(config)
    expect(s.length).toBeLessThan(base.length)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('balance correction + rate change in same month', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      ratePeriods: [{ id: '1', startDate: '2026-01-01', annualRate: 5.0, rateType: 'variable' }],
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 14000000, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    expect(s[12].rateApplied).toBe(5.0)
    // Payments should still decrease (Italian behavior after correction)
    expect(s[13].payment).toBeGreaterThan(s[14].payment)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('0% rate: all payment is principal, zero interest', () => {
    const config = baseMortgage({
      amortizationType: 'italian',
      annualRate: 0,
      monthlyPayment: calculateMonthlyPayment(15000000, 0, 360),
    })
    const s = generateAmortizationSchedule(config)
    for (const row of s) {
      expect(row.interestPortion).toBe(0)
      expect(row.principalPortion).toBeGreaterThan(0)
    }
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 17. Variable mortgage — realistic scenarios
// ─────────────────────────────────────────────

describe('variable mortgage — realistic scenarios', () => {
  it('10 rate changes over 10 years (typical Euribor tracker)', () => {
    const config = baseMortgage({
      rateType: 'variable',
      ratePeriods: [
        { id: '1', startDate: '2026-01-01', annualRate: 3.8, rateType: 'variable' },
        { id: '2', startDate: '2027-01-01', annualRate: 4.2, rateType: 'variable' },
        { id: '3', startDate: '2028-01-01', annualRate: 4.5, rateType: 'variable' },
        { id: '4', startDate: '2029-01-01', annualRate: 4.0, rateType: 'variable' },
        { id: '5', startDate: '2030-01-01', annualRate: 3.2, rateType: 'variable' },
        { id: '6', startDate: '2031-01-01', annualRate: 2.8, rateType: 'variable' },
        { id: '7', startDate: '2032-01-01', annualRate: 2.5, rateType: 'variable' },
        { id: '8', startDate: '2033-01-01', annualRate: 3.0, rateType: 'variable' },
        { id: '9', startDate: '2034-01-01', annualRate: 3.5, rateType: 'variable' },
        { id: '10', startDate: '2035-01-01', annualRate: 3.2, rateType: 'variable' },
      ],
    })
    const s = generateAmortizationSchedule(config)
    // Schedule should be valid and pay off
    expect(s[s.length - 1].remainingBalance).toBe(0)
    // Verify each rate change is applied
    expect(s[12].rateApplied).toBe(3.8)
    expect(s[24].rateApplied).toBe(4.2)
    expect(s[120].rateApplied).toBe(3.2) // 2035 (index 120 = month 121)
    // All rows should have positive payments
    for (const row of s) {
      expect(row.payment).toBeGreaterThan(0)
    }
  })

  it('rate drops to near-zero then spikes', () => {
    const config = baseMortgage({
      rateType: 'variable',
      ratePeriods: [
        { id: '1', startDate: '2026-01-01', annualRate: 0.1, rateType: 'variable' },
        { id: '2', startDate: '2028-01-01', annualRate: 8.0, rateType: 'variable' },
      ],
    })
    const s = generateAmortizationSchedule(config)
    // During low rate period, almost all payment is principal
    expect(s[12].interestPortion).toBeLessThan(2000) // tiny interest at 0.1%
    // After spike, interest jumps dramatically
    expect(s[36].interestPortion).toBeGreaterThan(s[12].interestPortion * 10)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 18. Mixed mortgage — additional edge cases
// ─────────────────────────────────────────────

describe('mixed mortgage — edge cases', () => {
  function mixedMortgage(overrides: Partial<MortgageConfig> = {}): MortgageConfig {
    return {
      principal: 25000000,
      annualRate: 2.5,
      rateType: 'mixed',
      termYears: 30,
      startDate: '2020-01-01',
      monthlyPayment: calculateMonthlyPayment(25000000, 2.5, 360),
      monthlyPaymentOverride: false,
      mixedRate: {
        fixedRate: 2.5,
        fixedPeriodYears: 10,
        referenceRateId: 'euribor_12m',
        currentReferenceRate: 2.6,
        spread: 0.9,
        reviewFrequencyMonths: 12,
      },
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
      ...overrides,
    }
  }

  it('mixed + Italian + extras across switch: Italian persists', () => {
    const config = mixedMortgage({
      amortizationType: 'italian',
      ratePeriods: [{ id: '1', startDate: '2030-01-01', annualRate: 3.5, rateType: 'variable' }],
      extraRepayments: [{ id: '1', date: '2029-06-01', amount: 50000, recurring: true, mode: 'reduce_term' }],
    })
    const s = generateAmortizationSchedule(config)
    // Italian behavior: payments decrease before switch
    expect(s[0].payment).toBeGreaterThan(s[60].payment)
    // After switch, payments still decrease (Italian)
    expect(s[121].payment).toBeGreaterThan(s[122].payment)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('fixedPeriodYears = termYears: never switches, behaves as pure fixed', () => {
    const config = mixedMortgage({
      mixedRate: {
        fixedRate: 2.5,
        fixedPeriodYears: 30, // same as termYears
        referenceRateId: 'euribor_12m',
        currentReferenceRate: 2.6,
        spread: 0.9,
        reviewFrequencyMonths: 12,
      },
    })
    const s = generateAmortizationSchedule(config)
    // All months should use the fixed rate
    for (const row of s) {
      expect(row.rateApplied).toBe(2.5)
    }
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('isMixedInFixedPeriod on exact switch date boundary', () => {
    const config = mixedMortgage()
    const switchDate = new Date('2030-01-01')
    // On the exact switch date, should be PAST the fixed period
    expect(isMixedInFixedPeriod(config, switchDate)).toBe(false)
    // Day before should still be in fixed period
    expect(isMixedInFixedPeriod(config, new Date('2029-12-31'))).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 19. reduce_payment mode — deeper
// ─────────────────────────────────────────────

describe('reduce_payment — advanced', () => {
  it('recurring reduce_payment: payment drops each month extra applies', () => {
    const config = baseMortgage({
      extraRepayments: [{ id: '1', date: '2025-06-01', amount: 50000, recurring: true, mode: 'reduce_payment' }],
    })
    const s = generateAmortizationSchedule(config)
    // Payment should decrease as recurring extras reduce principal each month
    // Compare month 6 (first extra) to month 12 and month 24
    const paymentMonth6 = s[5].payment  // Jun 2025
    const paymentMonth12 = s[11].payment
    const paymentMonth24 = s[23].payment
    expect(paymentMonth12).toBeLessThan(paymentMonth6)
    expect(paymentMonth24).toBeLessThan(paymentMonth12)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('reduce_payment + rate increase in same month', () => {
    const config = baseMortgage({
      ratePeriods: [{ id: '1', startDate: '2026-01-01', annualRate: 5.0, rateType: 'variable' }],
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_payment' }],
    })
    const s = generateAmortizationSchedule(config)
    // Both rate change and extra should apply
    expect(s[12].rateApplied).toBe(5.0)
    expect(s[12].extraPayment).toBe(1000000)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('multiple extras same month: reduce_term + reduce_payment both applied', () => {
    const config = baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_term' },
        { id: '2', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' },
      ],
    })
    const s = generateAmortizationSchedule(config)
    // Both extras should be summed
    expect(s[12].extraPayment).toBe(1000000)
    // reduce_payment present → payment should be recalculated
    const before = s[10].payment
    const after = s[13].payment
    expect(after).toBeLessThan(before)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 20. Stats and Impact — edge cases
// ─────────────────────────────────────────────

describe('stats and impact — edge cases', () => {
  it('stats before mortgage starts: 0 elapsed, full balance', () => {
    const stats = getMortgageStats(baseMortgage(), new Date('2024-06-01'))
    expect(stats.monthsElapsed).toBe(0)
    expect(stats.remainingBalance).toBe(15000000)
    expect(stats.principalPaidSoFar).toBe(0)
    expect(stats.progressPercent).toBe(0)
  })

  it('stats after payoff: all paid, 0 remaining', () => {
    const stats = getMortgageStats(baseMortgage(), new Date('2060-01-01'))
    expect(stats.monthsElapsed).toBe(stats.totalMonths)
    expect(stats.monthsRemaining).toBe(0)
    expect(stats.remainingBalance).toBe(0)
    expect(stats.progressPercent).toBeCloseTo(100, 0)
  })

  it('impact with reduce_payment: months saved ≈ 0, interest saved > 0', () => {
    const impact = calculateMortgageImpact(baseMortgage({
      extraRepayments: [{ id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_payment' }],
    }))!
    expect(impact).not.toBeNull()
    // reduce_payment keeps ~same term but saves interest
    expect(impact.monthsSaved).toBeLessThanOrEqual(5)
    expect(impact.interestSaved).toBeGreaterThan(0)
  })

  it('impact with Italian + recurring extra', () => {
    const impact = calculateMortgageImpact(baseMortgage({
      amortizationType: 'italian',
      extraRepayments: [{ id: '1', date: '2025-06-01', amount: 20000, recurring: true, mode: 'reduce_term' }],
    }))!
    expect(impact).not.toBeNull()
    expect(impact.monthsSaved).toBeGreaterThan(0)
    expect(impact.interestSaved).toBeGreaterThan(0)
    expect(impact.newTotalInterest).toBeLessThan(impact.originalTotalInterest)
  })

  it('impact with mixed modes on different dates: both reduce_term and reduce_payment effects preserved', () => {
    const impact = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_term' },
        { id: '2', date: '2026-06-01', amount: 500000, recurring: false, mode: 'reduce_payment' },
      ],
    }))!
    expect(impact).not.toBeNull()
    // reduce_term shortens the effective term; reduce_payment lowers payment
    // for the shortened term — both effects are preserved
    expect(impact.monthsSaved).toBeGreaterThan(0)
    expect(impact.interestSaved).toBeGreaterThan(0)
    expect(impact.newTotalInterest).toBeLessThan(impact.originalTotalInterest)
  })

  it('impact with only reduce_payment recurring: monthsSaved ≈ 0 but interestSaved > 0', () => {
    const impact = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2025-06-01', amount: 10000, recurring: true, mode: 'reduce_payment' },
      ],
    }))!
    expect(impact).not.toBeNull()
    expect(impact.interestSaved).toBeGreaterThan(0)
    // With recurring reduce_payment, months saved should be minimal or zero
    expect(impact.monthsSaved).toBeLessThanOrEqual(1)
  })

  it('exact user scenario: one-time reduce_term then recurring reduce_payment', () => {
    const impact = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' },
        { id: '2', date: '2026-06-01', amount: 20000, recurring: true, mode: 'reduce_payment' },
      ],
    }))!
    expect(impact).not.toBeNull()
    // The recurring reduce_payment keeps recalculating to maintain original term,
    // so monthsSaved may be small despite the reduce_term lump sum
    expect(impact.monthsSaved).toBeGreaterThanOrEqual(0)
    // Both extras reduce principal early → always saves interest
    expect(impact.interestSaved).toBeGreaterThan(0)
    // Sanity: reduce_term alone would save more interest than the combo
    // because reduce_payment stretches the term back out
    const termOnlyImpact = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' },
      ],
    }))!
    expect(impact.interestSaved).toBeGreaterThan(termOnlyImpact.interestSaved)
  })

  it('reduce_payment extra on the very first month of the mortgage', () => {
    const impact = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2025-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' },
      ],
    }))!
    expect(impact).not.toBeNull()
    expect(impact.interestSaved).toBeGreaterThan(0)
    // First-month reduce_payment: recalculates using remainingMonths = termMonths - 0 - 1 = 359
    // monthsSaved should be 0 or 1 at most (rounding)
    expect(impact.monthsSaved).toBeLessThanOrEqual(1)
    expect(impact.monthsSaved).toBeGreaterThanOrEqual(0)
  })

  it('reduce_term saves MORE months alone than when combined with reduce_payment', () => {
    const termOnly = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 1000000, recurring: false, mode: 'reduce_term' },
      ],
    }))!
    const mixed = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_term' },
        { id: '2', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' },
      ],
    }))!
    // Same total extra amount but split between modes:
    // reduce_term-only saves the most months (all money goes to shortening)
    expect(termOnly.monthsSaved).toBeGreaterThan(mixed.monthsSaved)
    // Mixed should still save months (reduce_term portion preserved)
    expect(mixed.monthsSaved).toBeGreaterThan(0)
    // Mixed should still save interest
    expect(mixed.interestSaved).toBeGreaterThan(0)
  })

  it('reduce_payment after reduce_term: term stays shortened, payment lowered', () => {
    // reduce_term first, reduce_payment 6 months later
    const s = generateAmortizationSchedule(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_term' },
        { id: '2', date: '2026-07-01', amount: 500000, recurring: false, mode: 'reduce_payment' },
      ],
    }))
    // Payment should stay the same through reduce_term month (month 12)
    expect(s[13].payment).toBe(s[11].payment)
    // Payment should drop after reduce_payment month (month 18)
    expect(s[19].payment).toBeLessThan(s[17].payment)
    // Loan should end earlier than the original 360 months
    expect(s.length).toBeLessThan(360)
    // Loan fully amortizes
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('reduce_payment before reduce_term: both effects still apply', () => {
    // reduce_payment first, reduce_term 6 months later
    const s = generateAmortizationSchedule(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' },
        { id: '2', date: '2026-07-01', amount: 500000, recurring: false, mode: 'reduce_term' },
      ],
    }))
    // Payment should drop after reduce_payment month
    const paymentAfterReducePayment = s[13].payment
    expect(paymentAfterReducePayment).toBeLessThan(s[11].payment)
    // Payment should stay the same after reduce_term month (reduce_term doesn't change payment)
    expect(s[19].payment).toBe(paymentAfterReducePayment)
    // Loan should still end earlier than original (reduce_term shortens)
    expect(s.length).toBeLessThan(360)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('both recurring reduce_term + reduce_payment: loan fully amortizes', () => {
    const s = generateAmortizationSchedule(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2025-06-01', amount: 10000, recurring: true, mode: 'reduce_term' },
        { id: '2', date: '2025-06-01', amount: 10000, recurring: true, mode: 'reduce_payment' },
      ],
    }))
    // Loan must fully amortize
    expect(s[s.length - 1].remainingBalance).toBe(0)
    // Should end earlier than original term (reduce_term effect)
    expect(s.length).toBeLessThan(360)
    // All payments should be positive
    expect(s.every(r => r.payment > 0)).toBe(true)
    // Interest portions should never be negative
    expect(s.every(r => r.interestPortion >= 0)).toBe(true)
  })

  it('large reduce_term + small recurring reduce_payment: term savings preserved', () => {
    // Simulates the user's exact complaint: big lump sum reduce_term,
    // then small monthly reduce_payment — term should still be shortened
    const impact = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 3000000, recurring: false, mode: 'reduce_term' },
        { id: '2', date: '2026-06-01', amount: 10000, recurring: true, mode: 'reduce_payment' },
      ],
    }))!
    // €30,000 reduce_term on €150,000 mortgage = 20% of principal → significant months saved
    expect(impact.monthsSaved).toBeGreaterThan(30)
    expect(impact.interestSaved).toBeGreaterThan(0)
    // Compare: reduce_term alone should save even more months
    const termOnly = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 3000000, recurring: false, mode: 'reduce_term' },
      ],
    }))!
    expect(termOnly.monthsSaved).toBeGreaterThanOrEqual(impact.monthsSaved)
  })

  it('pure reduce_payment should not shorten term (no effectiveTermEnd drift)', () => {
    // Verifies the new effectiveTermEnd tracking doesn't accidentally
    // shorten the term for pure reduce_payment scenarios
    const oneTime = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' },
      ],
    }))!
    const recurring = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2025-06-01', amount: 10000, recurring: true, mode: 'reduce_payment' },
      ],
    }))!
    // Neither should save more than 1 month (rounding only)
    expect(oneTime.monthsSaved).toBeLessThanOrEqual(1)
    expect(recurring.monthsSaved).toBeLessThanOrEqual(1)
    // Both should save interest
    expect(oneTime.interestSaved).toBeGreaterThan(0)
    expect(recurring.interestSaved).toBeGreaterThan(0)
  })

  it('same-month mixed modes: impact correctly reflects both effects', () => {
    const impact = calculateMortgageImpact(baseMortgage({
      extraRepayments: [
        { id: '1', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_term' },
        { id: '2', date: '2026-01-01', amount: 500000, recurring: false, mode: 'reduce_payment' },
      ],
    }))!
    expect(impact).not.toBeNull()
    // Both months and interest should be saved
    expect(impact.monthsSaved).toBeGreaterThan(0)
    expect(impact.interestSaved).toBeGreaterThan(0)
    expect(impact.newPayoffDate < impact.originalPayoffDate).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 21. Balance correction — edge cases
// ─────────────────────────────────────────────

describe('balance correction — edge cases', () => {
  it('correction with balance = 0: loan paid off immediately', () => {
    const config = baseMortgage({
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 0, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    // Should end at or before the correction month
    expect(s.length).toBeLessThanOrEqual(13) // 12 months + correction month
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })

  it('correction resetting balance to original principal', () => {
    const config = baseMortgage({
      balanceCorrections: [{ id: '1', date: '2026-01-01', balance: 15000000, keepCurrentPayment: false }],
    })
    const s = generateAmortizationSchedule(config)
    // Balance reset to original but payment recalculated for remaining 348 months
    // → higher payment than original, schedule still ~360 months
    expect(s.length).toBeGreaterThanOrEqual(359)
    expect(s.length).toBeLessThanOrEqual(361)
    // The payment after correction should be higher (same principal, fewer months)
    expect(s[13].payment).toBeGreaterThan(s[10].payment)
    expect(s[s.length - 1].remainingBalance).toBe(0)
  })
})
