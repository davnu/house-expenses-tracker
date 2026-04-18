import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  runTransaction,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/data/firebase'
import { deleteAttachments } from '@/data/firebase-attachment-store'
import { deleteDocumentFiles } from '@/data/firebase-document-store'
import { useAuth } from './AuthContext'
import { MEMBER_COLOR_PALETTE, SHARED_PAYER, SHARED_PAYER_COLOR, SHARED_PAYER_LABEL, SPLIT_PAYER, SPLIT_PAYER_COLOR, SPLIT_PAYER_LABEL } from '@/lib/constants'
import { setCurrencyContext, stripInvalid } from '@/lib/utils'
import { getEffectiveHouseSplit } from '@/lib/cost-split'
import { FOLDER_DEFS } from '@/types/document'
import type { CascadeProgressCallback } from '@/hooks/use-cascade-progress'
import type { UserProfile, House, HouseMember, Invite, CostSplitShare } from '@/types/expense'

interface HouseholdContextValue {
  userProfile: UserProfile | null
  house: House | null
  houses: House[]
  members: HouseMember[]
  /** Effective house split (always sums to 10000 bps). Falls back to equal when none is stored. */
  houseSplit: CostSplitShare[]
  loading: boolean
  createHouse: (name: string, country: string, currency: string) => Promise<void>
  joinHouse: (inviteId: string) => Promise<void>
  generateInvite: () => Promise<string>
  updateDisplayName: (name: string) => Promise<void>
  updateHouseName: (name: string) => Promise<void>
  /** Pass null to clear the stored split (reverts to equal). */
  updateCostSplit: (split: CostSplitShare[] | null) => Promise<void>
  removeMember: (uid: string) => Promise<void>
  switchHouse: (houseId: string) => Promise<void>
  leaveHouse: () => Promise<void>
  deleteHouse: (onProgress?: CascadeProgressCallback) => Promise<void>
  getMemberName: (uid: string) => string
  getMemberColor: (uid: string) => string
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

/** Firestore batch limit is 500 operations */
const BATCH_LIMIT = 500

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [house, setHouse] = useState<House | null>(null)
  const [houses, setHouses] = useState<House[]>([])
  const [members, setMembers] = useState<HouseMember[]>([])
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [housesLoaded, setHousesLoaded] = useState(false)
  const [membersReady, setMembersReady] = useState(false)

  // Retry counter — when members listener gets permission-denied for a known
  // member (propagation delay after house creation), incrementing this forces
  // the effect to re-run and re-subscribe after a delay.
  const [membersRetry, setMembersRetry] = useState(0)
  const MAX_MEMBER_RETRIES = 5

  const loading = !profileLoaded || !housesLoaded || (!!userProfile?.houseId && !membersReady)

  // Sync currency formatting to the active house's country
  useEffect(() => {
    setCurrencyContext(house?.country, house?.currency)
  }, [house?.country, house?.currency])

  // Refs to avoid stale closures in callbacks
  const housesRef = useRef(houses)
  housesRef.current = houses
  const housesLoadedRef = useRef(housesLoaded)
  housesLoadedRef.current = housesLoaded

  // Guard to prevent duplicate auto-select writes
  const autoSelectingRef = useRef(false)

  // Listen to user profile
  useEffect(() => {
    if (!user) {
      setUserProfile(null)
      setHouse(null)
      setHouses([])
      setMembers([])
      setProfileLoaded(false)
      setHousesLoaded(false)
      setMembersReady(false)
      setMembersRetry(0)
      return
    }

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        setUserProfile({ uid: snap.id, ...snap.data() } as UserProfile)
      } else {
        setUserProfile(null)
      }
      setProfileLoaded(true)
    })

    return unsubscribe
  }, [user])

  // Listen to all houses the user belongs to
  useEffect(() => {
    if (!user) {
      setHouses([])
      setHousesLoaded(false)
      return
    }

    const q = query(collection(db, 'houses'), where('memberIds', 'array-contains', user.uid))
    const unsubscribe = onSnapshot(q, (snap) => {
      // Filter out soft-deleted houses (deletedAt set by owner, Cloud Function will clean up)
      setHouses(snap.docs
        .filter((d) => !d.data().deletedAt)
        .map((d) => ({ id: d.id, ...d.data() }) as House))
      setHousesLoaded(true)
    }, (error) => {
      console.error('Houses listener error:', error)
      setHousesLoaded(true) // Unblock loading
    })

    return unsubscribe
  }, [user])

  // Auto-select first house if user has houses but no active house
  useEffect(() => {
    if (!user || !profileLoaded || !housesLoaded) return
    if (userProfile && !userProfile.houseId && houses.length > 0 && !autoSelectingRef.current) {
      autoSelectingRef.current = true
      updateDoc(doc(db, 'users', user.uid), { houseId: houses[0].id })
        .catch(() => {})
        .finally(() => { autoSelectingRef.current = false })
    }
  }, [user, userProfile, houses, profileLoaded, housesLoaded])

  // Reset retry counter when switching houses
  useEffect(() => { setMembersRetry(0); setMembersReady(false) }, [userProfile?.houseId])

  // Listen to active house + members when houseId is set.
  // membersRetry in deps: when the members listener gets permission-denied
  // for a known member (propagation delay), we increment membersRetry after
  // a delay to re-run this effect and re-subscribe.
  useEffect(() => {
    if (!user || !userProfile?.houseId) {
      setHouse(null)
      setMembers([])
      setMembersReady(false)
      return
    }

    const houseId = userProfile.houseId
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const unsubHouse = onSnapshot(doc(db, 'houses', houseId), (snap) => {
      if (snap.exists()) {
        setHouse({ id: snap.id, ...snap.data() } as House)
      } else {
        // House was deleted — clear active house and dangling houseId
        setHouse(null)
        if (user) updateDoc(doc(db, 'users', user.uid), { houseId: null }).catch(() => {})
      }
    }, (error) => {
      console.error('House listener error:', error)
    })

    const unsubMembers = onSnapshot(
      collection(db, 'houses', houseId, 'members'),
      (snap) => {
        setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as HouseMember))
        setMembersReady(true)
      },
      (error) => {
        if (error.code === 'permission-denied') {
          const isKnownMember = !housesLoadedRef.current || housesRef.current.some(h => h.id === houseId)
          if (isKnownMember && membersRetry < MAX_MEMBER_RETRIES) {
            // Transient propagation delay — retry with exponential backoff
            const delay = Math.min(500 * Math.pow(2, membersRetry), 4000)
            retryTimer = setTimeout(() => setMembersRetry(c => c + 1), delay)
            return
          }
          if (!isKnownMember) {
            updateDoc(doc(db, 'users', user.uid), { houseId: null }).catch(() => {})
            setHouse(null)
            setMembers([])
          }
        }
        // After max retries or non-permission error, unblock so user isn't stuck forever
        setMembersReady(true)
      }
    )

    return () => {
      unsubHouse()
      unsubMembers()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [user, userProfile?.houseId, membersRetry])

  const createHouse = useCallback(async (name: string, country: string, currency: string) => {
    if (!user) return

    // Fallback to Firebase Auth user for display name and email when userProfile
    // hasn't loaded yet (Google sign-up race: ensureUserProfile runs fire-and-forget
    // in onAuthStateChanged, so the profile doc may not exist when this runs).
    const displayName = userProfile?.displayName ?? user.displayName ?? user.email?.split('@')[0] ?? 'User'
    const email = userProfile?.email ?? user.email ?? ''

    const houseRef = doc(collection(db, 'houses'))
    const houseId = houseRef.id
    const now = new Date().toISOString()
    const color = MEMBER_COLOR_PALETTE[0]

    const houseData = {
      name,
      ownerId: user.uid,
      memberIds: [user.uid],
      country,
      currency,
      createdAt: now,
    }

    // Suppress auto-select during multi-step creation so the UI doesn't transition
    // to the new house until folders are seeded (prevents empty Documents page).
    autoSelectingRef.current = true
    try {
      // Step 1: Create house + member (no profile houseId yet — keeps UI on onboarding)
      const batch = writeBatch(db)
      batch.set(houseRef, houseData)
      batch.set(doc(db, 'houses', houseId, 'members', user.uid), {
        displayName,
        email,
        color,
        role: 'owner',
        joinedAt: now,
      })
      await batch.commit()

      // Step 2: Seed default folders (member doc now exists → isMember() passes).
      // Separate batch because Firestore security rules evaluate each operation against
      // the database state BEFORE the batch — the folders rule requires isMember() which
      // checks exists(.../members/{uid}), but in a combined batch the member doc doesn't
      // exist yet from the rules engine's perspective.
      try {
        const folderBatch = writeBatch(db)
        for (const { key, icon, order } of FOLDER_DEFS) {
          folderBatch.set(doc(collection(db, 'houses', houseId, 'folders')), stripInvalid({
            name: key,
            icon,
            order,
            translationKey: key,
            createdAt: now,
            createdBy: user.uid,
          }))
        }
        await folderBatch.commit()
      } catch (err) {
        // Best-effort: fallback seeding in DocumentContext handles this
        console.error('Folder seeding after house creation failed:', err)
      }

      // Step 3: Set houseId on profile LAST — this triggers the UI transition.
      // By now the folders exist, so DocumentProvider will see them on first snapshot.
      // Use setDoc+merge (not updateDoc) because the profile doc may not exist yet
      // for Google sign-up — ensureUserProfile runs fire-and-forget and might not
      // have completed. merge:true creates the doc if missing or updates if it exists.
      await setDoc(doc(db, 'users', user.uid), {
        displayName,
        email,
        houseId,
        createdAt: now,
      }, { merge: true })
    } finally {
      autoSelectingRef.current = false
    }
  }, [user, userProfile])

  const joinHouse = useCallback(async (inviteId: string) => {
    if (!user || !userProfile) return

    const inviteRef = doc(db, 'invites', inviteId)

    // Use a transaction to prevent race conditions (two users joining with same invite)
    await runTransaction(db, async (transaction) => {
      const inviteSnap = await transaction.get(inviteRef)
      if (!inviteSnap.exists()) throw new Error('Invite not found')

      const invite = inviteSnap.data() as Omit<Invite, 'id'>
      if (invite.usedBy) throw new Error('Invite already used')
      if (new Date(invite.expiresAt) < new Date()) throw new Error('Invite expired')

      const houseId = invite.houseId
      const now = new Date().toISOString()

      // Read house doc for member count (color assignment)
      const houseSnap = await transaction.get(doc(db, 'houses', houseId))
      const memberCount = houseSnap.exists() ? (houseSnap.data().memberIds?.length ?? 0) : 0
      const color = MEMBER_COLOR_PALETTE[memberCount % MEMBER_COLOR_PALETTE.length]

      // Mark invite as used FIRST (prevents race condition)
      transaction.update(inviteRef, { usedBy: user.uid, usedAt: now })

      // Add member
      transaction.set(doc(db, 'houses', houseId, 'members', user.uid), {
        displayName: userProfile.displayName,
        email: userProfile.email,
        color,
        role: 'member',
        joinedAt: now,
      })

      // Update house memberIds
      transaction.update(doc(db, 'houses', houseId), { memberIds: arrayUnion(user.uid) })

      // Update user profile — switch active house to the newly joined one
      transaction.update(doc(db, 'users', user.uid), { houseId })
    })
  }, [user, userProfile])

  const generateInvite = useCallback(async (): Promise<string> => {
    if (!user || !house) throw new Error('No house')

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const inviteRef = await addDoc(collection(db, 'invites'), {
      houseId: house.id,
      houseName: house.name,
      createdBy: user.uid,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })

    return `${window.location.origin}/invite/${inviteRef.id}`
  }, [user, house])

  const updateDisplayName = useCallback(async (name: string) => {
    if (!user) return
    const batch = writeBatch(db)
    batch.update(doc(db, 'users', user.uid), { displayName: name })
    // Update member doc in all houses the user belongs to
    for (const h of housesRef.current) {
      batch.update(doc(db, 'houses', h.id, 'members', user.uid), { displayName: name })
    }
    await batch.commit()
  }, [user])

  const updateHouseName = useCallback(async (name: string) => {
    if (!house) return
    await updateDoc(doc(db, 'houses', house.id), { name })
  }, [house])

  const updateCostSplit = useCallback(async (split: CostSplitShare[] | null) => {
    if (!house) return
    await updateDoc(doc(db, 'houses', house.id), {
      costSplit: split === null ? deleteField() : split,
    })
  }, [house])

  const removeMember = useCallback(async (uid: string) => {
    if (!house) return
    if (uid === house.ownerId) throw new Error('Cannot remove the house owner')
    const batch = writeBatch(db)
    batch.delete(doc(db, 'houses', house.id, 'members', uid))
    batch.update(doc(db, 'houses', house.id), { memberIds: arrayRemove(uid) })
    // Only clear the removed user's houseId if it points to this house
    try {
      const memberProfile = await getDoc(doc(db, 'users', uid))
      if (memberProfile.exists() && memberProfile.data().houseId === house.id) {
        batch.update(doc(db, 'users', uid), { houseId: null })
      }
    } catch {
      // Best-effort — may not have permission to read their profile in edge cases
    }
    await batch.commit()
  }, [house])

  const switchHouse = useCallback(async (houseId: string) => {
    if (!user) return
    if (!housesRef.current.some((h) => h.id === houseId)) {
      throw new Error('Not a member of this house')
    }
    await updateDoc(doc(db, 'users', user.uid), { houseId })
  }, [user])

  const leaveHouse = useCallback(async () => {
    if (!user || !house) return
    if (house.ownerId === user.uid) throw new Error('Owner cannot leave. Delete the house instead.')

    const houseId = house.id
    const remaining = housesRef.current.filter((h) => h.id !== houseId)
    const nextHouseId = remaining.length > 0 ? remaining[0].id : null

    const batch = writeBatch(db)
    batch.delete(doc(db, 'houses', houseId, 'members', user.uid))
    batch.update(doc(db, 'houses', houseId), { memberIds: arrayRemove(user.uid) })
    batch.update(doc(db, 'users', user.uid), { houseId: nextHouseId })
    await batch.commit()
  }, [user, house])

  // Soft-delete + client-side cascade with progress reporting.
  // Setting deletedAt first hides the house from all members immediately.
  // A Cloud Function (onHouseSoftDeleted) runs the same cascade server-side
  // as a safety net — all operations are idempotent, so concurrent execution is safe.
  const deleteHouse = useCallback(async (onProgress?: CascadeProgressCallback) => {
    if (!user || !house) return
    if (house.ownerId !== user.uid) throw new Error('Only the owner can delete a house')

    const houseId = house.id

    // Soft-delete: mark house as deleted immediately (hides from all members' UI)
    await updateDoc(doc(db, 'houses', houseId), { deletedAt: new Date().toISOString() })

    // 1. Delete attachments + document files from Storage (best-effort)
    onProgress?.('attachments', 'active')
    try {
      const expensesSnap = await getDocs(collection(db, 'houses', houseId, 'expenses'))
      for (const expDoc of expensesSnap.docs) {
        const attachments = expDoc.data().attachments as Array<{ id: string; name: string }> | undefined
        if (attachments?.length) {
          await deleteAttachments(houseId, attachments)
        }
      }
      // Delete document files from Storage
      const documentsSnap = await getDocs(collection(db, 'houses', houseId, 'documents'))
      const docFiles = documentsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
      }))
      if (docFiles.length > 0) {
        await deleteDocumentFiles(houseId, docFiles)
      }
    } catch {
      // Best-effort
    }
    onProgress?.('attachments', 'completed')

    // 2. Delete all subcollection docs in batches
    onProgress?.('data', 'active')
    const subcollections = ['expenses', 'recurring', 'meta', 'folders', 'documents', 'todos']
    for (const sub of subcollections) {
      try {
        const snap = await getDocs(collection(db, 'houses', houseId, sub))
        for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
          const chunk = snap.docs.slice(i, i + BATCH_LIMIT)
          const batch = writeBatch(db)
          chunk.forEach((d) => batch.delete(d.ref))
          await batch.commit()
        }
      } catch {
        // Best-effort
      }
    }
    onProgress?.('data', 'completed')

    // 3. Clear houseId on affected members and delete member docs
    onProgress?.('members', 'active')
    try {
      const membersSnap = await getDocs(collection(db, 'houses', houseId, 'members'))
      for (const memberDoc of membersSnap.docs) {
        const memberUid = memberDoc.id
        try {
          const profileSnap = await getDoc(doc(db, 'users', memberUid))
          if (profileSnap.exists() && profileSnap.data().houseId === houseId) {
            await updateDoc(doc(db, 'users', memberUid), { houseId: null })
          }
        } catch {
          // Best-effort
        }
      }
      for (let i = 0; i < membersSnap.docs.length; i += BATCH_LIMIT) {
        const chunk = membersSnap.docs.slice(i, i + BATCH_LIMIT)
        const batch = writeBatch(db)
        chunk.forEach((d) => batch.delete(d.ref))
        await batch.commit()
      }
    } catch {
      // Best-effort
    }
    onProgress?.('members', 'completed')

    // 4. Delete the house doc + switch owner to next house
    onProgress?.('finalize', 'active')
    await deleteDoc(doc(db, 'houses', houseId))

    const remaining = housesRef.current.filter((h) => h.id !== houseId)
    const nextHouseId = remaining.length > 0 ? remaining[0].id : null
    await updateDoc(doc(db, 'users', user.uid), { houseId: nextHouseId })
    onProgress?.('finalize', 'completed')
  }, [user, house])

  const houseSplit = useMemo(
    () => getEffectiveHouseSplit(members.map((m) => m.uid), house?.costSplit),
    [members, house?.costSplit],
  )

  const getMemberName = useCallback((uid: string) => {
    if (uid === SHARED_PAYER) return SHARED_PAYER_LABEL
    if (uid === SPLIT_PAYER) return SPLIT_PAYER_LABEL
    return members.find((m) => m.uid === uid)?.displayName ?? 'Former member'
  }, [members])

  const getMemberColor = useCallback((uid: string) => {
    if (uid === SHARED_PAYER) return SHARED_PAYER_COLOR
    if (uid === SPLIT_PAYER) return SPLIT_PAYER_COLOR
    return members.find((m) => m.uid === uid)?.color ?? '#6b7280'
  }, [members])

  return (
    <HouseholdContext.Provider
      value={{
        userProfile,
        house,
        houses,
        members,
        houseSplit,
        loading,
        createHouse,
        joinHouse,
        generateInvite,
        updateDisplayName,
        updateHouseName,
        updateCostSplit,
        removeMember,
        switchHouse,
        leaveHouse,
        deleteHouse,
        getMemberName,
        getMemberColor,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  )
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider')
  return ctx
}
