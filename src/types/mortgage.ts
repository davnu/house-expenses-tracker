export type RateType = 'fixed' | 'variable' | 'mixed'
export type AmortizationType = 'french' | 'italian'

export interface MixedRateConfig {
  fixedRate: number // the rate during the fixed period (e.g. 2.5)
  fixedPeriodYears: number // how long the fixed period lasts (e.g. 10)
  referenceRateId: string // e.g. 'euribor_12m' — for the variable period
  currentReferenceRate: number // latest known value
  spread: number // bank's margin above reference rate (set at signing)
  reviewFrequencyMonths: number // 6, 12, or 0
  rateFloor?: number
  lifetimeCap?: number
}

export interface RatePeriod {
  id: string
  startDate: string // YYYY-MM-DD (first of month)
  annualRate: number // e.g. 3.5 (effective rate = referenceRate + spread)
  rateType: RateType
  referenceRate?: number // e.g. 3.2 (the Euribor/SOFR/BoE value)
  spread?: number // e.g. 0.9 (the bank's margin)
}

export type VariableRateSubtype = 'tracker' | 'svr' | 'discount' | 'arm'

export interface VariableRateConfig {
  subtype: VariableRateSubtype
  referenceRateId: string // e.g. 'euribor_12m', 'boe_base_rate', 'sofr', 'prime_rate'
  currentReferenceRate: number // e.g. 3.2
  spread: number // e.g. 0.9 (can be negative for CA discounts)
  reviewFrequencyMonths: number // 6, 12, or 0 (immediate)
  // USA ARM
  fixedIntroPeriodYears?: number
  adjustmentFrequencyYears?: number
  initialAdjustmentCap?: number
  periodicAdjustmentCap?: number
  lifetimeCap?: number
  // Floors
  rateFloor?: number
}

export type RepaymentMode = 'reduce_term' | 'reduce_payment'

export interface ExtraRepayment {
  id: string
  date: string // YYYY-MM-DD
  amount: number // cents
  recurring: boolean
  endDate?: string // optional end for recurring
  mode: RepaymentMode // reduce term (pay off sooner) or reduce payment (lower monthly)
}

export interface BalanceCorrection {
  id: string
  date: string // YYYY-MM-DD
  balance: number // cents — actual remaining balance from bank statement
  keepCurrentPayment: boolean // false = recalculate payment, true = keep same payment
}

export interface MortgageConfig {
  principal: number // cents
  annualRate: number // initial rate, e.g. 3.5 for 3.5%
  rateType: RateType // initial rate type
  termYears: number
  startDate: string // YYYY-MM-DD
  monthlyPayment: number // cents
  monthlyPaymentOverride: boolean
  amortizationType?: AmortizationType // defaults to 'french' if not set
  propertyValue?: number // cents, optional — used for LTV and equity
  balanceCorrections?: BalanceCorrection[] // actual balances from bank statements
  variableRate?: VariableRateConfig // present when rateType is 'variable'
  mixedRate?: MixedRateConfig // present when rateType is 'mixed'
  ratePeriods?: RatePeriod[] // subsequent rate changes
  extraRepayments?: ExtraRepayment[] // extra payments
  createdAt: string
  updatedAt: string
}

export interface AmortizationRow {
  month: number
  date: string // YYYY-MM
  payment: number // cents (base + extra)
  principalPortion: number // cents
  interestPortion: number // cents
  remainingBalance: number // cents
  extraPayment?: number // extra applied this month
  rateApplied: number // annual rate used this month
  isRateChange?: boolean // rate changed this month
}

export interface MortgageStats {
  totalPayments: number // cents
  totalInterest: number // cents
  monthsElapsed: number
  monthsRemaining: number
  totalMonths: number
  remainingBalance: number // cents
  principalPaidSoFar: number // cents
  interestPaidSoFar: number // cents
  currentMonthPrincipal: number // cents
  currentMonthInterest: number // cents
  payoffDate: string // YYYY-MM
  progressPercent: number // 0-100
}

export interface MortgageImpact {
  originalPayoffDate: string
  newPayoffDate: string
  monthsSaved: number
  interestSaved: number // cents
  originalTotalInterest: number // cents
  newTotalInterest: number // cents
}
