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
    trackPageView('/app/mortgage', 'Mortgage')
    expect(umamiSpy).not.toHaveBeenCalled()
  })

  it('trackPageView() fires via callback form that merges with auto-payload', () => {
    initAnalytics()
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    setLocation('/es')
    trackPageView('/es', 'CasaTab')
    expect(umamiSpy).toHaveBeenCalledTimes(1)
    const fn = umamiSpy.mock.calls[0][0] as (p: Record<string, unknown>) => Record<string, unknown>
    expect(typeof fn).toBe('function')
    // The callback must preserve auto-collected fields (sessionId, hostname,
    // etc.) while overriding url and title — otherwise Umami drops it from
    // Overview aggregations.
    const autoPayload = {
      website: 'abc',
      hostname: 'casatab.com',
      screen: '1920x1080',
      language: 'es-ES',
    }
    expect(fn(autoPayload)).toEqual({ ...autoPayload, url: '/es', title: 'CasaTab' })
    // Must NOT include a `name` field — presence of name makes it a custom
    // event server-side instead of a pageview.
    expect('name' in fn(autoPayload)).toBe(false)
  })

  it('track() is silent when tracker script has not loaded yet', () => {
    initAnalytics()
    // No window.umami assigned — simulates script not yet loaded.
    setLocation('/')
    expect(() => track('anything')).not.toThrow()
  })

  it('dedupes consecutive trackPageView calls with the same path', () => {
    initAnalytics()
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    trackPageView('/es', 'CasaTab')
    trackPageView('/es', 'CasaTab')
    expect(umamiSpy).toHaveBeenCalledTimes(1)

    // Navigating away and back is a real revisit — should fire again.
    trackPageView('/es/privacy', 'Privacy')
    trackPageView('/es', 'CasaTab')
    expect(umamiSpy).toHaveBeenCalledTimes(3)
  })

  it('drops queued entries beyond the cap', () => {
    initAnalytics()
    setLocation('/')
    for (let i = 0; i < 100; i++) track(`evt_${i}`)
    // Flush. If cap is respected, we'll see at most 50.
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="analytics.casatab.test/script.js"]',
    )
    script?.dispatchEvent(new Event('load'))
    expect(umamiSpy.mock.calls.length).toBeLessThanOrEqual(50)
    expect(umamiSpy.mock.calls.length).toBeGreaterThan(0)
  })

  it('aborts and stops queueing if the tracker script errors (adblocker, 404)', () => {
    initAnalytics()
    setLocation('/')
    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="analytics.casatab.test/script.js"]',
    )
    script?.dispatchEvent(new Event('error'))
    // After error, init is cleared — further calls no-op even with umami present.
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    track('cta_click')
    trackPageView('/', 'Home')
    expect(umamiSpy).not.toHaveBeenCalled()
  })

  it('queues calls made before tracker loads and flushes them on script load', () => {
    initAnalytics()
    setLocation('/')
    // Tracker not loaded yet — these should be queued, not dropped.
    trackPageView('/', 'Home')
    track('cta_click', { cta_location: 'hero' })
    expect(umamiSpy).not.toHaveBeenCalled()

    // Simulate script finishing loading.
    ;(window as unknown as { umami: { track: typeof umamiSpy } }).umami = { track: umamiSpy }
    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="analytics.casatab.test/script.js"]',
    )
    script?.dispatchEvent(new Event('load'))

    expect(umamiSpy).toHaveBeenCalledTimes(2)
    // First: the queued pageview, flushed as a callback.
    const pageViewFn = umamiSpy.mock.calls[0][0] as (p: Record<string, unknown>) => Record<string, unknown>
    expect(typeof pageViewFn).toBe('function')
    expect(pageViewFn({ sessionId: 'abc' })).toEqual({ sessionId: 'abc', url: '/', title: 'Home' })
    // Second: the queued custom event.
    expect(umamiSpy).toHaveBeenNthCalledWith(2, 'cta_click', { cta_location: 'hero' })
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
