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
        (fn: (props: Record<string, unknown>) => Record<string, unknown>): Promise<string> | undefined
      }
    }
  }
}

const APP_ROUTE_PREFIX = '/app'

let initialized = false
let websiteId: string | null = null
let host: string | null = null
let lastPageViewPath: string | null = null
// Bounded — if the tracker never loads (adblocker, network error) we drop
// extras rather than leak memory on a long SPA session.
const QUEUE_MAX = 50
type PendingCall =
  | { kind: 'event'; name: string; data?: Record<string, unknown> }
  | { kind: 'pageview'; url: string; title: string }
const pending: PendingCall[] = []

function pageViewCallback(url: string, title: string) {
  return (props: Record<string, unknown>) => ({ ...props, url, title })
}

function enqueue(call: PendingCall): void {
  if (pending.length >= QUEUE_MAX) return
  pending.push(call)
}

function flushPending(): void {
  if (!window.umami) return
  const drained = pending.splice(0)
  for (const call of drained) {
    if (call.kind === 'event') window.umami.track(call.name, call.data)
    else window.umami.track(pageViewCallback(call.url, call.title))
  }
}

function abortAnalytics(): void {
  // Script blocked or failed to load — clear state so we stop queueing.
  pending.length = 0
  initialized = false
}

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
  script.addEventListener('load', flushPending)
  script.addEventListener('error', abortAnalytics)
  document.head.appendChild(script)
}

export function isAnalyticsEnabled(): boolean {
  return initialized && websiteId !== null
}

/**
 * Fire a custom event. No-ops if not initialized or if the current path is
 * inside /app/*. Calls made before the tracker script finishes loading are
 * queued and flushed on load.
 */
export function track(event: string, params?: Record<string, unknown>): void {
  if (!initialized) return
  if (typeof window === 'undefined') return
  if (isAppRoute(window.location.pathname)) return
  if (window.umami) window.umami.track(event, params)
  else enqueue({ kind: 'event', name: event, data: params })
}

/**
 * Fire a page_view. Accepts path explicitly so we can gate on /app/*
 * without touching window.location. Queued until the tracker loads.
 *
 * Uses the callback form `track(props => ({...props, url, title}))` — this
 * merges with Umami's auto-collected payload (sessionId, hostname, screen,
 * language, website). The object form `track({url, title})` sends ONLY the
 * object, bypassing session context, which causes Overview aggregations to
 * silently drop the pageview. See umami-software/umami#3341.
 *
 * Deduped by path: the useAnalytics effect can re-run on the same URL
 * (React StrictMode double-invoke, i18n language resolving) — we don't
 * want to inflate pageviews for identical consecutive paths. Real
 * back/forward revisits still fire because any intervening path updates
 * lastPageViewPath.
 */
export function trackPageView(path: string, title: string): void {
  if (!initialized) return
  if (typeof window === 'undefined') return
  if (isAppRoute(path)) return
  if (path === lastPageViewPath) return
  lastPageViewPath = path
  if (window.umami) window.umami.track(pageViewCallback(path, title))
  else enqueue({ kind: 'pageview', url: path, title })
}

/** Test-only helper to reset module state between cases. */
export function __resetForTests(): void {
  initialized = false
  websiteId = null
  host = null
  lastPageViewPath = null
  pending.length = 0
}
