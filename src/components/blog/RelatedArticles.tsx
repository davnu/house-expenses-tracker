import { useTranslation } from 'react-i18next'
import { track } from '@/lib/analytics'
import type { Article } from '@/lib/blog'
import { ArticleCard } from './ArticleCard'

interface RelatedArticlesProps {
  articles: Article[]
  fromSlug: string
}

export function RelatedArticles({ articles, fromSlug }: RelatedArticlesProps) {
  const { t } = useTranslation()

  if (articles.length === 0) return null

  return (
    <section className="mt-16 pt-12 border-t border-border/60">
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-8">
        {t('blog.article.relatedArticles')}
      </h2>
      <div className="grid sm:grid-cols-2 gap-5">
        {articles.map((article) => (
          <ArticleCard
            key={article.slug}
            article={article}
            onClick={() => track('blog_related_click', { from_slug: fromSlug, to_slug: article.slug })}
          />
        ))}
      </div>
    </section>
  )
}
