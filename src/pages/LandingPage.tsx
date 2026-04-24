import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { landingTitle } from '@/lib/page-titles'
import { PrivacyShield } from '@/components/marketing/PrivacyShield'
import { getAllArticles, blogUrl, BLOG_LANGUAGES, type BlogLang } from '@/lib/blog'
import { ArticleCard } from '@/components/blog/ArticleCard'
import {
  LayoutDashboard, BarChart3, Landmark, Users, FolderOpen, Globe,
  Shield, Download, Trash2, Ban, ChevronDown, ChevronUp, ArrowRight, Menu, X,
  Check, Home
} from 'lucide-react'

/* ────────────────────────── Scroll-reveal ────────────────────────── */

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.08 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

/* ────────────────────────── Count-up number ────────────────────────── */

function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [count, setCount] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(target)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const duration = 1200
          const t0 = performance.now()
          const step = (now: number) => {
            const p = Math.min((now - t0) / duration, 1)
            setCount(Math.round((1 - Math.pow(1 - p, 3)) * target))
            if (p < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [target])

  return <span ref={ref}>{count}{suffix}</span>
}

/* ────────────────────────── FAQ accordion item ────────────────────────── */

function FAQItem({ question, answer, questionId }: { question: string; answer: string; questionId: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) track('faq_expand', { question_id: questionId })
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-5 text-left font-medium text-[15px] cursor-pointer hover:text-brand transition-colors"
      >
        {question}
        <ChevronDown className={cn('h-4 w-4 shrink-0 ml-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div className={cn('grid transition-[grid-template-rows,opacity] duration-300 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <p className="pb-5 text-muted-foreground leading-relaxed">{answer}</p>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────── Device showcase ────────────────────────── */

function DeviceShowcase() {
  return (
    <div className="relative">
      {/* Ambient glow */}
      <div className="absolute -inset-16 pointer-events-none">
        <div className="absolute inset-0 bg-brand/[.04] rounded-[4rem] blur-[100px]" />
      </div>

      {/* Desktop + phone — sm and up */}
      <div className="relative hidden sm:block">
        {/* Desktop: frameless floating panel */}
        <div
          className="relative rounded-xl lg:rounded-2xl overflow-hidden border border-black/[.06]"
          style={{
            boxShadow: `
              0 0 0 1px rgba(0,0,0,0.02),
              0 2px 4px rgba(0,0,0,0.02),
              0 8px 16px rgba(0,0,0,0.04),
              0 24px 48px rgba(0,0,0,0.06),
              0 48px 96px -24px rgba(0,0,0,0.06)
            `,
          }}
        >
          <img
            src="/hero-desktop.png"
            alt="CasaTab dashboard on desktop"
            className="w-full h-auto block"
            width={1280}
            height={800}
          />
          {/* Bottom fade — bleeds into the page */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>

        {/* Phone: frameless panel, overlapping bottom-right, rounder corners + deeper shadow = reads as "mobile" */}
        <div
          className="absolute -bottom-6 right-4 sm:right-8 lg:right-12 w-[110px] sm:w-[140px] lg:w-[175px] z-10 rounded-2xl lg:rounded-3xl overflow-hidden border border-black/[.06]"
          style={{
            boxShadow: `
              0 0 0 1px rgba(0,0,0,0.02),
              0 4px 8px rgba(0,0,0,0.04),
              0 16px 32px rgba(0,0,0,0.08),
              0 40px 80px -20px rgba(0,0,0,0.12)
            `,
          }}
        >
          <img
            src="/hero-mobile.png"
            alt="CasaTab on mobile"
            className="w-full h-auto block"
            width={390}
            height={844}
          />
        </div>
      </div>

      {/* Small screens: phone screenshot only */}
      <div className="sm:hidden max-w-[280px] mx-auto">
        <div
          className="rounded-2xl overflow-hidden border border-black/[.06]"
          style={{
            boxShadow: `
              0 0 0 1px rgba(0,0,0,0.02),
              0 4px 8px rgba(0,0,0,0.04),
              0 16px 32px rgba(0,0,0,0.06),
              0 32px 64px -16px rgba(0,0,0,0.08)
            `,
          }}
        >
          <img
            src="/hero-mobile.png"
            alt="CasaTab on mobile"
            className="w-full h-auto block"
            width={390}
            height={844}
          />
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/*                           LANDING PAGE                               */
/* ══════════════════════════════════════════════════════════════════════ */

export function LandingPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  useDocumentTitle(landingTitle(i18n.language))
  useAnalytics()

  // Top 3 articles for the "Learn" section. Derived from the URL-declared
  // language, falling back to 'en' if the language code isn't in our blog
  // corpus (navigator language detection can produce values we don't cover).
  const blogLang = useMemo<BlogLang>(() => {
    const code = (i18n.language?.split('-')[0] ?? 'en') as BlogLang
    return BLOG_LANGUAGES.includes(code) ? code : 'en'
  }, [i18n.language])
  const blogArticles = useMemo(() => getAllArticles(blogLang).slice(0, 3), [blogLang])

  // One locale_view per page load with page + browser locales. The URL path
  // tells us which translated version was served; navigator.language tells us
  // what the visitor actually speaks — useful for checking whether SEO is
  // routing the right people to the right language.
  useEffect(() => {
    const page = i18n.language?.split('-')[0] ?? 'unknown'
    const browser = typeof navigator !== 'undefined' ? navigator.language?.split('-')[0] ?? 'unknown' : 'unknown'
    track('locale_view', { page_locale: page, browser_locale: browser })
    // Deliberately run once per mount — we already emit `language_switch`
    // for in-page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchLanguage = (next: string) => {
    const from = i18n.language?.split('-')[0] ?? 'unknown'
    if (from === next) return
    track('language_switch', { from, to: next })
    i18n.changeLanguage(next)
  }

  const handleCta = (location: string, label: string) => {
    track('cta_click', { cta_location: location, cta_label: label })
  }

  /* ── Sticky header scroll detection ── */
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  /* ── Close dropdowns on outside click or Escape ── */
  useEffect(() => {
    if (!langOpen) return
    const close = () => setLangOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey) }
  }, [langOpen])

  /* ── Lock body scroll when mobile menu open (iOS-safe) ── */
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

  const scrollTo = (id: string) => {
    setMobileMenu(false)
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 10)
  }

  /* ── Feature cards data ── */
  const features: { icon: typeof LayoutDashboard; tKey: string; accent: string; bg: string; span?: string }[] = [
    { icon: LayoutDashboard, tKey: 'dashboard', accent: 'text-brand', bg: 'bg-brand/8', span: 'lg:col-span-2' },
    { icon: BarChart3, tKey: 'categories', accent: 'text-[#e76e50]', bg: 'bg-[#e76e50]/8' },
    { icon: Landmark, tKey: 'mortgage', accent: 'text-[#2a9d90]', bg: 'bg-[#2a9d90]/8' },
    { icon: Users, tKey: 'household', accent: 'text-[#274754]', bg: 'bg-[#274754]/8', span: 'lg:col-span-2' },
    { icon: FolderOpen, tKey: 'documents', accent: 'text-[#e8c468]', bg: 'bg-[#e8c468]/10', span: 'lg:col-span-2' },
    { icon: Globe, tKey: 'international', accent: 'text-brand', bg: 'bg-brand/8' },
  ]

  const mortgageFeatures = Array.from({ length: 6 }, (_, i) => t(`landing.mortgage.feature${i + 1}`))

  const trustItems: { icon: typeof Shield; tKey: string }[] = [
    { icon: Shield, tKey: 'encryption' },
    { icon: Download, tKey: 'export' },
    { icon: Trash2, tKey: 'delete' },
    { icon: Ban, tKey: 'noAds' },
  ]

  const faqItems = Array.from({ length: 6 }, (_, i) => ({
    question: t(`landing.faq.q${i + 1}`),
    answer: t(`landing.faq.a${i + 1}`),
    id: `q${i + 1}`,
  }))

  const currentLang = SUPPORTED_LANGUAGES.find(l => i18n.language.startsWith(l.code))

  return (
    <div className="min-h-screen bg-white text-foreground">
      {/* ════════════════════════ HEADER ════════════════════════ */}
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,box-shadow] duration-300',
          scrolled
            ? 'bg-white/80 backdrop-blur-xl border-b border-border/50 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
            : 'bg-transparent',
        )}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center">
              <Home className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-[15px] tracking-tight hidden sm:block">CasaTab</span>
          </Link>

          {/* Desktop nav — Pricing sits at the right edge of the nav (but
              before the auth CTAs). SaaS nav convention: site content on
              the left, commercial intent on the right, so the eye flows
              "what is this → how does it work → blog → FAQ → what does it
              cost → start" without a double-take. */}
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <button onClick={() => scrollTo('features')} className="hover:text-foreground transition-colors cursor-pointer">{t('landing.nav.features')}</button>
            <button onClick={() => scrollTo('how-it-works')} className="hover:text-foreground transition-colors cursor-pointer">{t('landing.nav.howItWorks')}</button>
            <Link to={i18n.language.startsWith('en') ? '/blog' : `/${i18n.language.split('-')[0]}/blog`} className="hover:text-foreground transition-colors">{t('landing.nav.blog')}</Link>
            <button onClick={() => scrollTo('faq')} className="hover:text-foreground transition-colors cursor-pointer">{t('landing.nav.faq')}</button>
            <Link to="/pricing" onClick={() => handleCta('header', 'pricing')} className="hover:text-foreground transition-colors">{t('landing.nav.pricing')}</Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Language selector */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setLangOpen(v => !v) }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-muted/50"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="text-xs font-medium uppercase">{currentLang?.code ?? 'en'}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-border/60 py-1 z-50">
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => { switchLanguage(lang.code); setLangOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer',
                        i18n.language.startsWith(lang.code) && 'font-medium text-brand',
                      )}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!user && (
              <Link
                to="/login"
                onClick={() => handleCta('header', 'log_in')}
                className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('landing.nav.logIn')}
              </Link>
            )}
            <Link
              to={user ? '/app' : '/login?mode=signup'}
              onClick={() => handleCta('header', user ? 'open_app' : 'get_started')}
              className="inline-flex items-center gap-1.5 bg-brand text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
            >
              {user ? t('landing.nav.openApp') : t('landing.nav.getStarted')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            {/* Mobile hamburger */}
            <button onClick={() => setMobileMenu(true)} aria-label="Open menu" className="md:hidden p-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile menu overlay ── */}
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
            <button onClick={() => scrollTo('features')} className="cursor-pointer">{t('landing.nav.features')}</button>
            <button onClick={() => scrollTo('how-it-works')} className="cursor-pointer">{t('landing.nav.howItWorks')}</button>
            <Link to={i18n.language.startsWith('en') ? '/blog' : `/${i18n.language.split('-')[0]}/blog`} onClick={() => setMobileMenu(false)} className="">{t('landing.nav.blog')}</Link>
            <button onClick={() => scrollTo('faq')} className="cursor-pointer">{t('landing.nav.faq')}</button>
            <Link to="/pricing" onClick={() => { handleCta('mobile_menu', 'pricing'); setMobileMenu(false) }} className="">{t('landing.nav.pricing')}</Link>
            <Link
              to="/login"
              onClick={() => handleCta('mobile_menu', 'log_in')}
              className="text-muted-foreground"
            >
              {t('landing.nav.logIn')}
            </Link>
            <Link
              to="/login?mode=signup"
              onClick={() => handleCta('mobile_menu', 'get_started')}
              className="bg-brand text-white font-medium px-8 py-3 rounded-lg hover:bg-brand-hover transition-colors"
            >
              {t('landing.nav.getStarted')}
            </Link>
            <div className="flex items-center gap-2 mt-4">
              {SUPPORTED_LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => { switchLanguage(lang.code); setMobileMenu(false) }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer',
                    i18n.language.startsWith(lang.code) ? 'bg-brand/10 text-brand font-medium' : 'text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {lang.code.toUpperCase()}
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}

      {/* ════════════════════════ HERO ════════════════════════ */}
      <section className="relative pt-28 sm:pt-36 pb-8 sm:pb-12 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand/[.04] rounded-full blur-[100px]" />
        </div>

        {/* Centered copy */}
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <Reveal>
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              <div className="inline-flex items-center gap-2 bg-brand/[.06] text-brand text-xs font-semibold px-3 py-1.5 rounded-full">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-50 animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>
                {t('landing.hero.badge')}
              </div>
              <PrivacyShield />
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-extrabold tracking-tight leading-[1.08] text-balance">
              {t('landing.hero.title')}
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              {t('landing.hero.subtitle')}
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to={user ? '/app' : '/login?mode=signup'}
                onClick={() => handleCta('hero', user ? 'open_app' : 'start_tracking')}
                className="inline-flex items-center gap-2 bg-brand text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-hover transition-[background-color,box-shadow] shadow-[0_4px_14px_rgba(134,59,255,0.35)] hover:shadow-[0_6px_20px_rgba(134,59,255,0.45)]"
              >
                {user ? t('landing.nav.openApp') : t('landing.hero.cta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={() => { handleCta('hero', 'see_how_it_works'); scrollTo('how-it-works') }}
                className="inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
              >
                {t('landing.hero.ctaSecondary')}
              </button>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <p className="mt-4 text-xs text-muted-foreground">
              {t('landing.hero.noCreditCard')}
            </p>
          </Reveal>
        </div>

        {/* Full-width product showcase */}
        <Reveal delay={300}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 mt-14 sm:mt-20">
            <DeviceShowcase />
          </div>
        </Reveal>
      </section>

      {/* ════════════════════════ STATS STRIP ════════════════════════ */}
      <section className="border-y border-border/50 bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
          <Reveal>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand">
                  <CountUp target={34} suffix="+" />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t('landing.stats.countries')}</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand">6</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('landing.stats.languages')}</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand">100%</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('landing.stats.free')}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════ PROBLEM ════════════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center max-w-2xl mx-auto text-balance">
              {t('landing.problem.title')}
            </h2>
          </Reveal>

          <div className="mt-14 grid sm:grid-cols-3 gap-6">
            {[1, 2, 3].map(n => (
              <Reveal key={n} delay={n * 100}>
                <div className="rounded-xl border border-border/60 bg-white p-6 h-full hover:shadow-md transition-shadow">
                  <div className="h-10 w-10 rounded-lg bg-[#e76e50]/10 flex items-center justify-center mb-4">
                    <span className="text-lg">
                      {n === 1 ? '💸' : n === 2 ? '📊' : '🏦'}
                    </span>
                  </div>
                  <h3 className="font-bold text-[15px] mb-2">{t(`landing.problem.card${n}Title`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t(`landing.problem.card${n}Text`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ FEATURES ════════════════════════ */}
      <section id="features" className="py-20 sm:py-28 bg-muted/20 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-sm font-semibold text-brand text-center uppercase tracking-widest mb-3">{t('landing.features.label')}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center max-w-xl mx-auto text-balance">
              {t('landing.features.title')}
            </h2>
          </Reveal>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <Reveal key={f.tKey} delay={i * 80} className={f.span}>
                <div className="group rounded-xl border border-border/60 bg-white p-6 h-full hover:shadow-lg hover:border-brand/20 transition-shadow duration-300">
                  <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center mb-4', f.bg)}>
                    <f.icon className={cn('h-5 w-5', f.accent)} />
                  </div>
                  <h3 className="font-bold text-[15px] mb-2">{t(`landing.features.${f.tKey}.title`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t(`landing.features.${f.tKey}.text`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ HOW IT WORKS ════════════════════════ */}
      <section id="how-it-works" className="py-20 sm:py-28 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center text-balance">
              {t('landing.howItWorks.title')}
            </h2>
          </Reveal>

          <div className="mt-14 grid sm:grid-cols-3 gap-8 sm:gap-6 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden sm:block absolute top-[44px] left-[16.67%] right-[16.67%] h-px bg-border" />

            {[1, 2, 3].map(n => (
              <Reveal key={n} delay={n * 120}>
                <div className="text-center relative">
                  <div className="relative z-10 h-[72px] w-[72px] rounded-2xl bg-brand text-white text-2xl font-extrabold flex items-center justify-center mx-auto shadow-[0_4px_14px_rgba(134,59,255,0.3)]">
                    {n}
                  </div>
                  <h3 className="font-bold text-lg mt-5 mb-2">{t(`landing.howItWorks.step${n}Title`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{t(`landing.howItWorks.step${n}Text`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ MORTGAGE SPOTLIGHT ════════════════════════ */}
      <section className="py-20 sm:py-28 bg-gradient-to-b from-muted/30 to-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <div>
                <p className="text-sm font-semibold text-[#2a9d90] uppercase tracking-widest mb-3">{t('landing.mortgage.label')}</p>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance">
                  {t('landing.mortgage.title')}
                </h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  {t('landing.mortgage.subtitle')}
                </p>
              </div>
            </Reveal>

            <Reveal delay={150}>
              <div className="space-y-3">
                {mortgageFeatures.map((feat, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white rounded-xl border border-border/60 p-4 hover:shadow-sm transition-shadow">
                    <div className="h-6 w-6 rounded-full bg-[#2a9d90]/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="h-3.5 w-3.5 text-[#2a9d90]" />
                    </div>
                    <span className="text-sm leading-relaxed">{feat}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════════════════ TRUST / SECURITY ════════════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center text-balance">
              {t('landing.trust.title')}
            </h2>
            <p className="mt-3 text-muted-foreground text-center max-w-lg mx-auto">
              {t('landing.trust.subtitle')}
            </p>
          </Reveal>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trustItems.map((item, i) => (
              <Reveal key={item.tKey} delay={i * 80}>
                <div className="text-center p-5">
                  <div className="h-12 w-12 rounded-xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                    <item.icon className="h-5 w-5 text-foreground/70" />
                  </div>
                  <h3 className="font-bold text-[15px] mb-1.5">{t(`landing.trust.${item.tKey}Title`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t(`landing.trust.${item.tKey}Text`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ FOUNDER STORY ════════════════════════ */}
      {/* Single first-person block from the founder. We intentionally do NOT
          ship fabricated user testimonials here — the EU UCPD directive and
          2024 CMA / DGCCRF / LCU guidance explicitly prohibit undisclosed
          invented reviews, and the fines are material for consumer apps.
          When real user quotes land (with written consent + verifiable
          context), expand this section into a 3-quote grid alongside the
          founder voice. Until then, the founder story is the authentic,
          legally safe trust signal. */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <p className="text-sm font-semibold text-brand text-center uppercase tracking-widest mb-6">
              {t('landing.founderStory.eyebrow')}
            </p>
            <figure className="text-center">
              <blockquote className="text-xl sm:text-2xl leading-relaxed font-medium text-foreground/90 text-balance">
                <span aria-hidden="true" className="text-brand/40 mr-1">“</span>
                {t('landing.founderStory.quote')}
                <span aria-hidden="true" className="text-brand/40 ml-1">”</span>
              </blockquote>
              <figcaption className="mt-6 flex items-center justify-center gap-3">
                <div className="h-10 w-10 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-sm">
                  D
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">{t('landing.founderStory.author')}</p>
                  <p className="text-xs text-muted-foreground">{t('landing.founderStory.role')}</p>
                </div>
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════ LEARN / FROM THE BLOG ════════════════════════ */}
      {/* Deep-linked homepage → blog articles. Googlebot + readers both land
          here after seeing product + trust; the pattern pushes authority from
          the homepage into every featured article and signals topical breadth
          to Google. Hidden if the blog corpus is empty in the current
          language (rare, but valid — keeps the layout clean). */}
      {blogArticles.length > 0 && (
        <section className="py-20 sm:py-28 bg-muted/20 scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <div className="text-center mb-14">
                <p className="text-sm font-semibold text-brand uppercase tracking-widest mb-3">
                  {t('landing.learn.eyebrow')}
                </p>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance">
                  {t('blog.index.title')}
                </h2>
                <p className="mt-4 text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  {t('blog.index.subtitle')}
                </p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {blogArticles.map((article) => (
                  <ArticleCard
                    key={article.slug}
                    article={article}
                    onClick={() => track('cta_click', { cta_location: 'landing_learn', cta_label: 'article_card', slug: article.slug })}
                  />
                ))}
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="text-center mt-12">
                <Link
                  to={blogUrl(blogLang)}
                  onClick={() => track('cta_click', { cta_location: 'landing_learn', cta_label: 'view_all' })}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                >
                  {t('landing.learn.viewAll')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ════════════════════════ FAQ ════════════════════════ */}
      <section id="faq" className="py-20 sm:py-28 bg-muted/20 scroll-mt-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-12">
              {t('landing.faq.title')}
            </h2>
          </Reveal>

          <Reveal delay={100}>
            <div className="bg-white rounded-2xl border border-border/60 px-6 sm:px-8 shadow-sm">
              {faqItems.map((item, i) => (
                <FAQItem key={i} question={item.question} answer={item.answer} questionId={item.id} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════ CLOSING CTA ════════════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative rounded-3xl bg-brand text-white overflow-hidden px-6 sm:px-12 py-14 sm:py-20 text-center">
              {/* Decorative circles */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3 pointer-events-none" />

              <h2 className="relative text-3xl sm:text-4xl font-extrabold tracking-tight text-balance max-w-lg mx-auto">
                {t('landing.cta.title')}
              </h2>
              <p className="relative mt-4 text-white/75 max-w-md mx-auto">
                {t('landing.cta.subtitle')}
              </p>
              <Link
                to="/login?mode=signup"
                onClick={() => handleCta('closing_cta', 'get_started')}
                className="relative inline-flex items-center gap-2 bg-white text-brand font-semibold px-8 py-3.5 rounded-xl mt-8 hover:bg-white/90 transition-colors shadow-lg"
              >
                {t('landing.cta.button')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Back to top ── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
        className={cn(
          'fixed bottom-6 right-6 z-40 h-10 w-10 rounded-full bg-brand text-white shadow-lg flex items-center justify-center hover:bg-brand-hover transition-[opacity,transform,background-color] duration-300 cursor-pointer',
          scrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        <ChevronUp className="h-5 w-5" />
      </button>

      {/* ════════════════════════ FOOTER ════════════════════════ */}
      <footer className="border-t border-border/50 bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-10 sm:gap-16">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center">
                  <Home className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-[15px]">CasaTab</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">{t('landing.footer.tagline')}</p>
            </div>

            {/* Product links */}
            <div>
              <h4 className="font-semibold text-sm mb-3">{t('landing.footer.product')}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => scrollTo('features')} className="hover:text-foreground transition-colors cursor-pointer">{t('landing.nav.features')}</button></li>
                <li><button onClick={() => scrollTo('how-it-works')} className="hover:text-foreground transition-colors cursor-pointer">{t('landing.nav.howItWorks')}</button></li>
                <li><Link to="/pricing" className="hover:text-foreground transition-colors">{t('landing.nav.pricing')}</Link></li>
                <li><Link to={i18n.language.startsWith('en') ? '/blog' : `/${i18n.language.split('-')[0]}/blog`} className="hover:text-foreground transition-colors">{t('landing.nav.blog')}</Link></li>
                <li><button onClick={() => scrollTo('faq')} className="hover:text-foreground transition-colors cursor-pointer">{t('landing.nav.faq')}</button></li>
              </ul>
            </div>

            {/* Legal links */}
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
              {SUPPORTED_LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => switchLanguage(lang.code)}
                  className={cn(
                    'px-2 py-1 rounded text-xs transition-colors cursor-pointer',
                    i18n.language.startsWith(lang.code) ? 'bg-brand/10 text-brand font-medium' : 'hover:bg-muted/50',
                  )}
                >
                  {lang.code.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
