import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isAppRoute,
  initAnalytics,
  track,
  trackPageView,
  isAnalyticsEnabled,
  __resetForTests,
} from './analytics'

function setLocation(pathname: string) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, pathname, origin: 'https://casatab.test' } as Location,
  })
}

describe('isAppRoute', () => {
  it('returns true for /app and any nested path', () => {
    expect(isAppRoute('/app')).toBe(true)
    expect(isAppRoute('/app/')).toBe(true)
    expect(isAppRoute('/app/expenses')).toBe(true)
    expect(isAppRoute('/app/mortgage/schedule')).toBe(true)
  })

  it('returns false for marketing/public routes', () => {
    expect(isAppRoute('/')).toBe(false)
    expect(isAppRoute('/login')).toBe(false)
    expect(isAppRoute('/privacy')).toBe(false)
    expect(isAppRoute('/es')).toBe(false)
    expect(isAppRoute('/fr/')).toBe(false)
    expect(isAppRoute('/invite/abc123')).toBe(false)
  })

  it('does not match look-alike paths like /apple or /app-something', () => {
    expect(isAppRoute('/apple')).toBe(false)
    expect(isAppRoute('/app-docs')).toBe(false)
  })
})

describe('analytics gating', () => {
  let umamiSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __resetForTests()
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'test-website-id')
    vi.stubEnv('VITE_UMAMI_HOST', 'https://analytics.casatab.test')
    umamiSpy = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (window as unknown as { umami?: unknown }).umami
  })

  it('does nothing when env vars are unset', () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', '')
    vi.stubEnv('VITE_UMAMI_HOST', '')
    __resetForTests()
    initAnalytics()
    expect(isAnalyticsEnabled()).toBe(false)
  })

  it('does nothing when only one of the two vars is set', () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'id-only')
    vi.stubEnv('VITE_UMAMI_HOST', '')
    __resetForTests()
    initAnalytics()
    expect(isAnalyticsEnabled()).toBe(false)
  })

  it('initAnalytics sets isAnalyticsEnabled and is idempotent', () => {
    initAnalytics()
    expect(isAnalyticsEnabled()).toBe(true)
    initAnalytics()
    expect(isAnalyticsEnabled()).toBe(true)
  })

  it('initAnalytics appends the tracker script with correct attributes', () => {
    initAnalytics()
    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="analytics.casatab.test/script.js"]',
    )
    expect(script).not.toBeNull()
    expect(script?.getAttribute('data-website-id')).toBe('test-website-id')
    expect(script?.getAttribute('data-auto-track')).toBe('false')
    expect(script?.getAttribute('data-exclude-search')).toBe('true')
  })

  it('track() is a no-op inside /app/*', () => {
    initAnalytics()
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    setLocation('/app/dashboard')
    track('cta_click', { cta_location: 'hero' })
    expect(umamiSpy).not.toHaveBeenCalled()
  })

  it('track() fires on public routes', () => {
    initAnalytics()
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    setLocation('/')
    track('cta_click', { cta_location: 'hero' })
    expect(umamiSpy).toHaveBeenCalledWith('cta_click', { cta_location: 'hero' })
  })

  it('trackPageView() is a no-op for /app/* paths', () => {
    initAnalytics()
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    trackPageView('/app/mortgage', 'Mortgage', 'en')
    expect(umamiSpy).not.toHaveBeenCalled()
  })

  it('trackPageView() fires for public paths with expected shape', () => {
    initAnalytics()
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    setLocation('/es')
    trackPageView('/es', 'CasaTab', 'es')
    expect(umamiSpy).toHaveBeenCalledWith({ url: '/es', title: 'CasaTab', language: 'es' })
  })

  it('track() is silent when tracker script has not loaded yet', () => {
    initAnalytics()
    // No window.umami assigned — simulates script not yet loaded.
    setLocation('/')
    expect(() => track('anything')).not.toThrow()
  })

  it('track() is a no-op when analytics is disabled', () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', '')
    vi.stubEnv('VITE_UMAMI_HOST', '')
    __resetForTests()
    initAnalytics()
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    setLocation('/')
    track('anything')
    expect(umamiSpy).not.toHaveBeenCalled()
  })
})
