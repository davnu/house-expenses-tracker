import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

// ── Mocks (hoisted so they're available in vi.mock factories) ──

const { mockAuth, mockUser, mockOnAuthStateChanged } = vi.hoisted(() => {
  const mockUser = {
    uid: 'alice',
    email: 'alice@example.com',
    emailVerified: false,
    displayName: 'Alice',
    reload: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
  }
  const mockAuth = { currentUser: mockUser as typeof mockUser | null }
  const mockOnAuthStateChanged = vi.fn()
  return { mockAuth, mockUser, mockOnAuthStateChanged }
})

vi.mock('@/data/firebase', () => ({
  auth: mockAuth,
  db: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  deleteUser: vi.fn(),
  sendEmailVerification: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => true }),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  arrayRemove: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
}))

vi.mock('@/data/firebase-attachment-store', () => ({
  deleteAttachments: vi.fn(),
}))

// Import after mocks are set up
import { AuthProvider, useAuth } from './AuthContext'

// ── Helpers ───────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

async function setupHook() {
  // Make onAuthStateChanged fire immediately with our mock user
  mockOnAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
    cb(mockUser)
    return vi.fn() // unsubscribe
  })

  const result = renderHook(() => useAuth(), { wrapper })
  await act(async () => {})
  return result
}

// ── Tests ─────────────────────────────────────────────

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.uid = 'alice'
    mockUser.email = 'alice@example.com'
    mockUser.emailVerified = false
    mockUser.displayName = 'Alice'
    mockUser.reload.mockResolvedValue(undefined)
    mockUser.getIdToken.mockResolvedValue('mock-token')
    mockAuth.currentUser = mockUser
  })

  describe('refreshUser', () => {
    it('calls getIdToken(true) to refresh token when email becomes verified', async () => {
      // reload() simulates server returning emailVerified = true
      mockUser.reload.mockImplementation(async () => {
        mockUser.emailVerified = true
      })

      const { result } = await setupHook()

      await act(async () => {
        await result.current.refreshUser()
      })

      expect(mockUser.reload).toHaveBeenCalledOnce()
      expect(mockUser.getIdToken).toHaveBeenCalledWith(true)
      expect(result.current.emailVerified).toBe(true)
    })

    it('does NOT call getIdToken when email is still unverified', async () => {
      // reload() leaves emailVerified as false
      mockUser.reload.mockImplementation(async () => {
        mockUser.emailVerified = false
      })

      const { result } = await setupHook()

      await act(async () => {
        await result.current.refreshUser()
      })

      expect(mockUser.reload).toHaveBeenCalledOnce()
      expect(mockUser.getIdToken).not.toHaveBeenCalled()
      expect(result.current.emailVerified).toBe(false)
    })

    it('is a no-op when auth.currentUser is null', async () => {
      const { result } = await setupHook()

      // Simulate signed-out state after hook is set up
      mockAuth.currentUser = null

      await act(async () => {
        await result.current.refreshUser()
      })

      // No crash, no calls
      expect(mockUser.reload).not.toHaveBeenCalled()
      expect(mockUser.getIdToken).not.toHaveBeenCalled()
    })

    it('propagates getIdToken rejection so callers can handle it', async () => {
      mockUser.reload.mockImplementation(async () => {
        mockUser.emailVerified = true
      })
      mockUser.getIdToken.mockRejectedValue(new Error('network error'))

      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.refreshUser()
        })
      ).rejects.toThrow('network error')
    })
  })
})
