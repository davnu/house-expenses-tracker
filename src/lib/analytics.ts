/**
 * Analytics — cookieless, self-hosted Umami. Marketing surface only.
 *
 * Scope: public landing, /login, /privacy, /invite/:id, /blog/**.
 * Never fires events while the user is inside /app/*, regardless of state.
 *
 * Privacy: Umami sets zero cookies, zero persistent identifiers, and zero
 * cross-site trackers. This means no consent banner is required under GDPR.
 * The tracker script is ~2KB and is loaded from our own Umami instance
 * (not Google, not Cloudflare, not anyone else) — nobody else sees visits.
 *
 * See: https://umami.is/docs/tracker-configuration
 *
 * ─────────────────────────── Event taxonomy ───────────────────────────
 *
 * All public events follow a single convention so dashboards are consistent.
 * Any new event must match one of these shapes — no ad-hoc naming.
 *
 *   page_view              (fired automatically by useAnalytics on nav)
 *   locale_view            { page_locale, browser_locale }
 *   language_switch        { from, to }
 *
 *   cta_click              { cta_location, cta_label, slug? }
 *                          One event for every call-to-action click, landing
 *                          *and* blog. `cta_location` namespaces the click
 *                          source: `header`, `hero`, `closing_cta`,
 *                          `blog_header`, `blog_hero`, `blog_article_end`,
 *                          `blog_index_cta`, `blog_mobile_menu`, …
 *                          Optional `slug` on blog-article CTAs so we can
 *                          attribute conversions to specific articles.
 *
 *   faq_expand             { question_id }
 *   signup_start           (landing auth flow)
 *   login_start            (landing auth flow)
 *   sign_up                (account creation)
 *   login                  (successful login)
 *   invite_landed          (invite-link arrival)
 *
 *   blog_index_view        { lang }
 *   blog_article_view      { slug, lang, category }
 *   blog_article_complete  { slug, lang }       — fires once, ~end of article
 *   blog_related_click     { from_slug, to_slug }
 *   blog_share             { slug, platform }   — platform: 'native' | 'clipboard'
 *
 * Convention: underscored_snake_case for event names AND property keys, to
 * match Umami's URL-encoded query-string convention.
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
  // NOTE: we do NOT set data-exclude-search here. Stripping every query
  // string also kills UTM attribution, which makes paid/social campaigns
  // invisible. Instead, the caller sanitizes the URL before handing it to
  // trackPageView — see sanitizeTrackedUrl below (allowlists utm_*, ref,
  // src, gclid, fbclid, msclkid and drops everything else, including
  // verification tokens).
  script.addEventListener('load', flushPending)
  script.addEventListener('error', abortAnalytics)
  document.head.appendChild(script)
}

/**
 * Allowlist of query params we're willing to keep in tracked URLs.
 * Everything else is dropped. This preserves attribution (UTMs, click
 * IDs, referral tags) while keeping sensitive tokens like Firebase
 * `oobCode`, invite codes, and signup mode out of analytics storage.
 */
const TRACKED_QUERY_ALLOWLIST = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
  'src',
  'gclid',
  'fbclid',
  'msclkid',
])

export function sanitizeTrackedUrl(pathname: string, search: string): string {
  if (!search || search === '?') return pathname
  const params = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const [key, value] of params.entries()) {
    if (TRACKED_QUERY_ALLOWLIST.has(key.toLowerCase())) kept.append(key, value)
  }
  const rendered = kept.toString()
  return rendered ? `${pathname}?${rendered}` : pathname
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
