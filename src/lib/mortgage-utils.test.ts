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
// 11. Mixed mortgage
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
      // First month should already be variable rate
      expect(s[0].rateApplied).toBe(3.5)
    })
  })
})
