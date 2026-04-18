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
  sendPasswordResetEmail: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
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
import {
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from 'firebase/auth'

const sendPasswordResetEmailMock = vi.mocked(sendPasswordResetEmail)
const verifyPasswordResetCodeMock = vi.mocked(verifyPasswordResetCode)
const confirmPasswordResetMock = vi.mocked(confirmPasswordReset)

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

  describe('sendPasswordReset', () => {
    it('calls Firebase sendPasswordResetEmail with just the email (no continueUrl)', async () => {
      sendPasswordResetEmailMock.mockResolvedValue(undefined)
      const { result } = await setupHook()

      await act(async () => {
        await result.current.sendPasswordReset('bob@example.com')
      })

      expect(sendPasswordResetEmailMock).toHaveBeenCalledOnce()
      expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(mockAuth, 'bob@example.com')
    })

    it('silently succeeds on auth/user-not-found to prevent email enumeration', async () => {
      const err = Object.assign(new Error('Firebase: Error (auth/user-not-found).'), {
        code: 'auth/user-not-found',
      })
      sendPasswordResetEmailMock.mockRejectedValue(err)
      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.sendPasswordReset('nobody@example.com')
        }),
      ).resolves.toBeUndefined()
    })

    it('propagates other Firebase errors (e.g. invalid-email) using error.code', async () => {
      const err = Object.assign(new Error('Firebase: Error (auth/invalid-email).'), {
        code: 'auth/invalid-email',
      })
      sendPasswordResetEmailMock.mockRejectedValue(err)
      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.sendPasswordReset('not-an-email')
        }),
      ).rejects.toMatchObject({ code: 'auth/invalid-email' })
    })

    it('propagates too-many-requests rate-limit errors', async () => {
      const err = Object.assign(new Error('Firebase: Error (auth/too-many-requests).'), {
        code: 'auth/too-many-requests',
      })
      sendPasswordResetEmailMock.mockRejectedValue(err)
      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.sendPasswordReset('bob@example.com')
        }),
      ).rejects.toMatchObject({ code: 'auth/too-many-requests' })
    })

    it('does NOT swallow user-not-found if the error has no code (defensive)', async () => {
      // If Firebase changes error shape, we must fail loud rather than leak silently.
      sendPasswordResetEmailMock.mockRejectedValue(
        new Error('Firebase: Error (auth/user-not-found).'),
      )
      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.sendPasswordReset('nobody@example.com')
        }),
      ).rejects.toThrow('user-not-found')
    })
  })

  describe('verifyPasswordReset', () => {
    it('returns the email associated with the oobCode', async () => {
      verifyPasswordResetCodeMock.mockResolvedValue('bob@example.com')
      const { result } = await setupHook()

      let email: string | undefined
      await act(async () => {
        email = await result.current.verifyPasswordReset('valid-code')
      })

      expect(verifyPasswordResetCodeMock).toHaveBeenCalledWith(mockAuth, 'valid-code')
      expect(email).toBe('bob@example.com')
    })

    it('propagates expired-action-code errors so the UI can show a friendly message', async () => {
      verifyPasswordResetCodeMock.mockRejectedValue(
        new Error('Firebase: Error (auth/expired-action-code).'),
      )
      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.verifyPasswordReset('expired-code')
        }),
      ).rejects.toThrow('expired-action-code')
    })
  })

  describe('confirmPasswordReset', () => {
    it('finalizes the reset with the oobCode and new password', async () => {
      confirmPasswordResetMock.mockResolvedValue(undefined)
      const { result } = await setupHook()

      await act(async () => {
        await result.current.confirmPasswordReset('valid-code', 'newPass123')
      })

      expect(confirmPasswordResetMock).toHaveBeenCalledWith(
        mockAuth,
        'valid-code',
        'newPass123',
      )
    })

    it('propagates weak-password errors', async () => {
      confirmPasswordResetMock.mockRejectedValue(
        new Error('Firebase: Error (auth/weak-password).'),
      )
      const { result } = await setupHook()

      await expect(
        act(async () => {
          await result.current.confirmPasswordReset('valid-code', 'abc')
        }),
      ).rejects.toThrow('weak-password')
    })
  })
})
