import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
  arrayUnion,
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
    if (!userProfile?.houseId) {
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

    const unsubMembers = onSnapshot(collection(db, 'houses', houseId, 'members'), (snap) => {
      setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as HouseMember))
    })

    return () => {
      unsubHouse()
      unsubMembers()
    }
  }, [userProfile?.houseId])

  const createHouse = useCallback(async (name: string, country?: string, currency?: string) => {
    if (!user || !userProfile) return

    const houseRef = doc(collection(db, 'houses'))
    const houseId = houseRef.id
    const now = new Date().toISOString()
    const color = MEMBER_COLOR_PALETTE[0]

    // Create house doc
    const houseData: Record<string, unknown> = {
      name,
      ownerId: user.uid,
      memberIds: [user.uid],
      createdAt: now,
    }
    if (country) houseData.country = country
    if (currency) houseData.currency = currency
    await setDoc(houseRef, houseData)

    // Create member doc
    await setDoc(doc(db, 'houses', houseId, 'members', user.uid), {
      displayName: userProfile.displayName,
      email: userProfile.email,
      color,
      role: 'owner',
      joinedAt: now,
    })

    // Update user profile with houseId
    await updateDoc(doc(db, 'users', user.uid), { houseId })
  }, [user, userProfile])

  const joinHouse = useCallback(async (inviteId: string) => {
    if (!user || !userProfile) return

    const inviteRef = doc(db, 'invites', inviteId)
    const inviteSnap = await getDoc(inviteRef)
    if (!inviteSnap.exists()) throw new Error('Invite not found')

    const invite = inviteSnap.data() as Omit<Invite, 'id'>

    // Check if expired or already used
    if (invite.usedBy) throw new Error('Invite already used')
    if (new Date(invite.expiresAt) < new Date()) throw new Error('Invite expired')

    const houseId = invite.houseId
    const now = new Date().toISOString()

    // Read house doc to determine member count for color assignment
    // (we can't read the members subcollection since we're not a member yet)
    const houseSnap = await getDoc(doc(db, 'houses', houseId))
    const memberCount = houseSnap.exists()
      ? (houseSnap.data().memberIds?.length ?? 0)
      : 0
    const color = MEMBER_COLOR_PALETTE[memberCount % MEMBER_COLOR_PALETTE.length]

    // Add self as member first (rules allow: request.auth.uid == memberId)
    await setDoc(doc(db, 'houses', houseId, 'members', user.uid), {
      displayName: userProfile.displayName,
      email: userProfile.email,
      color,
      role: 'member',
      joinedAt: now,
    })

    // Now we're a member — update house memberIds
    await updateDoc(doc(db, 'houses', houseId), {
      memberIds: arrayUnion(user.uid),
    })

    // Update user profile
    await updateDoc(doc(db, 'users', user.uid), { houseId })

    // Mark invite as used
    await updateDoc(inviteRef, { usedBy: user.uid, usedAt: now })
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
    await updateDoc(doc(db, 'users', user.uid), { displayName: name })

    // Also update in house members if in a house
    if (userProfile?.houseId) {
      await updateDoc(doc(db, 'houses', userProfile.houseId, 'members', user.uid), {
        displayName: name,
      })
    }
  }, [user, userProfile])

  const updateHouseName = useCallback(async (name: string) => {
    if (!house) return
    await updateDoc(doc(db, 'houses', house.id), { name })
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
