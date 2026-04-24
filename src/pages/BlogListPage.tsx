import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import {
  getAllArticles,
  BLOG_CATEGORIES,
  BLOG_LANGUAGES,
  fullBlogUrl,
  blogUrl,
  type BlogCategory,
  type BlogLang,
} from '@/lib/blog'
import { BlogHeader } from '@/components/blog/BlogHeader'
import { BlogFooter } from '@/components/blog/BlogFooter'
import { ArticleCard } from '@/components/blog/ArticleCard'
import { ArrowLeft, ArrowRight } from 'lucide-react'

export function BlogListPage({
  lang: propLang,
  category: propCategory,
}: {
  lang?: BlogLang
  /**
   * When set (via the `/blog/category/{cat}` route), the page renders a
   * dedicated archive for that one category. The filter chips still work
   * for client-side exploration, but the H1, title, subtitle and SEO
   * signals all anchor the page to the locked category — turning the
   * route into a canonical topic hub that Google can cluster on.
   */
  category?: BlogCategory
}) {
  const params = useParams()
  // `propLang` is set when routed from `<Route path="/blog" element={<BlogListPage lang="en" />}/>`
  // On the localised routes we read `:lang` from params.
  const lang = (propLang ?? (params.lang as BlogLang)) ?? 'en'

  // The category routes (`/blog/category/:category`) pass it via URL. An
  // unknown category would otherwise silently render the full blog index,
  // which creates infinite low-value URLs for Googlebot to crawl (classic
  // thin-content penalty). Detect the mismatch here so we can redirect
  // below — keeping /blog/category/* strictly mapped to real categories.
  const paramCategory = params.category as string | undefined
  const isKnownCategory =
    paramCategory !== undefined &&
    (BLOG_CATEGORIES as readonly string[]).includes(paramCategory)
  const hasInvalidCategoryParam = paramCategory !== undefined && !isKnownCategory
  const resolvedLockedCategory: BlogCategory | undefined =
    propCategory ?? (isKnownCategory ? (paramCategory as BlogCategory) : undefined)

  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  useAnalytics()

  const articles = useMemo(() => getAllArticles(lang), [lang])
  const [filter, setFilter] = useState<BlogCategory | 'all'>(resolvedLockedCategory ?? 'all')

  // Invalid /blog/category/{bogus} → bounce to /blog. Keeps crawl surface
  // clean and avoids duplicate content showing the full index under a junk
  // path. `replace` so the bad URL doesn't stay in history.
  if (hasInvalidCategoryParam) {
    return <Navigate to={blogUrl(lang)} replace />
  }

  // Per-language blog-index URLs for the header's language switcher. Without
  // this, clicking a language in the globe dropdown would only flip the i18n
  // state (not navigate) — but `lang` is derived from the URL, so
  // `getAllArticles(lang)` keeps returning English articles and the UI feels
  // broken. `BlogArticlePage` builds this via `resolveAlternateUrls`; here
  // we just point every language at its own blog index.
  const alternateUrls = useMemo(() => {
    const out = {} as Record<BlogLang, string>
    for (const l of BLOG_LANGUAGES) out[l] = fullBlogUrl(l)
    return out
  }, [])

  // Featured only exists on the "all" view. When a category is selected, every
  // matching article appears in the grid — including the one that would have
  // been featured. This avoids the "filter hides every article" edge case when
  // the only article in a category also happens to be the newest overall.
  const filtered = filter === 'all' ? articles : articles.filter((a) => a.category === filter)
  const featured = filter === 'all' ? articles[0] : undefined
  const rest = featured ? filtered.filter((a) => a.slug !== featured.slug) : filtered

  const categoryLabel = resolvedLockedCategory ? t(`blog.categories.${resolvedLockedCategory}`) : ''
  const pageTitle = resolvedLockedCategory
    ? `${categoryLabel} — ${t('blog.index.title')} — CasaTab`
    : articles.length > 0
      ? `${t('blog.index.title')} — CasaTab`
      : 'CasaTab Blog'
  useDocumentTitle(pageTitle)

  // Sync i18n with the URL-declared language (pre-rendered HTML sets localStorage
  // before React mounts, but direct SPA navigation into /es/blog needs us to
  // switch explicitly).
  useEffect(() => {
    if (!i18n.language.startsWith(lang)) i18n.changeLanguage(lang)
  }, [i18n, lang])

  useEffect(() => {
    track('blog_index_view', { lang })
  }, [lang])

  const categoriesPresent = Array.from(new Set(articles.map((a) => a.category))) as BlogCategory[]
  const orderedCategories = BLOG_CATEGORIES.filter((c) => categoriesPresent.includes(c))

  const handleCta = (cta_location: string, cta_label: string) => {
    track('cta_click', { cta_location, cta_label })
  }

  return (
    <div className="min-h-screen bg-white text-foreground">
      <BlogHeader lang={lang} alternateUrls={alternateUrls} />

      <main className="pt-28 pb-16">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
          {resolvedLockedCategory && (
            <Link
              to={blogUrl(lang)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('blog.category.backToAll')}
            </Link>
          )}
          <p className="text-sm font-semibold text-brand uppercase tracking-widest mb-3">
            {resolvedLockedCategory ? categoryLabel : t('blog.index.eyebrow')}
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-balance">
            {resolvedLockedCategory ? categoryLabel : t('blog.index.title')}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            {resolvedLockedCategory
              ? t('blog.category.subtitle', {
                  // German nouns stay capitalised; romance languages read
                  // better with the lowercased form. Branch on the BCP-47
                  // language tag so interpolation feels native everywhere.
                  category: lang === 'de' ? categoryLabel : categoryLabel.toLowerCase(),
                })
              : t('blog.index.subtitle')}
          </p>
        </section>

        {articles.length === 0 ? (
          <section className="mx-auto max-w-3xl px-4 sm:px-6 mt-20 text-center">
            <p className="text-muted-foreground">{t('blog.index.noArticles')}</p>
            <Link
              to={lang === 'en' ? '/' : `/${lang}/`}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand"
            >
              {t('blog.index.backToHome')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : (
          <>
            {/* Featured */}
            {featured && (
              <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-14">
                <ArticleCard article={featured} variant="featured" />
              </section>
            )}

            {/* Category chips */}
            {orderedCategories.length > 1 && (
              <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12">
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => setFilter('all')}
                    className={cn(
                      'px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer',
                      filter === 'all'
                        ? 'bg-brand text-white'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {t('blog.categories.all')}
                  </button>
                  {orderedCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilter(cat)}
                      className={cn(
                        'px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer',
                        filter === cat
                          ? 'bg-brand text-white'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {t(`blog.categories.${cat}`)}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Article grid */}
            {rest.length > 0 && (
              <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-10">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {rest.map((article) => (
                    <ArticleCard key={article.slug} article={article} />
                  ))}
                </div>
              </section>
            )}

            {/* Closing CTA */}
            <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-20">
              <div className="relative rounded-3xl bg-brand text-white overflow-hidden px-6 sm:px-12 py-14 sm:py-16 text-center">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3 pointer-events-none" />
                <h2 className="relative text-3xl sm:text-4xl font-extrabold tracking-tight text-balance max-w-lg mx-auto">
                  {t('blog.article.ctaTitle')}
                </h2>
                <p className="relative mt-4 text-white/75 max-w-md mx-auto">
                  {t('blog.article.ctaSubtitle')}
                </p>
                <Link
                  to={user ? '/app' : '/login?mode=signup'}
                  onClick={() => handleCta('blog_index_cta', user ? 'open_app' : 'start_tracking')}
                  className="relative inline-flex items-center gap-2 bg-white text-brand font-semibold px-8 py-3.5 rounded-xl mt-8 hover:bg-white/90 transition-colors shadow-lg"
                >
                  {user ? t('landing.nav.openApp') : t('blog.article.ctaButton')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
          </>
        )}
      </main>

      <BlogFooter lang={lang} />
    </div>
  )
}
