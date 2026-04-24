import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { trackPageView, isAppRoute, sanitizeTrackedUrl } from '@/lib/analytics'

/**
 * Fires a pageview on each React Router navigation.
 * Silent inside /app/* — gated by isAppRoute in analytics.ts.
 *
 * Mount on public route components (Landing, Login, Privacy, InviteLanding).
 * Do NOT mount inside ProtectedApp.
 */
export function useAnalytics(): void {
  const location = useLocation()

  useEffect(() => {
    if (isAppRoute(location.pathname)) return
    trackPageView(
      sanitizeTrackedUrl(location.pathname, location.search),
      typeof document !== 'undefined' ? document.title : '',
    )
  }, [location.pathname, location.search])
}
