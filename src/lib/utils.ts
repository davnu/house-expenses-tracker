import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18next from 'i18next'
import { es, nl, de, fr, pt } from 'date-fns/locale'
import type { Locale } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Date locale (follows UI language) ──

const DATE_LOCALE_MAP: Record<string, Locale> = { es, nl, de, fr, pt }

/** Returns the date-fns locale matching the current i18n language (undefined = English default) */
export function getDateLocale(): Locale | undefined {
  const lang = i18next.language?.split('-')[0] ?? 'en'
  return DATE_LOCALE_MAP[lang]
}

// ── Currency formatting (follows house country, NOT UI language) ──

/** Country code → BCP 47 locale for Intl.NumberFormat */
const COUNTRY_LOCALE_MAP: Record<string, string> = {
  ES: 'es-ES', FR: 'fr-FR', PT: 'pt-PT', IT: 'it-IT', DE: 'de-DE',
  NL: 'nl-NL', BE: 'nl-BE', IE: 'en-IE', AT: 'de-AT', FI: 'fi-FI',
  GR: 'el-GR', GB: 'en-GB', US: 'en-US', CA: 'en-CA',
  LU: 'fr-LU', CY: 'el-CY', MT: 'en-MT', SI: 'sl-SI', SK: 'sk-SK',
  EE: 'et-EE', LV: 'lv-LV', LT: 'lt-LT', HR: 'hr-HR',
  AU: 'en-AU', NZ: 'en-NZ', JP: 'ja-JP', KR: 'ko-KR',
  SG: 'en-SG', HK: 'en-HK', CH: 'de-CH', SE: 'sv-SE',
  NO: 'nb-NO', DK: 'da-DK', PL: 'pl-PL', CZ: 'cs-CZ',
  HU: 'hu-HU', RO: 'ro-RO', BG: 'bg-BG',
}

let _currencyLocale = 'en-US'
let _defaultCurrency = 'EUR'

/** Called from HouseholdContext when the active house changes.
 *  Sets the number formatting locale based on the house's country
 *  and the default currency from the house's configuration. */
export function setCurrencyContext(countryCode?: string, currency?: string) {
  _defaultCurrency = currency ?? 'EUR'
  _currencyLocale = (countryCode && countryCode.length > 0 && COUNTRY_LOCALE_MAP[countryCode]) || 'en-US'
}

/** For testing: reset currency context to defaults */
export function resetCurrencyContext() {
  _currencyLocale = 'en-US'
  _defaultCurrency = 'EUR'
}

export function formatCurrency(cents: number, currency?: string): string {
  if (isNaN(cents) || !isFinite(cents)) return '—'
  return new Intl.NumberFormat(_currencyLocale, {
    style: 'currency',
    currency: currency ?? _defaultCurrency,
  }).format(cents / 100)
}

/** Returns just the currency symbol (e.g. "€", "£", "$") for use in chart axis labels */
export function getCurrencySymbol(): string {
  return new Intl.NumberFormat(_currencyLocale, {
    style: 'currency',
    currency: _defaultCurrency,
  }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? _defaultCurrency
}

export function parseCurrencyInput(value: string): number {
  const num = parseFloat(value)
  if (isNaN(num)) return 0
  return Math.round(num * 100)
}

/** Deep-strip undefined values and NaN numbers before writing to Firestore */
export function stripInvalid<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => stripInvalid(item)) as T
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined && !(typeof v === 'number' && isNaN(v)))
        .map(([k, v]) => [k, stripInvalid(v)])
    ) as T
  }
  return obj
}

/** Map Firebase/Firestore error codes to user-friendly messages */
export function friendlyError(err: unknown, fallback?: string): string {
  const t = i18next.t.bind(i18next)
  const message = err instanceof Error ? err.message : ''

  // Auth errors
  if (message.includes('user-not-found') || message.includes('invalid-credential')) return t('errors.invalidCredentials')
  if (message.includes('wrong-password')) return t('errors.invalidCredentials')
  if (message.includes('email-already-in-use')) return t('errors.emailAlreadyExists')
  if (message.includes('weak-password')) return t('errors.weakPassword')
  if (message.includes('invalid-email')) return t('errors.invalidEmail')
  if (message.includes('too-many-requests')) return t('errors.tooManyAttempts')
  if (message.includes('popup-closed')) return t('errors.popupClosed')
  if (message.includes('requires-recent-login')) return t('errors.requiresRecentLogin')
  if (message.includes('expired-action-code')) return t('errors.expiredResetCode')
  if (message.includes('invalid-action-code')) return t('errors.invalidResetCode')

  // Firestore errors
  if (message.includes('permission-denied') || message.includes('PERMISSION_DENIED')) return t('errors.permissionDenied')
  if (message.includes('not-found') || message.includes('NOT_FOUND')) return t('errors.notFound')
  if (message.includes('unavailable') || message.includes('UNAVAILABLE')) return t('errors.serviceUnavailable')

  // Storage errors
  if (message.includes('storage/unauthorized')) return t('errors.storageUnauthorized')
  if (message.includes('storage/quota-exceeded')) return t('errors.storageQuotaExceeded')

  // Custom app errors (from HouseholdContext)
  if (message.includes('Invite not found')) return t('errors.inviteInvalid')
  if (message.includes('Invite already used')) return t('errors.inviteUsed')
  if (message.includes('Invite expired')) return t('errors.inviteExpired')
  if (message.includes('storage limit')) return message // already friendly
  if (message.includes('Maximum')) return message // already friendly

  return fallback ?? t('errors.generic')
}
