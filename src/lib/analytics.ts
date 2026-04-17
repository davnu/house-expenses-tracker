/**
 * Analytics — cookieless, self-hosted Umami. Marketing surface only.
 *
 * Scope: public landing, /login, /privacy, /invite/:id.
 * Never fires events while the user is inside /app/*, regardless of state.
 *
 * Privacy: Umami sets zero cookies, zero persistent identifiers, and zero
 * cross-site trackers. This means no consent banner is required under GDPR.
 * The tracker script is ~2KB and is loaded from our own Umami instance
 * (not Google, not Cloudflare, not anyone else) — nobody else sees visits.
 *
 * See: https://umami.is/docs/tracker-configuration
 */

declare global {
  interface Window {
    umami?: {
      track: {
        (): Promise<string> | undefined
        (event: string, data?: Record<string, unknown>): Promise<string> | undefined
        (props: Record<string, unknown>): Promise<string> | undefined
      }
    }
  }
}

const APP_ROUTE_PREFIX = '/app'

let initialized = false
let websiteId: string | null = null
let host: string | null = null

export function isAppRoute(pathname: string): boolean {
  return pathname === APP_ROUTE_PREFIX || pathname.startsWith(APP_ROUTE_PREFIX + '/')
}

/**
 * Boot analytics. No-ops if env vars are not set (safe default).
 * Safe to call multiple times.
 */
export function initAnalytics(): void {
  if (initialized) return
  const id = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined
  const h = import.meta.env.VITE_UMAMI_HOST as string | undefined
  if (!id || !h) return
  if (typeof window === 'undefined') return

  websiteId = id
  host = h.replace(/\/$/, '')
  initialized = true

  // Load tracker with auto-tracking OFF so we can gate /app/* manually.
  const script = document.createElement('script')
  script.async = true
  script.defer = true
  script.src = `${host}/script.js`
  script.setAttribute('data-website-id', id)
  script.setAttribute('data-auto-track', 'false')
  script.setAttribute('data-host-url', host)
  // Don't send query strings — `?mode=signup`, verification tokens, etc.
  script.setAttribute('data-exclude-search', 'true')
  document.head.appendChild(script)
}

export function isAnalyticsEnabled(): boolean {
  return initialized && websiteId !== null
}

/**
 * Fire a custom event. No-ops if not initialized, if the tracker hasn't
 * loaded yet, OR if the current path is inside /app/*.
 * Events fired before tracker load are silently dropped — acceptable since
 * our events are all user-initiated (script is cached after first visit).
 */
export function track(event: string, params?: Record<string, unknown>): void {
  if (!initialized) return
  if (typeof window === 'undefined') return
  if (isAppRoute(window.location.pathname)) return
  window.umami?.track(event, params)
}

/**
 * Fire a page_view. Accepts path explicitly so we can gate on /app/*
 * without touching window.location.
 */
export function trackPageView(path: string, title: string, language: string): void {
  if (!initialized) return
  if (typeof window === 'undefined') return
  if (isAppRoute(path)) return
  window.umami?.track({ url: path, title, language })
}

/** Test-only helper to reset module state between cases. */
export function __resetForTests(): void {
  initialized = false
  websiteId = null
  host = null
}
