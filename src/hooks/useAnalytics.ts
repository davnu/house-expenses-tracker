import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { trackPageView, isAppRoute } from '@/lib/analytics'

/**
 * Fires a GA4 page_view on each React Router navigation.
 * Silent inside /app/* — gated by isAppRoute in analytics.ts.
 *
 * Mount on public route components (Landing, Login, Privacy, InviteLanding).
 * Do NOT mount inside ProtectedApp.
 */
export function useAnalytics(): void {
  const location = useLocation()
  const { i18n } = useTranslation()

  useEffect(() => {
    if (isAppRoute(location.pathname)) return
    trackPageView(
      location.pathname + location.search,
      typeof document !== 'undefined' ? document.title : '',
      i18n.language,
    )
  }, [location.pathname, location.search, i18n.language])
}
