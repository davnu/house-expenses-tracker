import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import type { MortgageConfig, RatePeriod } from '@/types/mortgage'
import { FirestoreRepository } from '@/data/firestore-repository'
import { generateHistoricalRatePeriods } from '@/data/reference-rates'
import { getMixedSwitchDate } from '@/lib/mortgage-utils'
import { computeEffectiveRate } from '@/lib/mortgage-country'
import { db } from '@/data/firebase'
import { useHousehold } from './HouseholdContext'

interface MortgageContextValue {
  mortgage: MortgageConfig | null
  loading: boolean
  saveMortgage: (config: MortgageConfig) => Promise<void>
  deleteMortgage: () => Promise<void>
}

const MortgageContext = createContext<MortgageContextValue | null>(null)

/**
 * Check if a variable mortgage needs auto-populated rate periods.
 * Returns the populated config if so, null if not needed.
 */
async function autoPopulateRatePeriods(config: MortgageConfig): Promise<MortgageConfig | null> {
  if ((config.ratePeriods?.length ?? 0) > 0) return null

  // Pure variable mortgage
  if (config.rateType === 'variable' && config.variableRate) {
    if (new Date(config.startDate) >= new Date()) return null
    try {
      const vr = config.variableRate
      const historical = await generateHistoricalRatePeriods(
        vr.referenceRateId, vr.spread, config.startDate, vr.reviewFrequencyMonths
      )
      if (historical.length <= 1) return null
      const ratePeriods: RatePeriod[] = historical.slice(1).map((h) => ({
        id: crypto.randomUUID(), startDate: h.date, annualRate: h.effectiveRate,
        rateType: 'variable' as const, referenceRate: h.referenceRate, spread: vr.spread,
      }))
      return { ...config, ratePeriods }
    } catch (err) {
      console.warn('Failed to auto-populate rate periods:', err)
      return null
    }
  }

  // Mixed mortgage
  if (config.rateType === 'mixed' && config.mixedRate) {
    const mr = config.mixedRate
    const switchDate = getMixedSwitchDate(config.startDate, mr.fixedPeriodYears)
    const now = new Date()

    try {
      if (now < new Date(switchDate)) {
        // Still in fixed period — add a projected rate period at switch date
        const projectedRate = computeEffectiveRate(mr.currentReferenceRate, mr.spread, { rateFloor: mr.rateFloor })
        return {
          ...config,
          ratePeriods: [{
            id: crypto.randomUUID(), startDate: switchDate, annualRate: projectedRate,
            rateType: 'variable' as const, referenceRate: mr.currentReferenceRate, spread: mr.spread,
          }],
        }
      } else {
        // Past switch — populate from historical data starting at switch date
        const historical = await generateHistoricalRatePeriods(
          mr.referenceRateId, mr.spread, switchDate, mr.reviewFrequencyMonths
        )
        if (historical.length === 0) return null
        // Include all entries (including first — it's the switch-date rate)
        const ratePeriods: RatePeriod[] = historical.map((h) => ({
          id: crypto.randomUUID(), startDate: h.date, annualRate: h.effectiveRate,
          rateType: 'variable' as const, referenceRate: h.referenceRate, spread: mr.spread,
        }))
        return { ...config, ratePeriods }
      }
    } catch (err) {
      console.warn('Failed to auto-populate mixed rate periods:', err)
      return null
    }
  }

  return null
}

export function MortgageProvider({ children }: { children: ReactNode }) {
  const { house } = useHousehold()
  const [mortgage, setMortgage] = useState<MortgageConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const houseId = house?.id

  // Ref for latest mortgage to avoid stale closures in optimistic callbacks
  const mortgageRef = useRef(mortgage)
  mortgageRef.current = mortgage

  useEffect(() => {
    if (!houseId) {
      setMortgage(null)
      setLoading(false)
      return
    }
    const repo = new FirestoreRepository(db, houseId)
    repo.getMortgage()
      .then(async (m) => {
        if (!m) {
          setMortgage(null)
          return
        }

        // Auto-populate rate periods if needed
        const populated = await autoPopulateRatePeriods(m)
        if (populated) {
          await repo.saveMortgage(populated)
          setMortgage(populated)
        } else {
          setMortgage(m)
        }
      })
      .catch(() => setMortgage(null))
      .finally(() => setLoading(false))
  }, [houseId])

  const save = useCallback(async (config: MortgageConfig) => {
    if (!houseId) return
    const previous = mortgageRef.current

    // Optimistic: show the user's config immediately
    setMortgage(config)

    try {
      const repo = new FirestoreRepository(db, houseId)
      const populated = await autoPopulateRatePeriods(config)
      const toSave = populated ?? config
      const saved = await repo.saveMortgage(toSave)
      setMortgage(saved)
    } catch (err) {
      setMortgage(previous)
      throw err
    }
  }, [houseId])

  const remove = useCallback(async () => {
    if (!houseId) return
    const previous = mortgageRef.current

    // Optimistic: clear immediately
    setMortgage(null)

    try {
      const repo = new FirestoreRepository(db, houseId)
      await repo.deleteMortgage()
    } catch (err) {
      setMortgage(previous)
      throw err
    }
  }, [houseId])

  return (
    <MortgageContext.Provider value={{ mortgage, loading, saveMortgage: save, deleteMortgage: remove }}>
      {children}
    </MortgageContext.Provider>
  )
}

export function useMortgage() {
  const ctx = useContext(MortgageContext)
  if (!ctx) throw new Error('useMortgage must be used within MortgageProvider')
  return ctx
}
