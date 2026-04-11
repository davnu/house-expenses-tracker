import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(cents: number, currency = 'EUR'): string {
  if (isNaN(cents) || !isFinite(cents)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function parseCurrencyInput(value: string): number {
  const num = parseFloat(value)
  if (isNaN(num)) return 0
  return Math.round(num * 100)
}

/** Map Firebase/Firestore error codes to user-friendly messages */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const message = err instanceof Error ? err.message : ''

  // Auth errors
  if (message.includes('user-not-found') || message.includes('invalid-credential')) return 'Invalid email or password'
  if (message.includes('wrong-password')) return 'Invalid email or password'
  if (message.includes('email-already-in-use')) return 'An account with this email already exists'
  if (message.includes('weak-password')) return 'Password must be at least 6 characters'
  if (message.includes('invalid-email')) return 'Invalid email address'
  if (message.includes('too-many-requests')) return 'Too many attempts. Please try again later.'
  if (message.includes('popup-closed')) return 'Sign-in popup was closed'
  if (message.includes('requires-recent-login')) return 'For security, please sign out and sign back in, then try again.'

  // Firestore errors
  if (message.includes('permission-denied') || message.includes('PERMISSION_DENIED')) return 'You don\'t have permission to do this.'
  if (message.includes('not-found') || message.includes('NOT_FOUND')) return 'The requested data was not found.'
  if (message.includes('unavailable') || message.includes('UNAVAILABLE')) return 'Service temporarily unavailable. Please try again.'

  // Storage errors
  if (message.includes('storage/unauthorized')) return 'You don\'t have permission to upload files.'
  if (message.includes('storage/quota-exceeded')) return 'Storage quota exceeded.'

  // Custom app errors (from HouseholdContext)
  if (message.includes('Invite not found')) return 'This invite link is invalid.'
  if (message.includes('Invite already used')) return 'This invite has already been used.'
  if (message.includes('Invite expired')) return 'This invite has expired. Ask for a new one.'
  if (message.includes('storage limit')) return message // already friendly
  if (message.includes('Maximum')) return message // already friendly

  return fallback
}
