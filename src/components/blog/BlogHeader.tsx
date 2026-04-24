import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { useLanguageSwitcher } from '@/hooks/useLanguageSwitcher'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { blogUrl, type BlogLang } from '@/lib/blog'
import { Home, Globe, ArrowRight, Menu, X } from 'lucide-react'

interface BlogHeaderProps {
  lang: BlogLang
  /** Optional: translated-URL map so the language switcher lands on the
   *  same article in the target language (falls back to blog index). */
  alternateUrls?: Record<BlogLang, string>
  /** When true (article pages), the header auto-hides on scroll-down and
   *  reappears on scroll-up so readers get more vertical reading area. */
  autoHide?: boolean
}

export function BlogHeader({ lang, alternateUrls, autoHide = false }: BlogHeaderProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { currentCode, switchTo } = useLanguageSwitcher()
  const [scrolled, setScrolled] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY
    let raf: number | null = null

    const update = () => {
      raf = null
      const y = window.scrollY
      setScrolled(y > 20)
      if (autoHide) {
        const delta = y - lastY
        // 8px threshold avoids jitter on momentum scroll. Always reveal when
        // near the top or when the language/mobile menus are open.
        if (y < 80 || mobileMenu || langOpen) {
          setHidden(false)
        } else if (delta > 8) {
          setHidden(true)
        } else if (delta < -8) {
          setHidden(false)
        }
      }
      lastY = y
    }

    const handler = () => {
      if (raf !== null) return
      raf = requestAnimationFrame(update)
    }

    window.addEventListener('scroll', handler, { passive: true })
    return () => {
      window.removeEventListener('scroll', handler)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [autoHide, mobileMenu, langOpen])

  useEffect(() => {
    if (!langOpen) return
    const close = () => setLangOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey) }
  }, [langOpen])

  useEffect(() => {
    if (!mobileMenu) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      window.scrollTo(0, scrollY)
    }
  }, [mobileMenu])

  const handleCta = (location: string, label: string) => {
    track('cta_click', { cta_location: location, cta_label: label })
  }

  const handleLangSwitch = (code: string) => {
    const url = alternateUrls?.[code as BlogLang]
    // Strip the domain — we want a same-origin navigation, not a full page reload.
    const path = url ? url.replace(/^https?:\/\/[^/]+/, '') : undefined
    switchTo(code, path)
  }

  const landingHome = lang === 'en' ? '/' : `/${lang}/`
  const currentLangMeta = SUPPORTED_LANGUAGES.find(l => l.code === currentCode)

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,box-shadow,transform] duration-300 ease-out',
          scrolled
            ? 'bg-white/80 backdrop-blur-xl border-b border-border/50 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
            : 'bg-white/60 backdrop-blur-md border-b border-border/30',
          hidden && !mobileMenu && '-translate-y-full',
        )}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to={landingHome} className="flex items-center gap-2.5 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center">
              <Home className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-[15px] tracking-tight hidden sm:block">CasaTab</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <Link to={`${landingHome}#features`} className="hover:text-foreground transition-colors">{t('landing.nav.features')}</Link>
            <Link to={`${landingHome}#how-it-works`} className="hover:text-foreground transition-colors">{t('landing.nav.howItWorks')}</Link>
            <Link to={blogUrl(lang)} className="font-medium text-foreground">{t('landing.nav.blog')}</Link>
          </nav>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setLangOpen(v => !v) }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-muted/50"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="text-xs font-medium uppercase">{currentLangMeta?.code ?? 'en'}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-border/60 py-1 z-50">
                  {SUPPORTED_LANGUAGES.map(langItem => (
                    <button
                      key={langItem.code}
                      onClick={() => { handleLangSwitch(langItem.code); setLangOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer',
                        currentCode === langItem.code && 'font-medium text-brand',
                      )}
                    >
                      {langItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!user && (
              <Link
                to="/login"
                onClick={() => handleCta('blog_header', 'log_in')}
                className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('landing.nav.logIn')}
              </Link>
            )}
            <Link
              to={user ? '/app' : '/login?mode=signup'}
              onClick={() => handleCta('blog_header', user ? 'open_app' : 'get_started')}
              className="inline-flex items-center gap-1.5 bg-brand text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
            >
              {user ? t('landing.nav.openApp') : t('landing.nav.getStarted')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <button onClick={() => setMobileMenu(true)} aria-label="Open menu" className="md:hidden p-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {mobileMenu && (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col">
          <div className="h-16 flex items-center justify-between px-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center">
                <Home className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-[15px]">CasaTab</span>
            </div>
            <button onClick={() => setMobileMenu(false)} aria-label="Close menu" className="p-1.5 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 flex flex-col items-center justify-center gap-6 text-lg">
            <Link to={`${landingHome}#features`} onClick={() => setMobileMenu(false)} className="">{t('landing.nav.features')}</Link>
            <Link to={`${landingHome}#how-it-works`} onClick={() => setMobileMenu(false)} className="">{t('landing.nav.howItWorks')}</Link>
            <Link to={blogUrl(lang)} onClick={() => setMobileMenu(false)} className="font-medium">{t('landing.nav.blog')}</Link>
            <Link to="/login" onClick={() => { setMobileMenu(false); handleCta('blog_mobile_menu', 'log_in') }} className="text-muted-foreground">
              {t('landing.nav.logIn')}
            </Link>
            <Link
              to="/login?mode=signup"
              onClick={() => { setMobileMenu(false); handleCta('blog_mobile_menu', 'get_started') }}
              className="bg-brand text-white font-medium px-8 py-3 rounded-lg hover:bg-brand-hover transition-colors"
            >
              {t('landing.nav.getStarted')}
            </Link>
            <div className="flex items-center gap-2 mt-4">
              {SUPPORTED_LANGUAGES.map(langItem => (
                <button
                  key={langItem.code}
                  onClick={() => { handleLangSwitch(langItem.code); setMobileMenu(false) }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer',
                    currentCode === langItem.code ? 'bg-brand/10 text-brand font-medium' : 'text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {langItem.code.toUpperCase()}
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
