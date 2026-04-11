import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  doc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  runTransaction,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/data/firebase'
import { useAuth } from './AuthContext'
import { MEMBER_COLOR_PALETTE } from '@/lib/constants'
import type { UserProfile, House, HouseMember, Invite } from '@/types/expense'

interface HouseholdContextValue {
  userProfile: UserProfile | null
  house: House | null
  members: HouseMember[]
  loading: boolean
  createHouse: (name: string, country?: string, currency?: string) => Promise<void>
  joinHouse: (inviteId: string) => Promise<void>
  generateInvite: () => Promise<string>
  updateDisplayName: (name: string) => Promise<void>
  updateHouseName: (name: string) => Promise<void>
  removeMember: (uid: string) => Promise<void>
  getMemberName: (uid: string) => string
  getMemberColor: (uid: string) => string
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [house, setHouse] = useState<House | null>(null)
  const [members, setMembers] = useState<HouseMember[]>([])
  const [loading, setLoading] = useState(true)

  // Listen to user profile
  useEffect(() => {
    if (!user) {
      setUserProfile(null)
      setHouse(null)
      setMembers([])
      setLoading(false)
      return
    }

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        setUserProfile({ uid: snap.id, ...snap.data() } as UserProfile)
      } else {
        setUserProfile(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [user])

  // Listen to house + members when houseId is set
  useEffect(() => {
    if (!user || !userProfile?.houseId) {
      setHouse(null)
      setMembers([])
      return
    }

    const houseId = userProfile.houseId

    const unsubHouse = onSnapshot(doc(db, 'houses', houseId), (snap) => {
      if (snap.exists()) {
        setHouse({ id: snap.id, ...snap.data() } as House)
      }
    })

    const unsubMembers = onSnapshot(
      collection(db, 'houses', houseId, 'members'),
      (snap) => {
        setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as HouseMember))
      },
      (error) => {
        // PERMISSION_DENIED means user was removed from this house
        if (error.code === 'permission-denied') {
          updateDoc(doc(db, 'users', user.uid), { houseId: null }).catch(() => {})
          setHouse(null)
          setMembers([])
        }
      }
    )

    return () => {
      unsubHouse()
      unsubMembers()
    }
  }, [user, userProfile?.houseId])

  const createHouse = useCallback(async (name: string, country?: string, currency?: string) => {
    if (!user || !userProfile) return

    const houseRef = doc(collection(db, 'houses'))
    const houseId = houseRef.id
    const now = new Date().toISOString()
    const color = MEMBER_COLOR_PALETTE[0]

    const houseData: Record<string, unknown> = {
      name,
      ownerId: user.uid,
      memberIds: [user.uid],
      createdAt: now,
    }
    if (country) houseData.country = country
    if (currency) houseData.currency = currency

    const batch = writeBatch(db)
    batch.set(houseRef, houseData)
    batch.set(doc(db, 'houses', houseId, 'members', user.uid), {
      displayName: userProfile.displayName,
      email: userProfile.email,
      color,
      role: 'owner',
      joinedAt: now,
    })
    batch.update(doc(db, 'users', user.uid), { houseId })
    await batch.commit()
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

      // Update user profile
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
    if (userProfile?.houseId) {
      batch.update(doc(db, 'houses', userProfile.houseId, 'members', user.uid), {
        displayName: name,
      })
    }
    await batch.commit()
  }, [user, userProfile])

  const updateHouseName = useCallback(async (name: string) => {
    if (!house) return
    await updateDoc(doc(db, 'houses', house.id), { name })
  }, [house])

  const removeMember = useCallback(async (uid: string) => {
    if (!house) return
    if (uid === house.ownerId) throw new Error('Cannot remove the house owner')
    const batch = writeBatch(db)
    batch.delete(doc(db, 'houses', house.id, 'members', uid))
    batch.update(doc(db, 'houses', house.id), { memberIds: arrayRemove(uid) })
    batch.update(doc(db, 'users', uid), { houseId: null })
    await batch.commit()
  }, [house])

  const getMemberName = useCallback((uid: string) => {
    return members.find((m) => m.uid === uid)?.displayName ?? 'Unknown'
  }, [members])

  const getMemberColor = useCallback((uid: string) => {
    return members.find((m) => m.uid === uid)?.color ?? '#6b7280'
  }, [members])

  return (
    <HouseholdContext.Provider
      value={{
        userProfile,
        house,
        members,
        loading,
        createHouse,
        joinHouse,
        generateInvite,
        updateDisplayName,
        updateHouseName,
        removeMember,
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
