import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Article } from '@/lib/blog'
import { blogUrl } from '@/lib/blog'
import { ArticleMeta } from './ArticleMeta'
import { ArrowRight } from 'lucide-react'

/**
 * Cards don't repeat "Read article →" — the whole card IS the link, and a
 * trailing arrow on the title gives the affordance without the noise of
 * repeating labels down a grid.
 */

interface ArticleCardProps {
  article: Article
  variant?: 'featured' | 'default'
  onClick?: () => void
}

export function ArticleCard({ article, variant = 'default', onClick }: ArticleCardProps) {
  const { t } = useTranslation()
  const href = blogUrl(article.lang, article.slug)

  if (variant === 'featured') {
    return (
      <Link
        to={href}
        onClick={onClick}
        className="group block rounded-2xl border border-border/60 bg-white hover:shadow-lg hover:border-brand/20 transition-shadow duration-300 overflow-hidden"
      >
        <div className="grid md:grid-cols-2 gap-0">
          <div className="aspect-[16/10] md:aspect-auto bg-gradient-to-br from-brand/15 via-brand/8 to-[#2a9d90]/10 relative overflow-hidden">
            {article.heroImage ? (
              <img src={article.heroImage} alt={article.heroImageAlt ?? ''} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="font-extrabold text-brand/25 text-5xl md:text-7xl tracking-tight select-none">
                  CasaTab
                </div>
              </div>
            )}
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center bg-white/90 backdrop-blur text-brand text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
                {t('blog.index.featuredLabel')}
              </span>
            </div>
          </div>

          <div className="p-6 sm:p-8 flex flex-col justify-center">
            <ArticleMeta article={article} variant="card" />
            <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-balance group-hover:text-brand transition-colors inline-flex items-start gap-2">
              <span>{article.title}</span>
              <ArrowRight
                aria-hidden
                className="h-5 w-5 mt-1.5 shrink-0 text-brand opacity-0 -translate-x-1 transition-[opacity,transform] duration-300 group-hover:opacity-100 group-hover:translate-x-0"
              />
            </h2>
            <p className="mt-3 text-muted-foreground leading-relaxed line-clamp-3">
              {article.excerpt}
            </p>
            <span className="sr-only">{t('blog.index.readMore')}</span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link
      to={href}
      onClick={onClick}
      className="group flex flex-col rounded-xl border border-border/60 bg-white hover:shadow-md hover:border-brand/20 transition-shadow duration-300 overflow-hidden h-full"
    >
      <div className="aspect-[16/9] bg-gradient-to-br from-brand/15 via-brand/8 to-[#2a9d90]/10 relative overflow-hidden shrink-0">
        {article.heroImage ? (
          <img src={article.heroImage} alt={article.heroImageAlt ?? ''} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="font-extrabold text-brand/25 text-3xl tracking-tight select-none">
              CasaTab
            </div>
          </div>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <ArticleMeta article={article} variant="card" />
        <h3 className="mt-2.5 text-lg font-bold tracking-tight text-balance group-hover:text-brand transition-colors line-clamp-2 inline-flex items-start gap-1.5">
          <span>{article.title}</span>
          <ArrowRight
            aria-hidden
            className="h-4 w-4 mt-0.5 shrink-0 text-brand opacity-0 -translate-x-1 transition-[opacity,transform] duration-300 group-hover:opacity-100 group-hover:translate-x-0"
          />
        </h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">
          {article.excerpt}
        </p>
        <span className="sr-only">{t('blog.index.readMore')}</span>
      </div>
    </Link>
  )
}
