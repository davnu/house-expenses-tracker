import { addMonths, format } from 'date-fns'

export type Region = 'europe' | 'uk' | 'usa' | 'canada'

export interface CountryConfig {
  code: string
  name: string
  region: Region
  currency: string
  referenceRates: string[]
}

export interface ReferenceRateConfig {
  id: string
  label: string
  defaultReviewMonths: number // 0 = changes immediately
}

export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  // Europe
  { code: 'ES', name: 'Spain', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'FR', name: 'France', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'PT', name: 'Portugal', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'IT', name: 'Italy', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'DE', name: 'Germany', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'NL', name: 'Netherlands', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'BE', name: 'Belgium', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'IE', name: 'Ireland', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'AT', name: 'Austria', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'FI', name: 'Finland', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  { code: 'GR', name: 'Greece', region: 'europe', currency: 'EUR', referenceRates: ['euribor_12m', 'euribor_6m'] },
  // UK
  { code: 'GB', name: 'United Kingdom', region: 'uk', currency: 'GBP', referenceRates: ['boe_base_rate', 'svr'] },
  // USA
  { code: 'US', name: 'United States', region: 'usa', currency: 'USD', referenceRates: ['sofr', 'treasury_1y'] },
  // Canada
  { code: 'CA', name: 'Canada', region: 'canada', currency: 'CAD', referenceRates: ['prime_rate'] },
]

export const REFERENCE_RATES: Record<string, ReferenceRateConfig> = {
  euribor_12m: { id: 'euribor_12m', label: 'Euribor 12M', defaultReviewMonths: 12 },
  euribor_6m: { id: 'euribor_6m', label: 'Euribor 6M', defaultReviewMonths: 6 },
  boe_base_rate: { id: 'boe_base_rate', label: 'BoE Base Rate', defaultReviewMonths: 0 },
  svr: { id: 'svr', label: 'SVR (Bank Set)', defaultReviewMonths: 0 },
  sofr: { id: 'sofr', label: 'SOFR', defaultReviewMonths: 12 },
  treasury_1y: { id: 'treasury_1y', label: '1-Year Treasury', defaultReviewMonths: 12 },
  prime_rate: { id: 'prime_rate', label: 'Prime Rate', defaultReviewMonths: 0 },
}

export function getCountryConfig(code: string): CountryConfig | undefined {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code)
}

export function getRegion(countryCode: string): Region | undefined {
  return getCountryConfig(countryCode)?.region
}

export function getReferenceRatesForCountry(countryCode: string): ReferenceRateConfig[] {
  const country = getCountryConfig(countryCode)
  if (!country) return []
  return country.referenceRates.map((id) => REFERENCE_RATES[id]).filter(Boolean)
}

export function computeEffectiveRate(
  referenceRate: number,
  spread: number,
  options?: {
    rateFloor?: number
    lifetimeCap?: number
    initialRate?: number
    previousRate?: number
    isFirstAdjustment?: boolean
    initialAdjustmentCap?: number
    periodicAdjustmentCap?: number
  }
): number {
  let rate = referenceRate + spread

  // Apply floor
  if (options?.rateFloor !== undefined) {
    rate = Math.max(rate, options.rateFloor)
  }

  // Apply ARM caps
  if (options?.previousRate !== undefined) {
    const cap = options.isFirstAdjustment
      ? (options.initialAdjustmentCap ?? Infinity)
      : (options.periodicAdjustmentCap ?? Infinity)
    rate = Math.min(rate, options.previousRate + cap)
    rate = Math.max(rate, options.previousRate - cap)
  }

  if (options?.lifetimeCap !== undefined && options?.initialRate !== undefined) {
    rate = Math.min(rate, options.initialRate + options.lifetimeCap)
  }

  return Math.round(rate * 100) / 100
}

export function getNextReviewDate(
  startDate: string,
  reviewFrequencyMonths: number
): string | null {
  if (reviewFrequencyMonths === 0) return null

  const start = new Date(startDate)
  const now = new Date()

  let idx = 1 // start from first review, not the start date itself
  let nextReview: Date = addMonths(start, reviewFrequencyMonths)
  while (nextReview <= now) {
    idx++
    nextReview = addMonths(start, idx * reviewFrequencyMonths)
  }

  return format(nextReview, 'yyyy-MM-dd')
}
