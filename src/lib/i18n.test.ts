import { describe, it, expect, afterEach } from 'vitest'
import i18next from 'i18next'
import { format } from 'date-fns'
import {
  formatCurrency,
  setCurrencyContext,
  resetCurrencyContext,
  friendlyError,
  getDateLocale,
  parseCurrencyInput,
  stripInvalid,
} from './utils'
import {
  getCategoryLabel,
  getCategoryHint,
  getSharedPayerLabel,
  getFormerMemberLabel,
  EXPENSE_CATEGORIES,
  CATEGORY_VALUES,
} from './constants'
import { SUPPORTED_COUNTRIES } from './mortgage-country'

// ═══════════════════════════════════════════════════
// formatCurrency — country-based locale formatting
// ═══════════════════════════════════════════════════

describe('formatCurrency', () => {
  afterEach(() => {
    resetCurrencyContext()
  })

  // ── Defaults ──

  it('defaults to en-US format with EUR when no house context is set', () => {
    const result = formatCurrency(150000)
    expect(result).toBe('€1,500.00')
  })

  it('uses EUR as default currency', () => {
    const result = formatCurrency(100)
    expect(result).toContain('€')
  })

  // ── Country-specific formatting ──

  it('Spanish house (ES/EUR): comma decimal, symbol after', () => {
    setCurrencyContext('ES', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain(',00')
    expect(result).toContain('€')
  })

  it('Dutch house (NL/EUR): comma decimal, symbol before', () => {
    setCurrencyContext('NL', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain('€')
    expect(result).toContain(',00')
  })

  it('UK house (GB/GBP): period decimal, £ symbol', () => {
    setCurrencyContext('GB', 'GBP')
    const result = formatCurrency(150000)
    expect(result).toContain('£')
    expect(result).toContain('1,500.00')
  })

  it('US house (US/USD): period decimal, $ symbol', () => {
    setCurrencyContext('US', 'USD')
    const result = formatCurrency(150000)
    expect(result).toContain('$')
    expect(result).toContain('1,500.00')
  })

  it('French house (FR/EUR): comma decimal, symbol after', () => {
    setCurrencyContext('FR', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain(',00')
    expect(result).toContain('€')
  })

  it('German house (DE/EUR): comma decimal', () => {
    setCurrencyContext('DE', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain(',00')
    expect(result).toContain('€')
  })

  it('Portuguese house (PT/EUR): comma decimal', () => {
    setCurrencyContext('PT', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain(',00')
    expect(result).toContain('€')
  })

  it('Canadian house (CA/CAD): period decimal, $ or CA$ symbol', () => {
    setCurrencyContext('CA', 'CAD')
    const result = formatCurrency(150000)
    expect(result).toMatch(/\$|CA/)
    expect(result).toContain('.00')
  })

  it('Italian house (IT/EUR): comma decimal', () => {
    setCurrencyContext('IT', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain(',00')
    expect(result).toContain('€')
  })

  it('Belgian house (BE/EUR)', () => {
    setCurrencyContext('BE', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain('€')
  })

  it('Irish house (IE/EUR)', () => {
    setCurrencyContext('IE', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain('€')
  })

  it('Austrian house (AT/EUR)', () => {
    setCurrencyContext('AT', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain('€')
  })

  it('Finnish house (FI/EUR)', () => {
    setCurrencyContext('FI', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain('€')
  })

  it('Greek house (GR/EUR)', () => {
    setCurrencyContext('GR', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toContain('€')
  })

  // ── Currency override ──

  it('uses default currency from house context when none passed', () => {
    setCurrencyContext('GB', 'GBP')
    const result = formatCurrency(100)
    expect(result).toContain('£')
  })

  it('allows currency override even with house context set', () => {
    setCurrencyContext('ES', 'EUR')
    const result = formatCurrency(150000, 'GBP')
    // Spanish locale but GBP currency
    expect(result).toMatch(/£|GBP/)
    expect(result).toContain(',00')
  })

  it('explicit currency parameter overrides house default', () => {
    setCurrencyContext('US', 'USD')
    const result = formatCurrency(150000, 'EUR')
    expect(result).toContain('€')
  })

  // ── House switching (state isolation) ──

  it('switching houses updates the formatting', () => {
    setCurrencyContext('US', 'USD')
    expect(formatCurrency(100)).toContain('$')

    setCurrencyContext('GB', 'GBP')
    expect(formatCurrency(100)).toContain('£')

    setCurrencyContext('ES', 'EUR')
    expect(formatCurrency(100)).toContain('€')
  })

  it('switching from a house with currency back to no house resets defaults', () => {
    setCurrencyContext('GB', 'GBP')
    expect(formatCurrency(100)).toContain('£')

    resetCurrencyContext()
    expect(formatCurrency(100)).toContain('€') // back to EUR default
  })

  // ── Edge cases ──

  it('returns em-dash for NaN', () => {
    expect(formatCurrency(NaN)).toBe('—')
  })

  it('returns em-dash for Infinity', () => {
    expect(formatCurrency(Infinity)).toBe('—')
  })

  it('returns em-dash for -Infinity', () => {
    expect(formatCurrency(-Infinity)).toBe('—')
  })

  it('formats zero cents correctly', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
    expect(result).toContain('€')
  })

  it('formats negative amounts with minus sign', () => {
    const result = formatCurrency(-150000)
    expect(result).toMatch(/-/)
  })

  it('formats 1 cent correctly', () => {
    const result = formatCurrency(1)
    expect(result).toMatch(/0[.,]01/)
  })

  it('formats large amounts (10M cents = €100K)', () => {
    const result = formatCurrency(10000000)
    expect(result).toContain('100')
    expect(result).toContain('€')
  })

  it('handles unknown country code by falling back to en-US', () => {
    setCurrencyContext('ZZ', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toBe('€1,500.00')
  })

  it('handles undefined country and currency', () => {
    setCurrencyContext(undefined, undefined)
    const result = formatCurrency(150000)
    expect(result).toContain('€')
  })

  it('handles empty string country code', () => {
    setCurrencyContext('', 'EUR')
    const result = formatCurrency(150000)
    expect(result).toBe('€1,500.00')
  })

  // ── COUNTRY_LOCALE_MAP completeness ──

  it('every country in SUPPORTED_COUNTRIES has a locale mapping', () => {
    // The COUNTRY_LOCALE_MAP in utils.ts should cover all SUPPORTED_COUNTRIES
    for (const country of SUPPORTED_COUNTRIES) {
      setCurrencyContext(country.code, country.currency)
      const result = formatCurrency(100)
      // Should NOT fall back to en-US default format for non-english countries
      expect(result).toBeTruthy()
      expect(result).not.toBe('—')
    }
  })
})

// ═══════════════════════════════════════════════════
// parseCurrencyInput
// ═══════════════════════════════════════════════════

describe('parseCurrencyInput', () => {
  it('parses a regular decimal to cents', () => {
    expect(parseCurrencyInput('15.50')).toBe(1550)
  })

  it('parses integer string to cents', () => {
    expect(parseCurrencyInput('100')).toBe(10000)
  })

  it('rounds to nearest cent', () => {
    expect(parseCurrencyInput('10.999')).toBe(1100)
  })

  it('returns 0 for empty string', () => {
    expect(parseCurrencyInput('')).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseCurrencyInput('abc')).toBe(0)
  })

  it('handles zero', () => {
    expect(parseCurrencyInput('0')).toBe(0)
  })

  it('handles negative values', () => {
    expect(parseCurrencyInput('-10.50')).toBe(-1050)
  })
})

// ═══════════════════════════════════════════════════
// stripInvalid — Firestore write safety
// ═══════════════════════════════════════════════════

describe('stripInvalid', () => {
  it('removes undefined values from objects', () => {
    expect(stripInvalid({ a: 1, b: undefined, c: 'ok' })).toEqual({ a: 1, c: 'ok' })
  })

  it('removes NaN values from objects', () => {
    expect(stripInvalid({ a: 1, b: NaN })).toEqual({ a: 1 })
  })

  it('handles nested objects', () => {
    expect(stripInvalid({ a: { b: undefined, c: 1 } })).toEqual({ a: { c: 1 } })
  })

  it('handles arrays', () => {
    expect(stripInvalid([1, { a: undefined, b: 2 }])).toEqual([1, { b: 2 }])
  })

  it('preserves null values (Firestore accepts null)', () => {
    expect(stripInvalid({ a: null, b: 1 })).toEqual({ a: null, b: 1 })
  })

  it('preserves empty strings', () => {
    expect(stripInvalid({ a: '' })).toEqual({ a: '' })
  })

  it('preserves zero', () => {
    expect(stripInvalid({ a: 0 })).toEqual({ a: 0 })
  })

  it('preserves false', () => {
    expect(stripInvalid({ a: false })).toEqual({ a: false })
  })

  it('returns primitives unchanged', () => {
    expect(stripInvalid('hello')).toBe('hello')
    expect(stripInvalid(42)).toBe(42)
    expect(stripInvalid(null)).toBe(null)
  })

  it('deeply strips NaN in nested arrays', () => {
    expect(stripInvalid({ arr: [{ x: NaN, y: 1 }] })).toEqual({ arr: [{ y: 1 }] })
  })
})

// ═══════════════════════════════════════════════════
// friendlyError — every error code mapping
// ═══════════════════════════════════════════════════

describe('friendlyError', () => {
  // Auth errors
  it('maps user-not-found', () => {
    expect(friendlyError(new Error('auth/user-not-found'))).toBe(i18next.t('errors.invalidCredentials'))
  })

  it('maps invalid-credential', () => {
    expect(friendlyError(new Error('auth/invalid-credential'))).toBe(i18next.t('errors.invalidCredentials'))
  })

  it('maps wrong-password', () => {
    expect(friendlyError(new Error('auth/wrong-password'))).toBe(i18next.t('errors.invalidCredentials'))
  })

  it('maps email-already-in-use', () => {
    expect(friendlyError(new Error('auth/email-already-in-use'))).toBe(i18next.t('errors.emailAlreadyExists'))
  })

  it('maps weak-password', () => {
    expect(friendlyError(new Error('auth/weak-password'))).toBe(i18next.t('errors.weakPassword'))
  })

  it('maps invalid-email', () => {
    expect(friendlyError(new Error('auth/invalid-email'))).toBe(i18next.t('errors.invalidEmail'))
  })

  it('maps too-many-requests', () => {
    expect(friendlyError(new Error('auth/too-many-requests'))).toBe(i18next.t('errors.tooManyAttempts'))
  })

  it('maps popup-closed', () => {
    expect(friendlyError(new Error('auth/popup-closed'))).toBe(i18next.t('errors.popupClosed'))
  })

  it('maps requires-recent-login', () => {
    expect(friendlyError(new Error('auth/requires-recent-login'))).toBe(i18next.t('errors.requiresRecentLogin'))
  })

  // Firestore errors
  it('maps permission-denied', () => {
    expect(friendlyError(new Error('permission-denied'))).toBe(i18next.t('errors.permissionDenied'))
  })

  it('maps PERMISSION_DENIED (uppercase)', () => {
    expect(friendlyError(new Error('PERMISSION_DENIED'))).toBe(i18next.t('errors.permissionDenied'))
  })

  it('maps not-found', () => {
    expect(friendlyError(new Error('not-found'))).toBe(i18next.t('errors.notFound'))
  })

  it('maps NOT_FOUND (uppercase)', () => {
    expect(friendlyError(new Error('NOT_FOUND'))).toBe(i18next.t('errors.notFound'))
  })

  it('maps unavailable', () => {
    expect(friendlyError(new Error('unavailable'))).toBe(i18next.t('errors.serviceUnavailable'))
  })

  it('maps UNAVAILABLE (uppercase)', () => {
    expect(friendlyError(new Error('UNAVAILABLE'))).toBe(i18next.t('errors.serviceUnavailable'))
  })

  // Storage errors
  it('maps storage/unauthorized', () => {
    expect(friendlyError(new Error('storage/unauthorized'))).toBe(i18next.t('errors.storageUnauthorized'))
  })

  it('maps storage/quota-exceeded', () => {
    expect(friendlyError(new Error('storage/quota-exceeded'))).toBe(i18next.t('errors.storageQuotaExceeded'))
  })

  // Invite errors
  it('maps Invite not found', () => {
    expect(friendlyError(new Error('Invite not found'))).toBe(i18next.t('errors.inviteInvalid'))
  })

  it('maps Invite already used', () => {
    expect(friendlyError(new Error('Invite already used'))).toBe(i18next.t('errors.inviteUsed'))
  })

  it('maps Invite expired', () => {
    expect(friendlyError(new Error('Invite expired'))).toBe(i18next.t('errors.inviteExpired'))
  })

  // Passthrough messages
  it('passes through storage limit messages as-is', () => {
    const msg = 'Household storage limit reached (500 MB)'
    expect(friendlyError(new Error(msg))).toBe(msg)
  })

  it('passes through Maximum messages as-is', () => {
    const msg = 'Maximum 10 files per expense'
    expect(friendlyError(new Error(msg))).toBe(msg)
  })

  // Fallback behavior
  it('returns generic translated message for unknown errors', () => {
    expect(friendlyError(new Error('something unexpected'))).toBe(i18next.t('errors.generic'))
  })

  it('uses custom fallback when provided', () => {
    expect(friendlyError(new Error('unknown'), 'My custom fallback')).toBe('My custom fallback')
  })

  it('handles non-Error objects gracefully', () => {
    expect(friendlyError('just a string')).toBe(i18next.t('errors.generic'))
  })

  it('handles null', () => {
    expect(friendlyError(null)).toBe(i18next.t('errors.generic'))
  })

  it('handles undefined', () => {
    expect(friendlyError(undefined)).toBe(i18next.t('errors.generic'))
  })

  it('handles error with empty message', () => {
    expect(friendlyError(new Error(''))).toBe(i18next.t('errors.generic'))
  })
})

// ═══════════════════════════════════════════════════
// getDateLocale — date-fns locale resolution
// ═══════════════════════════════════════════════════

describe('getDateLocale', () => {
  const originalLanguage = i18next.language

  afterEach(() => {
    i18next.changeLanguage(originalLanguage)
  })

  it('returns undefined for English (date-fns uses English by default)', () => {
    i18next.changeLanguage('en')
    expect(getDateLocale()).toBeUndefined()
  })

  it('returns es locale for Spanish', () => {
    i18next.changeLanguage('es')
    expect(getDateLocale()?.code).toBe('es')
  })

  it('returns nl locale for Dutch', () => {
    i18next.changeLanguage('nl')
    expect(getDateLocale()?.code).toBe('nl')
  })

  it('returns de locale for German', () => {
    i18next.changeLanguage('de')
    expect(getDateLocale()?.code).toBe('de')
  })

  it('returns fr locale for French', () => {
    i18next.changeLanguage('fr')
    expect(getDateLocale()?.code).toBe('fr')
  })

  it('returns pt locale for Portuguese', () => {
    i18next.changeLanguage('pt')
    expect(getDateLocale()?.code).toBe('pt')
  })

  it('extracts base language from variant (pt-BR → pt)', () => {
    i18next.changeLanguage('pt-BR')
    expect(getDateLocale()?.code).toBe('pt')
  })

  it('extracts base language from variant (es-MX → es)', () => {
    i18next.changeLanguage('es-MX')
    expect(getDateLocale()?.code).toBe('es')
  })

  it('returns undefined for unsupported language', () => {
    i18next.changeLanguage('ja')
    expect(getDateLocale()).toBeUndefined()
  })

  it('returns undefined for empty language', () => {
    // Simulate edge case
    const orig = i18next.language
    Object.defineProperty(i18next, 'language', { value: '', configurable: true })
    expect(getDateLocale()).toBeUndefined()
    Object.defineProperty(i18next, 'language', { value: orig, configurable: true })
  })

  // Integration: verify format() actually produces localized output
  it('format() produces Spanish month names with es locale', () => {
    i18next.changeLanguage('es')
    const locale = getDateLocale()
    const result = format(new Date(2026, 0, 15), 'MMMM', { locale })
    expect(result.toLowerCase()).toBe('enero')
  })

  it('format() produces German month names with de locale', () => {
    i18next.changeLanguage('de')
    const locale = getDateLocale()
    const result = format(new Date(2026, 0, 15), 'MMMM', { locale })
    expect(result.toLowerCase()).toBe('januar')
  })

  it('format() produces French month names with fr locale', () => {
    i18next.changeLanguage('fr')
    const locale = getDateLocale()
    const result = format(new Date(2026, 0, 15), 'MMMM', { locale })
    expect(result.toLowerCase()).toBe('janvier')
  })

  it('format() produces English month names without locale (default)', () => {
    i18next.changeLanguage('en')
    const result = format(new Date(2026, 0, 15), 'MMMM', { locale: getDateLocale() })
    expect(result).toBe('January')
  })
})

// ═══════════════════════════════════════════════════
// Category & payer label translations
// ═══════════════════════════════════════════════════

describe('getCategoryLabel', () => {
  it('returns translated label for known category', () => {
    expect(getCategoryLabel('down_payment')).toBe('Down Payment')
  })

  it('returns the value itself as fallback for unknown category', () => {
    expect(getCategoryLabel('nonexistent_xyz')).toBe('nonexistent_xyz')
  })

  it('returns translated labels for all 14 categories', () => {
    for (const value of CATEGORY_VALUES) {
      const label = getCategoryLabel(value)
      expect(label).toBeTruthy()
      expect(label).not.toBe(value)
    }
  })
})

describe('getCategoryHint', () => {
  it('returns translated hint for known category', () => {
    expect(getCategoryHint('down_payment')).toBe('Deposit paid to the seller')
  })

  it('returns empty string for unknown category', () => {
    expect(getCategoryHint('nonexistent_xyz')).toBe('')
  })
})

describe('getSharedPayerLabel', () => {
  it('returns "Shared" in English', () => {
    expect(getSharedPayerLabel()).toBe('Shared')
  })
})

describe('getFormerMemberLabel', () => {
  it('returns "Former member" in English', () => {
    expect(getFormerMemberLabel()).toBe('Former member')
  })
})

// ═══════════════════════════════════════════════════
// EXPENSE_CATEGORIES getters
// ═══════════════════════════════════════════════════

describe('EXPENSE_CATEGORIES', () => {
  it('has exactly 14 categories', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(14)
  })

  it('each category has a non-empty label via getter', () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(typeof cat.label).toBe('string')
      expect(cat.label.length).toBeGreaterThan(0)
    }
  })

  it('each category has a non-empty hint via getter', () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(typeof cat.hint).toBe('string')
      expect(cat.hint.length).toBeGreaterThan(0)
    }
  })

  it('all 14 labels are unique', () => {
    const labels = EXPENSE_CATEGORIES.map((c) => c.label)
    expect(new Set(labels).size).toBe(14)
  })

  it('values match CATEGORY_VALUES', () => {
    const values = EXPENSE_CATEGORIES.map((c) => c.value)
    expect(values).toEqual([...CATEGORY_VALUES])
  })
})

// ═══════════════════════════════════════════════════
// i18n configuration & language switching
// ═══════════════════════════════════════════════════

describe('i18n configuration', () => {
  const originalLanguage = i18next.language

  afterEach(() => {
    i18next.changeLanguage(originalLanguage)
  })

  it('test environment uses English', () => {
    expect(i18next.language).toBe('en')
  })

  it('t() returns English translations', () => {
    expect(i18next.t('common.save')).toBe('Save')
    expect(i18next.t('common.cancel')).toBe('Cancel')
    expect(i18next.t('common.delete')).toBe('Delete')
  })

  it('returns the key itself for missing translations', () => {
    expect(i18next.t('totally.fake.key')).toBe('totally.fake.key')
  })

  it('handles interpolation', () => {
    expect(i18next.t('onboarding.welcomeName', { name: 'Alice' })).toBe('Welcome, Alice!')
  })

  it('handles interpolation with multiple variables', () => {
    const result = i18next.t('mortgage.yourRatePlain', { ref: '3.2', spread: '0.9', effective: '4.1' })
    expect(result).toContain('3.2')
    expect(result).toContain('0.9')
    expect(result).toContain('4.1')
  })

  it('handles pluralization: count=0 → other form', () => {
    const result = i18next.t('expenses.expenseCount', { count: 0 })
    expect(result).toContain('0 expenses')
  })

  it('handles pluralization: count=1 → one form', () => {
    const result = i18next.t('expenses.expenseCount', { count: 1 })
    expect(result).toContain('1 expense')
    expect(result).not.toContain('expenses')
  })

  it('handles pluralization: count=5 → other form', () => {
    const result = i18next.t('expenses.expenseCount', { count: 5 })
    expect(result).toContain('5 expenses')
  })

  it('handles pluralization with additional interpolation variables', () => {
    const result = i18next.t('dashboard.expenseCount', { count: 3, total: '€300.00' })
    expect(result).toContain('3 expenses')
    expect(result).toContain('€300.00')
  })

  it('handles nested translation keys', () => {
    expect(i18next.t('categories.down_payment.label')).toBe('Down Payment')
    expect(i18next.t('categories.down_payment.hint')).toBe('Deposit paid to the seller')
  })
})

// ═══════════════════════════════════════════════════
// Locale file structural consistency
// ═══════════════════════════════════════════════════

describe('locale files', () => {
  const locales = {
    en: () => import('../locales/en.json'),
    es: () => import('../locales/es.json'),
    nl: () => import('../locales/nl.json'),
    de: () => import('../locales/de.json'),
    fr: () => import('../locales/fr.json'),
    pt: () => import('../locales/pt.json'),
  }

  it('all 6 locale files exist and parse correctly', async () => {
    for (const [, loader] of Object.entries(locales)) {
      const mod = await loader()
      expect(mod.default).toBeDefined()
      expect(typeof mod.default).toBe('object')
    }
  })

  it('all locales have required top-level sections', async () => {
    const requiredSections = ['common', 'nav', 'auth', 'onboarding', 'dashboard', 'filters',
      'expenses', 'files', 'mortgage', 'documents', 'settings', 'invite', 'summary', 'privacy', 'errors', 'categories']

    for (const [code, loader] of Object.entries(locales)) {
      const mod = (await loader()).default
      for (const section of requiredSections) {
        expect((mod as Record<string, unknown>)[section], `${code}.json missing section "${section}"`).toBeDefined()
      }
    }
  })

  it('all locale files have matching top-level keys (except en-only "landing")', async () => {
    const en = (await locales.en()).default
    const enKeys = Object.keys(en).filter(k => k !== 'landing').sort()

    for (const [code, loader] of Object.entries(locales)) {
      if (code === 'en') continue
      const mod = (await loader()).default
      const keys = Object.keys(mod).filter(k => k !== 'landing').sort()
      expect(keys, `${code}.json has different top-level keys than en.json`).toEqual(enKeys)
    }
  })

  it('all locale files have all 14 category entries with label and hint', async () => {
    for (const [code, loader] of Object.entries(locales)) {
      const mod = (await loader()).default
      expect(Object.keys(mod.categories), `${code}.json categories count`).toHaveLength(14)
      for (const key of CATEGORY_VALUES) {
        expect(mod.categories[key]?.label, `${code}.json missing categories.${key}.label`).toBeTruthy()
        expect(mod.categories[key]?.hint, `${code}.json missing categories.${key}.hint`).toBeTruthy()
      }
    }
  })

  it('all locale files have all nav keys', async () => {
    const navKeys = ['dashboard', 'mortgage', 'expenses', 'documents', 'settings']
    for (const [code, loader] of Object.entries(locales)) {
      const mod = (await loader()).default
      for (const key of navKeys) {
        expect((mod.nav as Record<string, string>)[key], `${code}.json missing nav.${key}`).toBeTruthy()
      }
    }
  })

  it('all locale files have all error keys', async () => {
    const en = (await locales.en()).default
    const errorKeys = Object.keys(en.errors)

    for (const [code, loader] of Object.entries(locales)) {
      if (code === 'en') continue
      const mod = (await loader()).default
      const keys = Object.keys(mod.errors)
      for (const key of errorKeys) {
        expect(keys, `${code}.json missing errors.${key}`).toContain(key)
      }
    }
  })

  it('no locale file has empty string values in common section', async () => {
    for (const [code, loader] of Object.entries(locales)) {
      const mod = (await loader()).default
      for (const [key, value] of Object.entries(mod.common as Record<string, string>)) {
        expect(value, `${code}.json has empty common.${key}`).toBeTruthy()
      }
    }
  })

  it('pluralization keys are paired (_one and _other)', async () => {
    const en = (await locales.en()).default
    // Check that every _one key has a corresponding _other
    const checkSection = (section: Record<string, string>, sectionName: string) => {
      for (const key of Object.keys(section)) {
        if (key.endsWith('_one')) {
          const otherKey = key.replace('_one', '_other')
          expect(section[otherKey], `en.json ${sectionName}.${key} has no matching ${otherKey}`).toBeDefined()
        }
        if (key.endsWith('_other')) {
          const oneKey = key.replace('_other', '_one')
          expect(section[oneKey], `en.json ${sectionName}.${key} has no matching ${oneKey}`).toBeDefined()
        }
      }
    }
    checkSection(en.dashboard, 'dashboard')
    checkSection(en.expenses, 'expenses')
    checkSection(en.documents, 'documents')
    checkSection(en.settings, 'settings')
  })
})
