import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

// ── Mocks ─────────────────────────────────────────────

const { sendPasswordResetMock, trackMock } = vi.hoisted(() => ({
  sendPasswordResetMock: vi.fn(),
  trackMock: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ sendPasswordReset: sendPasswordResetMock }),
}))

vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => {},
}))

vi.mock('@/lib/analytics', () => ({
  track: trackMock,
  isAppRoute: () => false,
}))

import { ForgotPasswordPage } from './ForgotPasswordPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })
  afterEach(cleanup)

  it('renders the email form by default', () => {
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeDefined()
  })

  it('submitting calls sendPasswordReset with the email and fires analytics', async () => {
    sendPasswordResetMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'bob@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(sendPasswordResetMock).toHaveBeenCalledWith('bob@example.com')
      expect(trackMock).toHaveBeenCalledWith('password_reset_request')
    })
  })

  it('shows success state with the email after successful submit', async () => {
    sendPasswordResetMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'bob@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeDefined()
      expect(screen.getByText(/bob@example\.com/)).toBeDefined()
    })
  })

  it('shows a friendly error on rate-limit rejection', async () => {
    sendPasswordResetMock.mockRejectedValue(
      Object.assign(new Error('Firebase: Error (auth/too-many-requests).'), {
        code: 'auth/too-many-requests',
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'bob@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByText(/too many attempts/i)).toBeDefined()
    })
    // Cooldown should NOT start on failure — button remains enabled
    expect(screen.getByRole('button', { name: /send reset link/i })).not.toHaveProperty('disabled', true)
  })

  it('starts cooldown after success so the same email can\'t be re-sent instantly', async () => {
    sendPasswordResetMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'bob@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeDefined())

    // Return to the form — cooldown must still be active
    await user.click(screen.getByRole('button', { name: /use a different email/i }))

    const cooldownBtn = screen.getByRole('button', { name: /resend in/i }) as HTMLButtonElement
    expect(cooldownBtn.disabled).toBe(true)
  })

  it('"Use a different email" returns to the form', async () => {
    sendPasswordResetMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'bob@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeDefined())

    await user.click(screen.getByRole('button', { name: /use a different email/i }))

    expect(screen.getByLabelText(/email/i)).toBeDefined()
  })

  it('shows a back-to-login link', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeDefined()
  })
})
