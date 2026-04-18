import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

// ── Mocks ─────────────────────────────────────────────

const {
  verifyPasswordResetMock,
  confirmPasswordResetMock,
  logoutMock,
  trackMock,
  navigateMock,
} = vi.hoisted(() => ({
  verifyPasswordResetMock: vi.fn(),
  confirmPasswordResetMock: vi.fn(),
  logoutMock: vi.fn().mockResolvedValue(undefined),
  trackMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    verifyPasswordReset: verifyPasswordResetMock,
    confirmPasswordReset: confirmPasswordResetMock,
    logout: logoutMock,
  }),
}))

vi.mock('@/hooks/useAnalytics', () => ({ useAnalytics: () => {} }))
vi.mock('@/lib/analytics', () => ({ track: trackMock, isAppRoute: () => false }))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

import { AuthActionPage } from './AuthActionPage'

function renderWith(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/auth/action${search}`]}>
      <AuthActionPage />
    </MemoryRouter>,
  )
}

describe('AuthActionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(cleanup)

  describe('mode dispatch', () => {
    it('shows invalid state for unknown mode', () => {
      renderWith('?mode=bogus')
      expect(screen.getByText(/link can't be used/i)).toBeDefined()
    })

    it('shows invalid state with no mode', () => {
      renderWith('')
      expect(screen.getByText(/link can't be used/i)).toBeDefined()
    })
  })

  describe('resetPassword mode', () => {
    it('marks the link invalid when oobCode is missing', async () => {
      renderWith('?mode=resetPassword')
      await waitFor(() => {
        expect(screen.getByText(/link can't be used/i)).toBeDefined()
      })
      expect(verifyPasswordResetMock).not.toHaveBeenCalled()
    })

    it('verifies the oobCode and shows the form with the target email', async () => {
      verifyPasswordResetMock.mockResolvedValue('alice@example.com')
      renderWith('?mode=resetPassword&oobCode=abc123')

      await waitFor(() => {
        expect(verifyPasswordResetMock).toHaveBeenCalledWith('abc123')
        expect(screen.getByLabelText(/new password/i)).toBeDefined()
        expect(screen.getByText(/alice@example\.com/)).toBeDefined()
      })
    })

    it('shows an invalid-link error when verify fails with expired-action-code', async () => {
      verifyPasswordResetMock.mockRejectedValue(
        Object.assign(new Error('Firebase: Error (auth/expired-action-code).'), {
          code: 'auth/expired-action-code',
        }),
      )
      renderWith('?mode=resetPassword&oobCode=expired')

      await waitFor(() => {
        expect(screen.getByText(/link can't be used/i)).toBeDefined()
        expect(screen.getByText(/expired/i)).toBeDefined()
      })
    })

    it('disables submit until the password is long enough AND matches confirm', async () => {
      verifyPasswordResetMock.mockResolvedValue('alice@example.com')
      const user = userEvent.setup()
      renderWith('?mode=resetPassword&oobCode=abc123')

      await waitFor(() => screen.getByLabelText(/new password/i))

      const submit = screen.getByRole('button', { name: /update password/i }) as HTMLButtonElement
      expect(submit.disabled).toBe(true)

      // 7 chars — too short
      await user.type(screen.getByLabelText(/new password/i), 'short12')
      await user.type(screen.getByLabelText(/confirm password/i), 'short12')
      expect(submit.disabled).toBe(true)

      // 8 chars but confirm mismatches
      await user.clear(screen.getByLabelText(/new password/i))
      await user.clear(screen.getByLabelText(/confirm password/i))
      await user.type(screen.getByLabelText(/new password/i), 'longenough1')
      await user.type(screen.getByLabelText(/confirm password/i), 'different12')
      expect(submit.disabled).toBe(true)
      expect(screen.getByText(/passwords don't match/i)).toBeDefined()

      // Valid — long enough AND matching
      await user.clear(screen.getByLabelText(/confirm password/i))
      await user.type(screen.getByLabelText(/confirm password/i), 'longenough1')
      expect(submit.disabled).toBe(false)
    })

    it('toggles password visibility on both fields via single control', async () => {
      verifyPasswordResetMock.mockResolvedValue('alice@example.com')
      const user = userEvent.setup()
      renderWith('?mode=resetPassword&oobCode=abc123')

      await waitFor(() => screen.getByLabelText(/new password/i))

      const newInput = screen.getByLabelText(/new password/i) as HTMLInputElement
      const confirmInput = screen.getByLabelText(/confirm password/i) as HTMLInputElement
      expect(newInput.type).toBe('password')
      expect(confirmInput.type).toBe('password')

      await user.click(screen.getByRole('button', { name: /show password/i }))

      expect(newInput.type).toBe('text')
      expect(confirmInput.type).toBe('text')
    })

    it('shows strength meter once typing begins', async () => {
      verifyPasswordResetMock.mockResolvedValue('alice@example.com')
      const user = userEvent.setup()
      renderWith('?mode=resetPassword&oobCode=abc123')

      await waitFor(() => screen.getByLabelText(/new password/i))

      expect(screen.queryByText(/password strength/i)).toBeNull()

      await user.type(screen.getByLabelText(/new password/i), 'a')
      expect(screen.getByText(/password strength/i)).toBeDefined()
    })

    it('successful submit calls confirmPasswordReset, logs out, and shows success', async () => {
      verifyPasswordResetMock.mockResolvedValue('alice@example.com')
      confirmPasswordResetMock.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderWith('?mode=resetPassword&oobCode=abc123')

      await waitFor(() => screen.getByLabelText(/new password/i))

      await user.type(screen.getByLabelText(/new password/i), 'Strong-Pass-1')
      await user.type(screen.getByLabelText(/confirm password/i), 'Strong-Pass-1')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      await waitFor(() => {
        expect(confirmPasswordResetMock).toHaveBeenCalledWith('abc123', 'Strong-Pass-1')
        expect(logoutMock).toHaveBeenCalledOnce()
        expect(trackMock).toHaveBeenCalledWith('password_reset_complete')
        expect(screen.getByText(/password updated/i)).toBeDefined()
      })
    })

    it('does not auto-navigate away on success (user clicks Continue)', async () => {
      verifyPasswordResetMock.mockResolvedValue('alice@example.com')
      confirmPasswordResetMock.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderWith('?mode=resetPassword&oobCode=abc123')

      await waitFor(() => screen.getByLabelText(/new password/i))
      await user.type(screen.getByLabelText(/new password/i), 'Strong-Pass-1')
      await user.type(screen.getByLabelText(/confirm password/i), 'Strong-Pass-1')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      await waitFor(() => screen.getByText(/password updated/i))

      // Navigate must only have been called when the user clicked Continue
      expect(navigateMock).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: /continue to sign in/i }))
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true })
    })

    it('shows a friendly error when confirm fails and re-enables the form', async () => {
      verifyPasswordResetMock.mockResolvedValue('alice@example.com')
      confirmPasswordResetMock.mockRejectedValue(
        Object.assign(new Error('Firebase: Error (auth/weak-password).'), {
          code: 'auth/weak-password',
        }),
      )
      const user = userEvent.setup()
      renderWith('?mode=resetPassword&oobCode=abc123')

      await waitFor(() => screen.getByLabelText(/new password/i))
      await user.type(screen.getByLabelText(/new password/i), 'abcdefgh')
      await user.type(screen.getByLabelText(/confirm password/i), 'abcdefgh')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      await waitFor(() => {
        expect(screen.getByText(/at least 6 characters/i)).toBeDefined()
      })
      expect((screen.getByRole('button', { name: /update password/i }) as HTMLButtonElement).disabled).toBe(false)
    })
  })
})
