import { describe, it, expect } from 'vitest'
import { formatCurrency, parseCurrencyInput, friendlyError, stripInvalid } from './utils'

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

  it('maps expired-action-code to a reset-specific message', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/expired-action-code).'))).toBe('This password reset link has expired. Request a new one below.')
  })

  it('maps invalid-action-code to a reset-specific message', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/invalid-action-code).'))).toBe('This password reset link is invalid or has already been used.')
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
  it('maps storage/unauthorized to a specific hint about size and type', () => {
    // The old copy ("You don't have permission to upload files") was misleading:
    // the 403 usually means size > 25 MB or an unsupported type, not auth.
    const msg = friendlyError(new Error('Firebase Storage: User does not have permission (storage/unauthorized).'))
    expect(msg).toMatch(/25 MB/)
    expect(msg).toMatch(/image|PDF|type/i)
    expect(msg.toLowerCase()).not.toContain("don't have permission")
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

describe('stripInvalid', () => {
  it('removes undefined values from flat object', () => {
    expect(stripInvalid({ a: 1, b: undefined, c: 'hello' })).toEqual({ a: 1, c: 'hello' })
  })

  it('removes NaN values from flat object', () => {
    expect(stripInvalid({ a: 1, b: NaN, c: 3 })).toEqual({ a: 1, c: 3 })
  })

  it('removes both undefined and NaN', () => {
    expect(stripInvalid({ a: undefined, b: NaN, c: 'ok' })).toEqual({ c: 'ok' })
  })

  it('keeps null values (Firestore accepts null)', () => {
    expect(stripInvalid({ a: null, b: 1 })).toEqual({ a: null, b: 1 })
  })

  it('keeps zero, empty string, and false', () => {
    expect(stripInvalid({ a: 0, b: '', c: false })).toEqual({ a: 0, b: '', c: false })
  })

  it('strips nested objects recursively', () => {
    const input = { a: 1, nested: { b: undefined, c: 2, deep: { d: NaN, e: 'ok' } } }
    expect(stripInvalid(input)).toEqual({ a: 1, nested: { c: 2, deep: { e: 'ok' } } })
  })

  it('strips inside arrays', () => {
    const input = { items: [{ a: 1, b: undefined }, { c: NaN, d: 'ok' }] }
    expect(stripInvalid(input)).toEqual({ items: [{ a: 1 }, { d: 'ok' }] })
  })

  it('handles empty object', () => {
    expect(stripInvalid({})).toEqual({})
  })

  it('handles empty array', () => {
    expect(stripInvalid([])).toEqual([])
  })

  it('passes through primitives unchanged', () => {
    expect(stripInvalid(42)).toBe(42)
    expect(stripInvalid('hello')).toBe('hello')
    expect(stripInvalid(true)).toBe(true)
    expect(stripInvalid(null)).toBe(null)
  })

  it('handles real-world expense data', () => {
    const expense = {
      amount: 15000,
      category: 'notary',
      payer: 'uid123',
      description: undefined,
      date: '2025-06-01',
      attachments: [{ id: 'a1', name: 'receipt.pdf', size: NaN, url: 'https://...' }],
    }
    const result = stripInvalid(expense)
    expect(result).toEqual({
      amount: 15000,
      category: 'notary',
      payer: 'uid123',
      date: '2025-06-01',
      attachments: [{ id: 'a1', name: 'receipt.pdf', url: 'https://...' }],
    })
    expect('description' in result).toBe(false)
  })

  it('handles object with all invalid values', () => {
    expect(stripInvalid({ a: undefined, b: NaN })).toEqual({})
  })
})
