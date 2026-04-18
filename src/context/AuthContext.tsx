import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  deleteUser,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc, updateDoc, arrayRemove, collection, query, where, getDocs, writeBatch } from 'firebase/firestore'
import { auth, db } from '@/data/firebase'
import { deleteAttachments } from '@/data/firebase-attachment-store'
import type { CascadeProgressCallback } from '@/hooks/use-cascade-progress'

interface AuthContextValue {
  user: User | null
  loading: boolean
  emailVerified: boolean
  signInEmail: (email: string, password: string) => Promise<void>
  signUpEmail: (email: string, password: string, displayName: string) => Promise<void>
  signInGoogle: () => Promise<void>
  logout: () => Promise<void>
  deleteAccount: (onProgress?: CascadeProgressCallback) => Promise<void>
  resendVerificationEmail: () => Promise<void>
  refreshUser: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  verifyPasswordReset: (oobCode: string) => Promise<string>
  confirmPasswordReset: (oobCode: string, newPassword: string) => Promise<void>
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
  const [emailVerified, setEmailVerified] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setEmailVerified(u?.emailVerified ?? false)
      setLoading(false)
      // Ensure profile exists in the background — don't block the auth gate
      if (u && !deletingAccount) ensureUserProfile(u).catch(() => {})
    })
    return unsubscribe
  }, [])

  const signInEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signUpEmail = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    // Best-effort: if this fails, the verify page lets them resend
    sendEmailVerification(cred.user).catch(() => {})
    await ensureUserProfile(cred.user, displayName, new Date().toISOString())
  }

  const signInGoogle = async () => {
    await signInWithPopup(auth, googleProvider)
  }

  const resendVerificationEmail = useCallback(async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser)
    }
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (err) {
      // Don't reveal whether an account exists (enumeration). All other
      // errors (invalid-email, too-many-requests, network) still surface.
      const code = (err as { code?: string }).code
      if (code === 'auth/user-not-found') return
      throw err
    }
  }, [])

  const verifyPasswordReset = useCallback(async (oobCode: string) => {
    return await verifyPasswordResetCode(auth, oobCode)
  }, [])

  const doConfirmPasswordReset = useCallback(async (oobCode: string, newPassword: string) => {
    await confirmPasswordReset(auth, oobCode, newPassword)
  }, [])

  const refreshUser = useCallback(async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload()
      const verified = auth.currentUser.emailVerified
      // Force-refresh the ID token so Firestore security rules see the updated
      // email_verified claim. reload() only updates the local User object —
      // the JWT sent with Firestore requests still has the old claims until refreshed.
      if (verified) {
        await auth.currentUser.getIdToken(true)
      }
      setEmailVerified(verified)
    }
  }, [])

  const logout = async () => {
    await signOut(auth)
  }

  const BATCH_LIMIT = 500

  /** Cascade-delete a single house: soft-delete first, then cleanup.
   *  Cloud Function (onHouseSoftDeleted) runs the same cascade as a safety net. */
  async function cascadeDeleteHouse(houseId: string) {
    // Soft-delete: mark house as deleted immediately (hides from all members)
    try {
      await updateDoc(doc(db, 'houses', houseId), { deletedAt: new Date().toISOString() })
    } catch {
      // May fail if auth token expired — still try to clean up
    }

    // 1. Delete all attachments from Storage (best-effort)
    try {
      const expensesSnap = await getDocs(collection(db, 'houses', houseId, 'expenses'))
      for (const expDoc of expensesSnap.docs) {
        const attachments = expDoc.data().attachments as Array<{ id: string; name: string }> | undefined
        if (attachments?.length) {
          await deleteAttachments(houseId, attachments)
        }
      }
    } catch {
      // Best-effort
    }

    // 2. Delete all subcollection docs (must happen BEFORE house doc deletion)
    for (const sub of ['expenses', 'recurring', 'meta']) {
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

    // 3. Clear houseId on affected members, then delete member docs
    try {
      const membersSnap = await getDocs(collection(db, 'houses', houseId, 'members'))
      for (const memberDoc of membersSnap.docs) {
        try {
          const profileSnap = await getDoc(doc(db, 'users', memberDoc.id))
          if (profileSnap.exists() && profileSnap.data().houseId === houseId) {
            await updateDoc(doc(db, 'users', memberDoc.id), { houseId: null })
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

    // 4. Delete the house doc
    try {
      await deleteDoc(doc(db, 'houses', houseId))
    } catch {
      // Best-effort
    }
  }

  const deleteAccount = async (onProgress?: CascadeProgressCallback) => {
    if (!user) throw new Error('Not signed in')

    const uid = user.uid

    deletingAccount = true

    // 1. Delete Firebase Auth account FIRST — if this fails (requires-recent-login),
    //    we stop before touching any Firestore data. The auth token remains valid
    //    briefly after deletion, so subsequent Firestore operations still work.
    onProgress?.('auth', 'active')
    await deleteUser(user)
    onProgress?.('auth', 'completed')

    // 2. Cascade-delete all houses the user owns
    onProgress?.('houses', 'active')
    try {
      const ownedSnap = await getDocs(
        query(collection(db, 'houses'), where('ownerId', '==', uid))
      )
      for (const houseDoc of ownedSnap.docs) {
        await cascadeDeleteHouse(houseDoc.id)
      }
    } catch {
      // Best-effort
    }
    onProgress?.('houses', 'completed')

    // 3. Clean up memberships in houses the user doesn't own
    onProgress?.('memberships', 'active')
    try {
      const memberSnap = await getDocs(
        query(collection(db, 'houses'), where('memberIds', 'array-contains', uid))
      )
      for (const houseDoc of memberSnap.docs) {
        try {
          await updateDoc(houseDoc.ref, { memberIds: arrayRemove(uid) })
        } catch { /* Best-effort */ }
        try {
          await deleteDoc(doc(db, 'houses', houseDoc.id, 'members', uid))
        } catch { /* Best-effort */ }
        // Delete user's attachments in this house
        try {
          const expensesSnap = await getDocs(
            query(collection(db, 'houses', houseDoc.id, 'expenses'), where('payer', '==', uid))
          )
          for (const expDoc of expensesSnap.docs) {
            const attachments = expDoc.data().attachments as Array<{ id: string; name: string }> | undefined
            if (attachments?.length) {
              await deleteAttachments(houseDoc.id, attachments)
            }
          }
        } catch { /* Best-effort */ }
      }
    } catch {
      // Best-effort — fall back to profile houseId
      try {
        const profileSnap = await getDoc(doc(db, 'users', uid))
        const houseId = profileSnap.exists() ? profileSnap.data().houseId : null
        if (houseId) {
          await updateDoc(doc(db, 'houses', houseId), { memberIds: arrayRemove(uid) })
          await deleteDoc(doc(db, 'houses', houseId, 'members', uid))
        }
      } catch { /* Best-effort */ }
    }
    onProgress?.('memberships', 'completed')

    // 4. Delete user profile doc
    onProgress?.('profile', 'active')
    try {
      await deleteDoc(doc(db, 'users', uid))
    } catch {
      // Best-effort
    }
    onProgress?.('profile', 'completed')
  }

  return (
    <AuthContext.Provider value={{ user, loading, emailVerified, signInEmail, signUpEmail, signInGoogle, logout, deleteAccount, resendVerificationEmail, refreshUser, sendPasswordReset, verifyPasswordReset, confirmPasswordReset: doConfirmPasswordReset }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
