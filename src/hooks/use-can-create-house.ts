import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/data/firebase'
import { useAuth } from '@/context/AuthContext'
import { useHousehold } from '@/context/HouseholdContext'
import type { HouseEntitlement } from '@/types/entitlement'

export type CreateHouseReason = 'first' | 'hasProHouse' | 'needsUpgrade' | 'loading'

export interface UseCanCreateHouseResult {
  canCreate: boolean
  reason: CreateHouseReason
  /** How many houses the current user owns. Useful for copy ("Add another house"). */
  ownedCount: number
}

/**
 * Can the current user create a new house?
 *
 * Pricing rule: free tier = 1 house. To create a 2nd / 3rd / … house, the user
 * must have Pro on at least one of the houses they already own.
 *
 * This hook subscribes (onSnapshot) to the entitlement doc of every house the
 * user currently owns, so the UI reacts live when the user completes a Pro
 * purchase (no reload needed).
 *
 * We do NOT reuse the app-wide `EntitlementProvider` here because it only
 * tracks the active house's entitlement. The rule needs to consider any
 * owned house (the active one might be a free house the user is browsing,
 * while they actually own another Pro house — both should allow creation).
 *
 * Returns `canCreate: false` while still loading entitlements so no premature
 * free-create slips through during the initial subscription window. The
 * server-side gate in `HouseholdContext.createHouse()` is the authoritative
 * check; this hook exists purely for UX (disable buttons pre-emptively).
 */
export function useCanCreateHouse(): UseCanCreateHouseResult {
  const { user } = useAuth()
  const { houses } = useHousehold()

  const ownedHouseIds = user
    ? houses.filter((h) => h.ownerId === user.uid).map((h) => h.id)
    : []
  const ownedCount = ownedHouseIds.length

  // Track entitlements by houseId so updates arrive via onSnapshot.
  const [entitlements, setEntitlements] = useState<Record<string, HouseEntitlement | null>>({})
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())

  // Join the owned-ids into a stable key so the effect re-runs when the set
  // of owned houses changes (house created / joined / deleted).
  const joinedKey = ownedHouseIds.slice().sort().join(',')

  useEffect(() => {
    if (ownedHouseIds.length === 0) {
      setEntitlements({})
      setLoadedIds(new Set())
      return
    }

    const unsubs = ownedHouseIds.map((houseId) =>
      onSnapshot(
        doc(db, 'houses', houseId, 'meta', 'entitlement'),
        (snap) => {
          setEntitlements((prev) => ({
            ...prev,
            [houseId]: snap.exists() ? (snap.data() as HouseEntitlement) : null,
          }))
          setLoadedIds((prev) => {
            if (prev.has(houseId)) return prev
            const next = new Set(prev)
            next.add(houseId)
            return next
          })
        },
        () => {
          // Permission denied / network error → treat as "no entitlement here"
          // and mark loaded so we don't hang on canCreate=false forever.
          setEntitlements((prev) => ({ ...prev, [houseId]: null }))
          setLoadedIds((prev) => {
            if (prev.has(houseId)) return prev
            const next = new Set(prev)
            next.add(houseId)
            return next
          })
        },
      )
    )
    return () => unsubs.forEach((u) => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedKey])

  if (ownedCount === 0) {
    // First house is always free (onboarding path).
    return { canCreate: true, reason: 'first', ownedCount: 0 }
  }

  const allLoaded = ownedHouseIds.every((id) => loadedIds.has(id))
  if (!allLoaded) {
    return { canCreate: false, reason: 'loading', ownedCount }
  }

  const anyPro = ownedHouseIds.some((id) => entitlements[id]?.tier === 'pro')
  return anyPro
    ? { canCreate: true, reason: 'hasProHouse', ownedCount }
    : { canCreate: false, reason: 'needsUpgrade', ownedCount }
}
