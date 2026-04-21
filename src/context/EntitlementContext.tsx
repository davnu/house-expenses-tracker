import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/data/firebase'
import { useHousehold } from './HouseholdContext'
import { FREE_LIMITS, resolveLimits, type TierLimits } from '@/lib/entitlement-limits'
import type { HouseEntitlement } from '@/types/entitlement'

export interface EntitlementContextValue {
  entitlement: HouseEntitlement | null
  limits: TierLimits
  isPro: boolean
  isLoading: boolean
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null)

/**
 * Single, app-wide subscription to the active house's entitlement doc.
 *
 * Hoisted here instead of in a per-component hook so that the whole render
 * tree (Dashboard toolbar, feature cards, lock overlays, billing settings,
 * file drop zones, etc.) shares one Firestore listener and one loading
 * state — no flicker, no duplicated network work, consistent tier across
 * every surface at the same instant.
 *
 * Entitlement lives at `houses/{houseId}/meta/entitlement` and is readable
 * by every house member via existing Firestore rules, so inheritance works
 * automatically — every member of a Pro house experiences Pro.
 */
export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { house } = useHousehold()
  const [entitlement, setEntitlement] = useState<HouseEntitlement | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!house?.id) {
      setEntitlement(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const unsub = onSnapshot(
      doc(db, 'houses', house.id, 'meta', 'entitlement'),
      (snap) => {
        setEntitlement(snap.exists() ? (snap.data() as HouseEntitlement) : null)
        setIsLoading(false)
      },
      () => {
        setEntitlement(null)
        setIsLoading(false)
      },
    )
    return unsub
  }, [house?.id])

  const limits = isLoading ? FREE_LIMITS : resolveLimits(entitlement)
  const isPro = entitlement?.tier === 'pro'
  return (
    <EntitlementContext.Provider value={{ entitlement, limits, isPro, isLoading }}>
      {children}
    </EntitlementContext.Provider>
  )
}

/** Internal — returns null when rendered outside the provider. */
export function useEntitlementContext() {
  return useContext(EntitlementContext)
}
