import { useTranslation } from 'react-i18next'
import { track } from '@/lib/analytics'

/**
 * Shared language-switch helper — mirrors the pattern in LandingPage so all
 * public-route language switches fire the same `language_switch` analytics
 * event and obey i18next's state model.
 *
 * On the blog, callers pass an optional `nextUrl` to navigate the browser to
 * the translated article URL instead of just toggling the i18n language.
 */
export function useLanguageSwitcher() {
  const { i18n } = useTranslation()

  const currentCode = i18n.language?.split('-')[0] ?? 'en'

  function switchTo(nextCode: string, nextUrl?: string) {
    if (nextCode === currentCode) return
    track('language_switch', { from: currentCode, to: nextCode })
    i18n.changeLanguage(nextCode)
    if (nextUrl) {
      window.location.assign(nextUrl)
    }
  }

  return { currentCode, switchTo }
}
