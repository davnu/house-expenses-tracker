import { useEffect } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, Sparkles, ArrowRight, Users, Landmark, Target, Download, HardDrive, FolderOpen } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { PRICES } from '@/lib/billing'
import { track } from '@/lib/analytics'

/**
 * Public pricing page — SEO-indexable marketing surface.
 *
 * Shown at /pricing. Acts as a pre-commit reference for curious users,
 * bloggers, referrers and Product Hunt/Indie Hackers reviewers who want
 * to understand what Pro costs before creating an account.
 *
 * Does not require auth. Analytics (Umami) track landings + CTA clicks;
 * this is a public route so it's explicitly allowed to fire events per
 * the `isAppRoute()` policy in CLAUDE.md.
 */
export function PricingPage() {
  const { t } = useTranslation()

  useEffect(() => {
    track('pricing_view')
  }, [])

  const handleCtaClick = (which: 'free' | 'pro') => {
    track('pricing_cta_click', { plan: which })
  }

  const freeIncludes = [
    'billing.section.freeFeature1',
    'billing.section.freeFeature2',
    'billing.section.freeFeature3',
    // Storage quota — parallel position to Pro's `features.storage` so readers
    // compare 50 MB ↔ 500 MB at the same index in both columns.
    'billing.features.storageFree',
  ] as const

  const proAdds: Array<{ key: string; icon: typeof Users }> = [
    { key: 'billing.features.invites', icon: Users },
    { key: 'billing.features.advancedMortgage', icon: Landmark },
    { key: 'billing.features.budget', icon: Target },
    { key: 'billing.features.export', icon: Download },
    { key: 'billing.features.storage', icon: HardDrive },
  ]

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-bold tracking-tight text-lg">
            CasaTab
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/login" className="text-muted-foreground hover:text-foreground">
              {t('auth.signInLink')}
            </Link>
            <Link
              to="/login"
              className={buttonVariants({ size: 'sm' })}
              onClick={() => handleCtaClick('free')}
            >
              {t('pricing.heroCta')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-primary text-sm font-medium mb-3 inline-flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            {t('pricing.eyebrow')}
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {t('pricing.title')}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t('pricing.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Free */}
          <div className="rounded-2xl border bg-card p-6 sm:p-8 flex flex-col">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{t('pricing.freeTitle')}</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {t('pricing.freeSubtitle')}
              </p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold">€0</span>
              <span className="text-muted-foreground text-sm ml-1">
                {t('pricing.forever')}
              </span>
            </div>
            <ul className="space-y-2.5 mb-8 flex-1">
              {freeIncludes.map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-sm">
                  <Check className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/login"
              onClick={() => handleCtaClick('free')}
              className={buttonVariants({ variant: 'outline' }) + ' w-full'}
            >
              {t('pricing.freeCta')}
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-6 sm:p-8 flex flex-col relative">
            <span className="absolute -top-3 left-6 px-3 py-0.5 bg-primary text-primary-foreground text-xs font-semibold rounded-full">
              {t('pricing.recommended')}
            </span>
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{t('pricing.proTitle')}</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {t('pricing.proSubtitle')}
              </p>
            </div>
            <div className="mb-2">
              <span className="text-4xl font-bold">{PRICES.pro.display}</span>
              <span className="text-muted-foreground text-sm ml-1">
                {t('pricing.oneTimeLabel')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground italic mb-6">
              {t('billing.priceContext')}
            </p>
            <ul className="space-y-2.5 mb-8 flex-1">
              <li className="flex items-start gap-2.5 text-sm font-medium">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{t('pricing.everythingInFree')}</span>
              </li>
              {proAdds.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-2.5 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span className="flex items-start gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    {t(key)}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              to="/login"
              onClick={() => handleCtaClick('pro')}
              className={buttonVariants() + ' w-full'}
            >
              {t('pricing.proCta')}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Link>
          </div>
        </div>

        {/* Additional products */}
        <div className="max-w-md mx-auto mt-8">
          <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
            <FolderOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                {t('pricing.additionalHouseTitle', { price: PRICES.additional_house.display })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('pricing.additionalHouseDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* FAQ-lite */}
        <div className="max-w-2xl mx-auto mt-16 space-y-6">
          <h2 className="text-2xl font-bold text-center">
            {t('pricing.faqTitle')}
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <p className="font-medium text-sm">{t('pricing.faq1Q')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('pricing.faq1A')}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="font-medium text-sm">{t('pricing.faq2Q')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('pricing.faq2A')}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="font-medium text-sm">{t('pricing.faq3Q')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('pricing.faq3A')}</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} CasaTab</span>
          <nav className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">
              {t('common.privacyPolicy')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
