import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/data/firebase'
import { useAuth } from '@/context/AuthContext'
import { useHousehold } from '@/context/HouseholdContext'
import { CreateHouseDialog } from '@/components/layout/CreateHouseDialog'
import type { HouseEntitlement } from '@/types/entitlement'

export type CreateHouseReason = 'first' | 'hasProHouse' | 'needsUpgrade' | 'loading'

interface CreateHouseContextValue {
  /**
   * Routing signal for every "Create New House" / "Add another house" button
   * across the app (HouseSwitcher, MobileHouseBar, BillingSection). The four
   * reasons drive a consistent decision tree:
   *   first        → free: open the create dialog directly
   *   hasProHouse  → €29 additional_house paywall
   *   needsUpgrade → €49 Pro upgrade — of the user's own non-Pro house (see
   *                  `upgradeTargetHouseId`), which may not be the currently-
   *                  viewed house if the user is a member of someone else's.
   *   loading      → buttons render as a non-interactive skeleton (no layout shift)
   */
  reason: CreateHouseReason
  ownedCount: number
  /**
   * When `reason === 'needsUpgrade'`, the id of the user's own non-Pro house
   * that the upgrade CTA should target. Callers in HouseSwitcher / MobileHouseBar
   * switch to this house before opening the upgrade modal so the €49 checkout
   * lands on a house the server actually accepts (ownership-gated).
   *
   * Null for every other reason.
   */
  upgradeTargetHouseId: string | null
  /** Imperatively open the free CreateHouseDialog (the provider owns the single instance). */
  openCreateDialog: () => void
}

const CreateHouseContext = createContext<CreateHouseContextValue | null>(null)

/**
 * Single source of truth for "can the current user create another house?" AND
 * the one-and-only mounted `<CreateHouseDialog />`.
 *
 * Before this provider, each consumer (HouseSwitcher, MobileHouseBar,
 * BillingSection) called `useCanCreateHouse()` independently — which meant
 * **three** parallel Firestore subscriptions on each owned house's entitlement
 * doc (billing cost + bandwidth waste + nondeterministic loading windows
 * where one surface could say "allowed" while another said "loading"). The
 * provider centralizes the subscription and the dialog instance so every
 * surface sees the same gate state and opens the same dialog.
 *
 * Must mount inside HouseholdProvider (reads `houses`) and inside a Router
 * (the CreateHouseDialog calls useNavigate on submit).
 */
export function CreateHouseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { houses } = useHousehold()

  const ownedHouseIds = useMemo(
    () =>
      user
        ? houses.filter((h) => h.ownerId === user.uid).map((h) => h.id)
        : [],
    [user, houses],
  )
  const ownedCount = ownedHouseIds.length

  const [entitlements, setEntitlements] = useState<Record<string, HouseEntitlement | null>>({})
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())
  const [isDialogOpen, setDialogOpen] = useState(false)

  // Join the owned-ids into a stable key so the effect re-runs when the set
  // of owned houses changes (house created / joined / deleted).
  const joinedKey = ownedHouseIds.slice().sort().join(',')

  useEffect(() => {
    if (ownedHouseIds.length === 0) {
      setEntitlements({})
      setLoadedIds(new Set())
      return
    }

    const markLoaded = (id: string) =>
      setLoadedIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })

    const unsubs = ownedHouseIds.map((houseId) =>
      onSnapshot(
        doc(db, 'houses', houseId, 'meta', 'entitlement'),
        (snap) => {
          setEntitlements((prev) => ({
            ...prev,
            [houseId]: snap.exists() ? (snap.data() as HouseEntitlement) : null,
          }))
          markLoaded(houseId)
        },
        () => {
          // Permission denied / network error → treat as "no entitlement here"
          // and mark loaded so we don't hang on reason='loading' forever.
          setEntitlements((prev) => ({ ...prev, [houseId]: null }))
          markLoaded(houseId)
        },
      ),
    )
    return () => unsubs.forEach((u) => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedKey])

  const reason: CreateHouseReason = useMemo(() => {
    if (ownedCount === 0) return 'first'
    const allLoaded = ownedHouseIds.every((id) => loadedIds.has(id))
    if (!allLoaded) return 'loading'
    const anyPro = ownedHouseIds.some((id) => entitlements[id]?.tier === 'pro')
    return anyPro ? 'hasProHouse' : 'needsUpgrade'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedCount, joinedKey, loadedIds, entitlements])

  // First owned non-Pro house — target for the €49 upgrade CTA when the user
  // is viewing a house they don't own. Null unless reason is 'needsUpgrade'.
  const upgradeTargetHouseId = useMemo(() => {
    if (reason !== 'needsUpgrade') return null
    return ownedHouseIds.find((id) => entitlements[id]?.tier !== 'pro') ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason, joinedKey, entitlements])

  const openCreateDialog = useCallback(() => setDialogOpen(true), [])

  const value = useMemo(
    () => ({ reason, ownedCount, upgradeTargetHouseId, openCreateDialog }),
    [reason, ownedCount, upgradeTargetHouseId, openCreateDialog],
  )

  return (
    <CreateHouseContext.Provider value={value}>
      {children}
      {/*
        Single dialog instance for the whole app. Every "free create" entry
        point (HouseSwitcher, MobileHouseBar, BillingSection first-case)
        opens this same dialog so form state, focus management, and URL
        navigation on success are consistent across surfaces.
      */}
      <CreateHouseDialog open={isDialogOpen} onOpenChange={setDialogOpen} />
    </CreateHouseContext.Provider>
  )
}

export function useCreateHouse(): CreateHouseContextValue {
  const ctx = useContext(CreateHouseContext)
  if (!ctx) {
    throw new Error('useCreateHouse must be used within CreateHouseProvider')
  }
  return ctx
}
