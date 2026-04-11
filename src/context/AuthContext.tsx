import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  deleteUser,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc, updateDoc, arrayRemove, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '@/data/firebase'
import { deleteAttachments } from '@/data/firebase-attachment-store'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signInEmail: (email: string, password: string) => Promise<void>
  signUpEmail: (email: string, password: string, displayName: string) => Promise<void>
  signInGoogle: () => Promise<void>
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const googleProvider = new GoogleAuthProvider()

async function ensureUserProfile(user: User, displayName?: string, consentedAt?: string) {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const profile: Record<string, unknown> = {
      displayName: displayName ?? user.displayName ?? user.email?.split('@')[0] ?? 'User',
      email: user.email ?? '',
      houseId: null,
      createdAt: new Date().toISOString(),
    }
    if (consentedAt) profile.consentedAt = consentedAt
    await setDoc(ref, profile)
  }
}

// Flag to prevent ensureUserProfile from recreating a profile during deletion
let deletingAccount = false

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u && !deletingAccount) await ensureUserProfile(u)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signInEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signUpEmail = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    await ensureUserProfile(cred.user, displayName, new Date().toISOString())
  }

  const signInGoogle = async () => {
    await signInWithPopup(auth, googleProvider)
  }

  const logout = async () => {
    await signOut(auth)
  }

  const deleteAccount = async () => {
    if (!user) throw new Error('Not signed in')

    deletingAccount = true
    const uid = user.uid

    // 1. Delete Firebase Auth account FIRST — if this fails (requires-recent-login),
    //    we stop before touching any Firestore data. The auth token remains valid
    //    briefly after deletion, so subsequent Firestore operations still work.
    await deleteUser(user)

    // 2. Read user profile to get houseId
    const profileSnap = await getDoc(doc(db, 'users', uid))
    const houseId = profileSnap.exists() ? profileSnap.data().houseId : null

    if (houseId) {
      // 3. Delete user's attachments from Storage
      try {
        const expensesSnap = await getDocs(
          query(collection(db, 'houses', houseId, 'expenses'), where('payer', '==', uid))
        )
        for (const expDoc of expensesSnap.docs) {
          const attachments = expDoc.data().attachments as Array<{ id: string; name: string }> | undefined
          if (attachments?.length) {
            await deleteAttachments(houseId, attachments)
          }
        }
      } catch {
        // Storage cleanup is best-effort — auth token may have expired
      }

      // 4. Remove user from house memberIds
      try {
        await updateDoc(doc(db, 'houses', houseId), {
          memberIds: arrayRemove(uid),
        })
      } catch {
        // Best-effort — auth token may have expired
      }

      // 5. Delete member doc
      try {
        await deleteDoc(doc(db, 'houses', houseId, 'members', uid))
      } catch {
        // Best-effort
      }
    }

    // 6. Delete user profile doc
    try {
      await deleteDoc(doc(db, 'users', uid))
    } catch {
      // Best-effort
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInEmail, signUpEmail, signInGoogle, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
