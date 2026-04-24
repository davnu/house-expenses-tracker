import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import { useLanguageSwitcher } from '@/hooks/useLanguageSwitcher'
import { cn } from '@/lib/utils'
import { blogUrl, type BlogLang } from '@/lib/blog'
import { Home } from 'lucide-react'

export function BlogFooter({ lang }: { lang: BlogLang }) {
  const { t } = useTranslation()
  const { currentCode, switchTo } = useLanguageSwitcher()

  const landingHome = lang === 'en' ? '/' : `/${lang}/`

  return (
    <footer className="border-t border-border/50 bg-muted/20 mt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-10 sm:gap-16">
          <div>
            <Link to={landingHome} className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center">
                <Home className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-[15px]">CasaTab</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">{t('landing.footer.tagline')}</p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('landing.footer.product')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to={`${landingHome}#features`} className="hover:text-foreground transition-colors">{t('landing.nav.features')}</Link></li>
              <li><Link to={`${landingHome}#how-it-works`} className="hover:text-foreground transition-colors">{t('landing.nav.howItWorks')}</Link></li>
              <li><Link to={blogUrl(lang)} className="hover:text-foreground transition-colors">{t('landing.nav.blog')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('landing.footer.legal')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">{t('common.privacyPolicy')}</Link></li>
              <li><Link to="/login" className="hover:text-foreground transition-colors">{t('landing.nav.logIn')}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} CasaTab. {t('landing.footer.rights')}</p>
          <div className="flex items-center gap-1.5">
            {SUPPORTED_LANGUAGES.map(langItem => (
              <button
                key={langItem.code}
                onClick={() => switchTo(langItem.code)}
                className={cn(
                  'px-2 py-1 rounded text-xs transition-colors cursor-pointer',
                  currentCode === langItem.code ? 'bg-brand/10 text-brand font-medium' : 'hover:bg-muted/50',
                )}
              >
                {langItem.code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
