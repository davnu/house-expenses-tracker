import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { getDateLocale } from '@/lib/utils'
import { DEFAULT_AUTHOR, type Article } from '@/lib/blog'
import { Clock, Calendar, User } from 'lucide-react'

interface ArticleMetaProps {
  article: Article
  variant?: 'card' | 'hero'
}

export function ArticleMeta({ article, variant = 'card' }: ArticleMetaProps) {
  const { t } = useTranslation()
  const locale = getDateLocale()
  const published = format(new Date(article.publishedAt), 'PPP', { locale })
  const readingLabel = t('blog.article.readingTime', { count: article.readingTime })
  const categoryLabel = t(`blog.categories.${article.category}`)
  // Frontmatter override wins; fall back to the editorial default. A named
  // byline — even a team name — is a stronger E-E-A-T signal than none.
  const byline = article.author ?? DEFAULT_AUTHOR

  if (variant === 'hero') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 bg-brand/8 text-brand px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide">
          {categoryLabel}
        </span>
        <span className="inline-flex items-center gap-1.5" itemProp="author" itemScope itemType="https://schema.org/Person">
          <User className="h-3.5 w-3.5" />
          <span itemProp="name">{byline}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <time dateTime={article.publishedAt}>{published}</time>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {readingLabel}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1 bg-brand/8 text-brand px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide text-[10px]">
        {categoryLabel}
      </span>
      <span>{published}</span>
      <span>·</span>
      <span>{readingLabel}</span>
    </div>
  )
}
