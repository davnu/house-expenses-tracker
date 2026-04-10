import { describe, it, expect } from 'vitest'
import {
  getCountryConfig,
  getRegion,
  getReferenceRatesForCountry,
  computeEffectiveRate,
  getNextReviewDate,
  SUPPORTED_COUNTRIES,
  REFERENCE_RATES,
} from './mortgage-country'

describe('getCountryConfig', () => {
  it('returns config for valid country', () => {
    const spain = getCountryConfig('ES')
    expect(spain).toBeDefined()
    expect(spain!.name).toBe('Spain')
    expect(spain!.currency).toBe('EUR')
    expect(spain!.region).toBe('europe')
  })

  it('returns undefined for invalid country', () => {
    expect(getCountryConfig('XX')).toBeUndefined()
  })

  it('returns correct config for UK', () => {
    const uk = getCountryConfig('GB')
    expect(uk!.currency).toBe('GBP')
    expect(uk!.region).toBe('uk')
  })

  it('returns correct config for US', () => {
    const us = getCountryConfig('US')
    expect(us!.currency).toBe('USD')
    expect(us!.region).toBe('usa')
  })

  it('returns correct config for Canada', () => {
    const ca = getCountryConfig('CA')
    expect(ca!.currency).toBe('CAD')
    expect(ca!.region).toBe('canada')
  })
})

describe('getRegion', () => {
  it('returns europe for Spain', () => {
    expect(getRegion('ES')).toBe('europe')
  })

  it('returns uk for GB', () => {
    expect(getRegion('GB')).toBe('uk')
  })

  it('returns undefined for invalid code', () => {
    expect(getRegion('ZZ')).toBeUndefined()
  })
})

describe('getReferenceRatesForCountry', () => {
  it('returns Euribor rates for European countries', () => {
    const rates = getReferenceRatesForCountry('ES')
    expect(rates.length).toBe(2)
    expect(rates.map((r) => r.id)).toContain('euribor_12m')
    expect(rates.map((r) => r.id)).toContain('euribor_6m')
  })

  it('returns BoE rates for UK', () => {
    const rates = getReferenceRatesForCountry('GB')
    expect(rates.map((r) => r.id)).toContain('boe_base_rate')
  })

  it('returns SOFR for US', () => {
    const rates = getReferenceRatesForCountry('US')
    expect(rates.map((r) => r.id)).toContain('sofr')
  })

  it('returns empty for invalid country', () => {
    expect(getReferenceRatesForCountry('XX')).toEqual([])
  })
})

describe('computeEffectiveRate', () => {
  it('computes reference + spread', () => {
    expect(computeEffectiveRate(3.2, 0.9)).toBe(4.1)
  })

  it('handles negative spread (discount)', () => {
    expect(computeEffectiveRate(5.0, -0.5)).toBe(4.5)
  })

  it('applies rate floor', () => {
    // Reference 0.5% + spread 0.9% = 1.4%, but floor is 2%
    expect(computeEffectiveRate(0.5, 0.9, { rateFloor: 2.0 })).toBe(2.0)
  })

  it('floor does not apply when rate is above it', () => {
    expect(computeEffectiveRate(3.0, 0.9, { rateFloor: 2.0 })).toBe(3.9)
  })

  it('applies lifetime cap', () => {
    // Initial rate 3%, lifetime cap 5%, current ref+spread = 9% → capped at 3+5=8%
    expect(computeEffectiveRate(8.0, 1.0, {
      lifetimeCap: 5.0,
      initialRate: 3.0,
    })).toBe(8.0) // 8+1=9, capped at 3+5=8
  })

  it('applies periodic cap', () => {
    // Previous rate 4%, periodic cap 2%, new rate would be 7% → capped at 4+2=6%
    expect(computeEffectiveRate(6.0, 1.0, {
      previousRate: 4.0,
      periodicAdjustmentCap: 2.0,
    })).toBe(6.0) // 6+1=7, capped at 4+2=6
  })

  it('rounds to 2 decimal places', () => {
    expect(computeEffectiveRate(3.333, 0.666)).toBe(4.0) // 3.999 rounds to 4.0
  })
})

describe('getNextReviewDate', () => {
  it('returns null for immediate review frequency', () => {
    expect(getNextReviewDate('2025-01-01', 0)).toBeNull()
  })

  it('calculates next review 6 months from start', () => {
    // Start Jan 2020, 6-month reviews, current date is April 2026
    const next = getNextReviewDate('2020-01-01', 6)
    expect(next).toBeDefined()
    // Should be a future date
    expect(new Date(next!).getTime()).toBeGreaterThan(Date.now())
  })

  it('calculates next review 12 months from start', () => {
    const next = getNextReviewDate('2020-01-01', 12)
    expect(next).toBeDefined()
    expect(new Date(next!).getTime()).toBeGreaterThan(Date.now())
  })

  it('review date is on anniversary month', () => {
    // Start Feb 2024, 6-month frequency → reviews: Aug 2024, Feb 2025, Aug 2025, Feb 2026, Aug 2026
    const next = getNextReviewDate('2024-02-01', 6)
    expect(next).toBeDefined()
    const month = new Date(next!).getMonth() + 1 // 1-indexed
    // Should be either Feb (2) or Aug (8)
    expect([2, 8]).toContain(month)
  })
})

describe('SUPPORTED_COUNTRIES', () => {
  it('has all expected countries', () => {
    const codes = SUPPORTED_COUNTRIES.map((c) => c.code)
    expect(codes).toContain('ES')
    expect(codes).toContain('FR')
    expect(codes).toContain('GB')
    expect(codes).toContain('US')
    expect(codes).toContain('CA')
  })

  it('all countries have valid reference rates', () => {
    for (const country of SUPPORTED_COUNTRIES) {
      for (const rateId of country.referenceRates) {
        expect(REFERENCE_RATES[rateId]).toBeDefined()
      }
    }
  })
})
