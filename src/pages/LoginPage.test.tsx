import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

// ── Mocks ─────────────────────────────────────────────

const { signInEmailMock, signUpEmailMock, signInGoogleMock, trackMock } = vi.hoisted(() => ({
  signInEmailMock: vi.fn(),
  signUpEmailMock: vi.fn(),
  signInGoogleMock: vi.fn(),
  trackMock: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    signInEmail: signInEmailMock,
    signUpEmail: signUpEmailMock,
    signInGoogle: signInGoogleMock,
  }),
}))

vi.mock('@/hooks/useAnalytics', () => ({ useAnalytics: () => {} }))
vi.mock('@/lib/analytics', () => ({ track: trackMock, isAppRoute: () => false }))

import { LoginPage } from './LoginPage'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  describe('sign-in mode (default)', () => {
    it('renders sign-in form without name or consent fields', () => {
      renderAt('/login')
      expect(screen.getByLabelText(/email/i)).toBeDefined()
      expect(screen.getByLabelText(/password/i)).toBeDefined()
      expect(screen.queryByLabelText(/your name/i)).toBeNull()
      expect(screen.queryByText(/i agree to the/i)).toBeNull()
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDefined()
    })

    it('shows the "Forgot password?" link', () => {
      renderAt('/login')
      expect(screen.getByRole('link', { name: /forgot password/i })).toBeDefined()
    })

    it('does NOT render the password strength meter', async () => {
      const user = userEvent.setup()
      renderAt('/login')
      await user.type(screen.getByLabelText(/password/i), 'anything123')
      expect(screen.queryByText(/password strength/i)).toBeNull()
    })

    it('submit calls signInEmail and fires login analytics', async () => {
      signInEmailMock.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderAt('/login')

      await user.type(screen.getByLabelText(/email/i), 'bob@example.com')
      await user.type(screen.getByLabelText(/password/i), 'secret123')
      await user.click(screen.getByRole('button', { name: /^sign in$/i }))

      await waitFor(() => {
        expect(signInEmailMock).toHaveBeenCalledWith('bob@example.com', 'secret123')
        expect(trackMock).toHaveBeenCalledWith('login_start', { method: 'email' })
        expect(trackMock).toHaveBeenCalledWith('login', { method: 'email' })
      })
    })
  })

  describe('sign-up mode', () => {
    it('signup mode (via query param) renders name + consent', () => {
      renderAt('/login?mode=signup')
      expect(screen.getByLabelText(/your name/i)).toBeDefined()
      expect(screen.getByText(/i agree to the/i)).toBeDefined()
      expect(screen.getByRole('button', { name: /create account/i })).toBeDefined()
    })

    it('hides the "Forgot password?" link in signup mode', () => {
      renderAt('/login?mode=signup')
      expect(screen.queryByRole('link', { name: /forgot password/i })).toBeNull()
    })

    it('renders the password strength meter as the user types', async () => {
      const user = userEvent.setup()
      renderAt('/login?mode=signup')

      expect(screen.queryByText(/password strength/i)).toBeNull()

      await user.type(screen.getByLabelText(/password/i), 'a')
      expect(screen.getByText(/password strength/i)).toBeDefined()
    })

    it('strength meter reflects strong vs weak passwords', async () => {
      const user = userEvent.setup()
      renderAt('/login?mode=signup')

      // Weak password
      await user.type(screen.getByLabelText(/password/i), 'abc')
      expect(screen.getByText(/password strength: very weak/i)).toBeDefined()

      // Upgrade to very strong (needs 12+ chars AND 3+ classes)
      await user.clear(screen.getByLabelText(/password/i))
      await user.type(screen.getByLabelText(/password/i), 'Abcdefghij1!')
      await waitFor(() => expect(screen.getByText(/password strength: very strong/i)).toBeDefined())
    })

    it('enforces minLength=8 on the password input in signup mode', () => {
      renderAt('/login?mode=signup')
      const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement
      expect(passwordInput.minLength).toBe(8)
      expect(passwordInput.autocomplete).toBe('new-password')
    })

    it('submit is blocked until the privacy-consent checkbox is ticked', async () => {
      const user = userEvent.setup()
      renderAt('/login?mode=signup')

      await user.type(screen.getByLabelText(/your name/i), 'Alice')
      await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
      await user.type(screen.getByLabelText(/password/i), 'longpass123')

      expect((screen.getByRole('button', { name: /create account/i }) as HTMLButtonElement).disabled).toBe(true)

      await user.click(screen.getByRole('checkbox'))

      expect((screen.getByRole('button', { name: /create account/i }) as HTMLButtonElement).disabled).toBe(false)
    })

    it('submit calls signUpEmail with displayName and fires signup analytics', async () => {
      signUpEmailMock.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderAt('/login?mode=signup')

      await user.type(screen.getByLabelText(/your name/i), 'Alice')
      await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
      await user.type(screen.getByLabelText(/password/i), 'longpass123')
      await user.click(screen.getByRole('checkbox'))
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(signUpEmailMock).toHaveBeenCalledWith('alice@example.com', 'longpass123', 'Alice')
        expect(trackMock).toHaveBeenCalledWith('signup_start', { method: 'email' })
        expect(trackMock).toHaveBeenCalledWith('sign_up', expect.objectContaining({ method: 'email' }))
      })
    })
  })

  describe('mode toggle', () => {
    it('toggles from sign-in to sign-up via the footer link, resetting consent and error', async () => {
      signInEmailMock.mockRejectedValue(
        Object.assign(new Error('auth/invalid-credential'), { code: 'auth/invalid-credential' }),
      )
      const user = userEvent.setup()
      renderAt('/login')

      // Trigger an error first
      await user.type(screen.getByLabelText(/email/i), 'bob@example.com')
      await user.type(screen.getByLabelText(/password/i), 'wrongpass')
      await user.click(screen.getByRole('button', { name: /^sign in$/i }))
      await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeDefined())

      // Toggle to signup — error should clear, and the name + consent fields should appear
      await user.click(screen.getByRole('button', { name: /sign up/i }))
      expect(screen.getByLabelText(/your name/i)).toBeDefined()
      expect(screen.queryByText(/invalid email or password/i)).toBeNull()
    })
  })

  describe('Google sign-in', () => {
    it('calls signInGoogle and tracks analytics', async () => {
      signInGoogleMock.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderAt('/login')

      await user.click(screen.getByRole('button', { name: /continue with google/i }))

      await waitFor(() => {
        expect(signInGoogleMock).toHaveBeenCalledOnce()
        expect(trackMock).toHaveBeenCalledWith('login_start', { method: 'google' })
        expect(trackMock).toHaveBeenCalledWith('login', { method: 'google' })
      })
    })

    it('shows friendly error on Google popup-closed', async () => {
      signInGoogleMock.mockRejectedValue(
        Object.assign(new Error('auth/popup-closed-by-user'), { code: 'auth/popup-closed-by-user' }),
      )
      const user = userEvent.setup()
      renderAt('/login')

      await user.click(screen.getByRole('button', { name: /continue with google/i }))
      await waitFor(() => expect(screen.getByText(/popup was closed/i)).toBeDefined())
    })
  })
})
