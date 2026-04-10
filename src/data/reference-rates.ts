import { doc, getDoc } from 'firebase/firestore'
import { addMonths, format } from 'date-fns'
import { db } from './firebase'

export interface RateValue {
  month: string // YYYY-MM
  value: number
}

export interface RateDocument {
  values: Record<string, number> // { "2024-01": 3.609, "2024-02": 3.671, ... }
  source: string
  lastUpdated: string
  entryCount: number
  latestValue: number | null
  latestMonth: string | null
}

/**
 * Get the full reference rate document (1 Firestore read for all history)
 */
export async function getReferenceRateDoc(rateId: string): Promise<RateDocument | null> {
  const ref = doc(db, 'reference_rates', rateId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return snap.data() as RateDocument
}

/**
 * Get historical reference rate values, optionally filtered by date range
 */
export async function getReferenceRateHistory(
  rateId: string,
  fromMonth?: string,
  toMonth?: string
): Promise<RateValue[]> {
  const rateDoc = await getReferenceRateDoc(rateId)
  if (!rateDoc) return []

  return Object.entries(rateDoc.values)
    .filter(([month]) => {
      if (fromMonth && month < fromMonth) return false
      if (toMonth && month > toMonth) return false
      return true
    })
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Get the reference rate value for a specific month
 */
export async function getReferenceRateForMonth(
  rateId: string,
  month: string
): Promise<number | null> {
  const rateDoc = await getReferenceRateDoc(rateId)
  if (!rateDoc) return null
  return rateDoc.values[month] ?? null
}

/**
 * Generate rate periods from historical reference rate data.
 * Used when setting up a variable mortgage with a past start date.
 */
export async function generateHistoricalRatePeriods(
  rateId: string,
  spread: number,
  startDate: string,
  reviewFrequencyMonths: number
): Promise<Array<{ date: string; referenceRate: number; effectiveRate: number }>> {
  const startMonth = startDate.substring(0, 7)
  const now = new Date()
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const history = await getReferenceRateHistory(rateId, startMonth, endMonth)
  if (history.length === 0) return []

  const periods: Array<{ date: string; referenceRate: number; effectiveRate: number }> = []
  const startDateObj = new Date(startDate)

  if (reviewFrequencyMonths === 0) {
    // Immediate: every time rate changes, create a period
    let prevValue: number | null = null
    for (const entry of history) {
      if (entry.value !== prevValue) {
        periods.push({
          date: `${entry.month}-01`,
          referenceRate: entry.value,
          effectiveRate: Math.round((entry.value + spread) * 100) / 100,
        })
        prevValue = entry.value
      }
    }
  } else {
    // Periodic reviews: pick rate at each review date
    // Use addMonths from date-fns to avoid JavaScript Date month drift
    let reviewIdx = 0
    while (true) {
      const reviewDate = addMonths(startDateObj, reviewIdx * reviewFrequencyMonths)
      if (reviewDate > now) break
      const reviewMonth = format(reviewDate, 'yyyy-MM')

      // Find the closest available rate for this month (exact match or latest before)
      const entry = history.find((h) => h.month === reviewMonth)
        ?? history.filter((h) => h.month <= reviewMonth).pop()

      if (entry) {
        periods.push({
          date: `${reviewMonth}-01`,
          referenceRate: entry.value,
          effectiveRate: Math.round((entry.value + spread) * 100) / 100,
        })
      }

      reviewIdx++
    }
  }

  return periods
}
