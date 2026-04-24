import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useAuth } from '@/context/AuthContext'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { track } from '@/lib/analytics'
import { cn, getDateLocale } from '@/lib/utils'
import {
  blogUrl,
  getArticle,
  getRelatedArticles,
  loadArticleBody,
  resolveAlternateUrls,
  type Article,
  type ArticleBody,
  type BlogLang,
} from '@/lib/blog'
import { BlogHeader } from '@/components/blog/BlogHeader'
import { BlogFooter } from '@/components/blog/BlogFooter'
import { ReadingProgress } from '@/components/blog/ReadingProgress'
import { TableOfContents } from '@/components/blog/TableOfContents'
import { ArticleMeta } from '@/components/blog/ArticleMeta'
import { RelatedArticles } from '@/components/blog/RelatedArticles'
import { ArrowLeft, ArrowRight, Share2, Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'

export function BlogArticlePage({ lang: propLang }: { lang?: BlogLang }) {
  const params = useParams()
  const lang = (propLang ?? (params.lang as BlogLang)) ?? 'en'
  const slug = params.slug as string

  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  useAnalytics()

  const article = useMemo(() => getArticle(slug, lang), [slug, lang])
  const related = useMemo(() => (article ? getRelatedArticles(article, 2) : []), [article])
  const alternateUrls = useMemo(
    () => (article ? resolveAlternateUrls(article.canonicalSlug) : undefined),
    [article],
  )

  // Lazy-load the body. The Vite plugin emits each article's rendered HTML
  // as its own chunk, so navigating to /blog/foo only downloads that one
  // article's body payload — not every article's HTML eagerly.
  //
  // SSR note: on first paint the pre-rendered HTML from generate-seo-pages
  // is already in the DOM; React hydrates it, and this effect swaps in the
  // same HTML once the body chunk arrives. Readers never see a blank state
  // because the article root is rendered empty (dangerouslySetInnerHTML with
  // an empty string leaves the hydrated DOM visually intact) — see
  // ArticleLayout for the precise behaviour.
  const [body, setBody] = useState<ArticleBody | null>(null)
  useEffect(() => {
    if (!article) return
    let cancelled = false
    loadArticleBody(article.slug, article.lang).then((result) => {
      if (!cancelled) setBody(result ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [article])

  useDocumentTitle(article ? `${article.title} — CasaTab` : 'CasaTab')

  useEffect(() => {
    if (!i18n.language.startsWith(lang)) i18n.changeLanguage(lang)
  }, [i18n, lang])

  useEffect(() => {
    if (article) {
      track('blog_article_view', {
        slug: article.slug,
        lang: article.lang,
        category: article.category,
      })
    }
  }, [article])

  const articleRef = useRef<HTMLElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const completeFiredRef = useRef(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !article) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !completeFiredRef.current) {
            completeFiredRef.current = true
            track('blog_article_complete', { slug: article.slug, lang: article.lang })
            observer.disconnect()
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [article])

  if (!article) {
    return <Navigate to={blogUrl(lang)} replace />
  }

  return (
    <div className="min-h-screen bg-white text-foreground">
      <BlogHeader lang={lang} alternateUrls={alternateUrls} autoHide />
      <ReadingProgress articleRef={articleRef} />

      <main className="pt-24 pb-16">
        {/* Back-link */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Link
            to={blogUrl(lang)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('blog.article.backToBlog')}
          </Link>
        </div>

        {/* Article header */}
        <header className="mx-auto max-w-3xl px-4 sm:px-6 mt-8 text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-balance leading-tight">
            {article.title}
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            {article.excerpt}
          </p>
          <div className="mt-6 flex justify-center">
            <ArticleMeta article={article} variant="hero" />
          </div>
        </header>

        {/* Hero illustration */}
        {article.heroImage && (
          <figure className="mx-auto max-w-5xl px-4 sm:px-6 mt-10">
            <div className="rounded-2xl overflow-hidden border border-border/60 bg-[#F6F1E8] aspect-[16/9]">
              <img
                src={article.heroImage}
                srcSet={buildHeroSrcSet(article.heroImage)}
                sizes="(min-width: 1024px) 960px, (min-width: 640px) 90vw, 100vw"
                alt={article.heroImageAlt ?? ''}
                width={1600}
                height={900}
                className="w-full h-full object-cover"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            {article.heroImageAlt && (
              <figcaption className="sr-only">{article.heroImageAlt}</figcaption>
            )}
          </figure>
        )}

        {/* Article body + TOC */}
        <ArticleLayout article={article} body={body} articleRef={articleRef} />

        {/* Completion sentinel (fires blog_article_complete when entering view) */}
        <div ref={sentinelRef} aria-hidden className="h-px" />

        {/* Closing CTA */}
        <section className="mx-auto max-w-3xl px-4 sm:px-6 mt-16">
          <div className="relative rounded-3xl bg-brand text-white overflow-hidden px-6 sm:px-12 py-14 text-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3 pointer-events-none" />
            <h2 className="relative text-2xl sm:text-3xl font-extrabold tracking-tight text-balance max-w-lg mx-auto">
              {t('blog.article.ctaTitle')}
            </h2>
            <p className="relative mt-4 text-white/75 max-w-md mx-auto">
              {t('blog.article.ctaSubtitle')}
            </p>
            <Link
              to={user ? '/app' : '/login?mode=signup'}
              onClick={() =>
                track('cta_click', {
                  cta_location: 'blog_article_end',
                  cta_label: user ? 'open_app' : 'start_tracking',
                  slug: article.slug,
                })
              }
              className="relative inline-flex items-center gap-2 bg-white text-brand font-semibold px-8 py-3.5 rounded-xl mt-8 hover:bg-white/90 transition-colors shadow-lg"
            >
              {user ? t('landing.nav.openApp') : t('blog.article.ctaButton')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Related */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <RelatedArticles articles={related} fromSlug={article.slug} />
        </div>
      </main>

      <BlogFooter lang={lang} />
    </div>
  )
}

/* ── Article body + TOC grid (extracted for readability) ── */

function ArticleLayout({
  article,
  body,
  articleRef,
}: {
  article: Article
  body: ArticleBody | null
  articleRef: React.RefObject<HTMLElement | null>
}) {
  const { t } = useTranslation()
  // Headings only become available once the body chunk loads. TOC hides
  // itself until then — showing "Loading contents…" would be worse than
  // a brief empty sidebar on a fast connection.
  const headings = body?.headings ?? []
  const showUpdated = article.updatedAt !== article.publishedAt

  const locale = getDateLocale()
  const updated = format(new Date(article.updatedAt), 'PPP', { locale })

  // Click-delegation for inline CasaTab CTAs inside the markdown body.
  // Markdown is rendered via dangerouslySetInnerHTML, so individual <a> tags
  // can't bind React handlers — one listener on the article container catches
  // every bubbling anchor click and fires the same `cta_click` event that the
  // closing CTA panel uses, with a distinct cta_location for attribution.
  const onBodyClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (!isCasaTabCta(href)) return
      track('cta_click', {
        cta_location: 'blog_article_inline',
        cta_label: 'inline_link',
        slug: article.slug,
        href,
      })
    },
    [article.slug],
  )

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 mt-12">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_220px] gap-8 lg:gap-12">
        <article
          ref={articleRef}
          onClick={onBodyClick}
          className={cn(
            'prose prose-lg max-w-none',
            'prose-headings:font-extrabold prose-headings:tracking-tight',
            'prose-h2:text-2xl sm:prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-4',
            'prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3',
            'prose-p:text-base prose-p:leading-relaxed prose-p:text-foreground/85',
            'prose-li:leading-relaxed',
            'prose-strong:text-foreground',
            'prose-table:text-sm',
            'prose-th:text-left prose-th:font-semibold',
            'prose-img:rounded-xl',
          )}
          // Empty string during the async body load keeps the SSR-hydrated
          // DOM intact (React preserves existing children when innerHTML is
          // set to the same value it already has). Once `body` arrives React
          // writes the identical HTML back — imperceptible to the reader.
          dangerouslySetInnerHTML={{ __html: body?.html ?? '' }}
        />

        {/* Sticky TOC (lg and up) */}
        <div>
          <div className="lg:hidden">
            {headings.length > 1 && <TableOfContents headings={headings} />}
          </div>
          <div className="hidden lg:block">
            {headings.length > 1 && <TableOfContents headings={headings} />}
          </div>

          {/* Share row + updated-on — below TOC on desktop, stacked under h1 on mobile (rendered via a separate hidden-lg wrapper) */}
          <div className="hidden lg:block mt-10 pt-6 border-t border-border/60">
            <ShareRow article={article} />
            {showUpdated && (
              <p className="mt-4 text-xs text-muted-foreground">
                {t('blog.article.updatedOn', { date: updated })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile share row — below article */}
      <div className="lg:hidden mt-10 pt-6 border-t border-border/60">
        <ShareRow article={article} />
        {showUpdated && (
          <p className="mt-4 text-xs text-muted-foreground">
            {t('blog.article.updatedOn', { date: updated })}
          </p>
        )}
      </div>
    </section>
  )
}

/* ── Share buttons: native share on mobile, copy-link on desktop ── */

function ShareRow({ article }: { article: ReturnType<typeof getArticle> & object }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    track('blog_share', { slug: article.slug, platform: 'native' })
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: article.title, text: article.excerpt, url })
        return
      } catch {
        // User cancelled or share failed — fall through to copy-link behaviour
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('blog.article.share')}
      </span>
      <button
        onClick={share}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/50 transition-colors cursor-pointer"
        aria-label={t('blog.article.share')}
      >
        {copied ? (
          <>
            <LinkIcon className="h-3.5 w-3.5" />
            {t('blog.article.copied')}
          </>
        ) : (
          <>
            <Share2 className="h-3.5 w-3.5" />
            {t('blog.article.copyLink')}
          </>
        )}
      </button>
    </div>
  )
}

/* ── Hero image helpers ── */

/**
 * Emits a responsive srcset pointing at size variants produced by
 * `scripts/generate-hero-variants.mjs` at build time. Variants follow the
 * `{basename}-{width}.webp` convention (e.g. `foo-hero-800.webp`). Non-webp
 * heroes (the legacy SVG) return `undefined` — the browser falls back to
 * the single `src`. In dev, if variants haven't been generated yet, browsers
 * transparently fall through to `src` when a srcset candidate 404s.
 */
function buildHeroSrcSet(src: string): string | undefined {
  if (!src.endsWith('.webp')) return undefined
  const base = src.replace(/\.webp$/, '')
  return `${base}-800.webp 800w, ${base}-1200.webp 1200w, ${src} 1600w`
}

/**
 * Returns true if the href points at a CasaTab conversion target.
 *
 * We intentionally include both `https://casatab.com` (used in article body
 * markdown, since cross-language articles share copy) and in-app paths
 * (`/login`, `/app`, `/?…`) that indicate the reader is heading to signup
 * or the product. Any other link — outbound authority sources, internal
 * links to other blog articles — is ignored for CTA attribution.
 */
function isCasaTabCta(href: string): boolean {
  if (!href) return false
  if (href.startsWith('https://casatab.com') || href.startsWith('http://casatab.com')) return true
  if (href.startsWith('/login') || href.startsWith('/app')) return true
  return false
}
