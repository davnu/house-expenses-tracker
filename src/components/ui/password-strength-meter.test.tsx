import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PasswordStrengthMeter } from './password-strength-meter'

describe('PasswordStrengthMeter', () => {
  afterEach(cleanup)

  it('renders nothing when password is empty', () => {
    const { container } = render(<PasswordStrengthMeter password="" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a label and 4 bars when there is a password', () => {
    const { container } = render(<PasswordStrengthMeter password="abc" />)
    expect(screen.getByText(/password strength/i)).toBeDefined()
    // 4 segment bars + 1 wrapper div + 1 label
    const bars = container.querySelectorAll('.h-1')
    expect(bars.length).toBe(4)
  })

  it('labels a weak password as very weak', () => {
    render(<PasswordStrengthMeter password="abc" />)
    expect(screen.getByText(/password strength: very weak/i)).toBeDefined()
  })

  it('labels a strong password accordingly', () => {
    render(<PasswordStrengthMeter password="Abcdefghij1!" />)
    expect(screen.getByText(/password strength: very strong/i)).toBeDefined()
  })

  it('has aria-live so screen readers announce strength changes', () => {
    const { container } = render(<PasswordStrengthMeter password="abc" />)
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
  })
})
