import { describe, it, expect } from 'vitest'
import { formatCurrency, parseCurrencyInput, friendlyError } from './utils'

describe('formatCurrency', () => {
  it('formats cents to currency string', () => {
    expect(formatCurrency(150000)).toBe('€1,500.00')
  })

  it('returns dash for NaN', () => {
    expect(formatCurrency(NaN)).toBe('—')
  })

  it('returns dash for Infinity', () => {
    expect(formatCurrency(Infinity)).toBe('—')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('€0.00')
  })
})

describe('parseCurrencyInput', () => {
  it('parses valid number to cents', () => {
    expect(parseCurrencyInput('15.50')).toBe(1550)
  })

  it('returns 0 for empty string', () => {
    expect(parseCurrencyInput('')).toBe(0)
  })

  it('returns 0 for non-numeric', () => {
    expect(parseCurrencyInput('abc')).toBe(0)
  })

  it('rounds to nearest cent', () => {
    expect(parseCurrencyInput('10.999')).toBe(1100)
  })
})

describe('friendlyError', () => {
  // Auth errors
  it('maps user-not-found to friendly message', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/user-not-found).'))).toBe('Invalid email or password')
  })

  it('maps invalid-credential to friendly message', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/invalid-credential).'))).toBe('Invalid email or password')
  })

  it('maps wrong-password to friendly message', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/wrong-password).'))).toBe('Invalid email or password')
  })

  it('maps email-already-in-use', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/email-already-in-use).'))).toBe('An account with this email already exists')
  })

  it('maps weak-password', () => {
    expect(friendlyError(new Error('Firebase: Password should be at least 6 characters (auth/weak-password).'))).toBe('Password must be at least 6 characters')
  })

  it('maps invalid-email', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/invalid-email).'))).toBe('Invalid email address')
  })

  it('maps too-many-requests', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/too-many-requests).'))).toBe('Too many attempts. Please try again later.')
  })

  it('maps requires-recent-login', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/requires-recent-login).'))).toBe('For security, please sign out and sign back in, then try again.')
  })

  it('maps popup-closed', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/popup-closed-by-user).'))).toBe('Sign-in popup was closed')
  })

  // Firestore errors
  it('maps permission-denied', () => {
    expect(friendlyError(new Error('PERMISSION_DENIED'))).toBe("You don't have permission to do this.")
  })

  it('maps not-found', () => {
    expect(friendlyError(new Error('NOT_FOUND: document not found'))).toBe('The requested data was not found.')
  })

  it('maps unavailable', () => {
    expect(friendlyError(new Error('UNAVAILABLE: service down'))).toBe('Service temporarily unavailable. Please try again.')
  })

  // Storage errors
  it('maps storage/unauthorized', () => {
    expect(friendlyError(new Error('Firebase Storage: User does not have permission (storage/unauthorized).'))).toBe("You don't have permission to upload files.")
  })

  // Custom app errors
  it('passes through invite errors', () => {
    expect(friendlyError(new Error('Invite not found'))).toBe('This invite link is invalid.')
  })

  it('passes through invite expired', () => {
    expect(friendlyError(new Error('Invite expired'))).toBe('This invite has expired. Ask for a new one.')
  })

  it('passes through storage limit messages', () => {
    expect(friendlyError(new Error('Household storage limit reached'))).toBe('Household storage limit reached')
  })

  it('passes through Maximum messages', () => {
    expect(friendlyError(new Error('Maximum 10 files per expense'))).toBe('Maximum 10 files per expense')
  })

  // Fallback
  it('uses fallback for unknown errors', () => {
    expect(friendlyError(new Error('some random error'))).toBe('Something went wrong. Please try again.')
  })

  it('uses custom fallback', () => {
    expect(friendlyError(new Error('random'), 'Custom fallback')).toBe('Custom fallback')
  })

  it('handles non-Error objects', () => {
    expect(friendlyError('string error')).toBe('Something went wrong. Please try again.')
  })

  it('handles null/undefined', () => {
    expect(friendlyError(null)).toBe('Something went wrong. Please try again.')
    expect(friendlyError(undefined)).toBe('Something went wrong. Please try again.')
  })
})
