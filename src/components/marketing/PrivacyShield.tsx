import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'

/**
 * Trust-marketing pill shown below the hero badge on the landing page.
 * Clickable — opens the privacy page inspector directly.
 *
 * The copy (privacyBadge) names the three commitments in one breath:
 *   "Cookieless · Self-hosted analytics · Zero tracking inside the app"
 * — turning privacy from a legal footer into a visible product feature.
 */
export function PrivacyShield() {
  const { t } = useTranslation()

  return (
    <Link
      to="/privacy"
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-900/80 bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 rounded-full hover:bg-emerald-100/70 hover:border-emerald-300/80 transition-colors"
    >
      <ShieldCheck className="h-3 w-3 text-emerald-700" />
      <span>{t('landing.hero.privacyBadge')}</span>
    </Link>
  )
}
