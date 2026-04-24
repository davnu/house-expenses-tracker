import { describe, it, expect } from 'vitest'
import {
  getAllArticles,
  getArticle,
  getArticleByCanonicalSlug,
  getRelatedArticles,
  calculateReadingTime,
  extractHeadings,
  resolveAlternateUrls,
  blogUrl,
  fullBlogUrl,
  BLOG_LANGUAGES,
  type Article,
} from './blog'

describe('blog content loader', () => {
  it('loads articles in every supported language', () => {
    for (const lang of BLOG_LANGUAGES) {
      const articles = getAllArticles(lang)
      expect(articles.length, `${lang} should have at least 1 article`).toBeGreaterThan(0)
    }
  })

  it('sorts articles by publishedAt descending', () => {
    const en = getAllArticles('en')
    for (let i = 1; i < en.length; i++) {
      expect(en[i - 1].publishedAt >= en[i].publishedAt).toBe(true)
    }
  })

  it('filters articles by language (no cross-language bleed)', () => {
    const en = getAllArticles('en')
    const es = getAllArticles('es')
    expect(en.every((a) => a.lang === 'en')).toBe(true)
    expect(es.every((a) => a.lang === 'es')).toBe(true)
  })

  it('getArticle returns undefined for unknown slug', () => {
    expect(getArticle('definitely-not-a-real-slug', 'en')).toBeUndefined()
  })

  it('getArticle returns an article when slug matches', () => {
    const en = getAllArticles('en')
    expect(en.length).toBeGreaterThan(0)
    const article = getArticle(en[0].slug, 'en')
    expect(article).toBeDefined()
    expect(article?.title).toBe(en[0].title)
  })

  it('getArticleByCanonicalSlug finds the same article across languages', () => {
    const en = getAllArticles('en')[0] as Article
    const spanish = getArticleByCanonicalSlug(en.canonicalSlug, 'es')
    expect(spanish).toBeDefined()
    expect(spanish?.canonicalSlug).toBe(en.canonicalSlug)
    expect(spanish?.lang).toBe('es')
    // Translated slug differs from English slug (localised for SEO)
    expect(spanish?.slug).not.toBe(en.slug)
  })

  it('resolveAlternateUrls returns one full URL per language', () => {
    const en = getAllArticles('en')[0] as Article
    const urls = resolveAlternateUrls(en.canonicalSlug)
    for (const lang of BLOG_LANGUAGES) {
      expect(urls[lang]).toMatch(/^https:\/\/casatab\.com\//)
    }
  })

  it('blogUrl drops /en/ prefix for English and keeps prefix for other languages', () => {
    expect(blogUrl('en')).toBe('/blog/')
    expect(blogUrl('en', 'my-slug')).toBe('/blog/my-slug/')
    expect(blogUrl('es')).toBe('/es/blog/')
    expect(blogUrl('es', 'mi-slug')).toBe('/es/blog/mi-slug/')
  })

  it('fullBlogUrl includes the production domain', () => {
    expect(fullBlogUrl('en', 'my-slug')).toBe('https://casatab.com/blog/my-slug/')
    expect(fullBlogUrl('fr', 'mon-slug')).toBe('https://casatab.com/fr/blog/mon-slug/')
  })
})

describe('calculateReadingTime', () => {
  it('returns at least 1 minute for any non-empty content', () => {
    expect(calculateReadingTime('hello world')).toBe(1)
    expect(calculateReadingTime('')).toBe(1)
  })

  it('calculates ~1 minute per 200 words', () => {
    const text = Array(600).fill('word').join(' ')
    expect(calculateReadingTime(text)).toBe(3)
  })

  it('strips code blocks from word count', () => {
    const code = '```js\n' + Array(1000).fill('const x = 1').join('\n') + '\n```'
    // Only "hello world" counts — reading time should be 1
    expect(calculateReadingTime(`hello world\n\n${code}`)).toBe(1)
  })
})

describe('extractHeadings', () => {
  it('pulls h2/h3 with stable slug IDs', () => {
    const html = '<h2>First section</h2><p>x</p><h3>A subsection</h3><h2>Second section</h2>'
    const headings = extractHeadings(html)
    expect(headings).toHaveLength(3)
    expect(headings[0]).toEqual({ id: 'first-section', level: 2, text: 'First section' })
    expect(headings[1]).toEqual({ id: 'a-subsection', level: 3, text: 'A subsection' })
    expect(headings[2]).toEqual({ id: 'second-section', level: 2, text: 'Second section' })
  })

  it('deduplicates identical headings with a numeric suffix', () => {
    const html = '<h2>Overview</h2><h2>Overview</h2>'
    const headings = extractHeadings(html)
    expect(headings[0].id).toBe('overview')
    expect(headings[1].id).toBe('overview-2')
  })

  it('ignores headings other than h2/h3', () => {
    const html = '<h1>Title</h1><h4>Caption</h4>'
    expect(extractHeadings(html)).toEqual([])
  })
})

describe('getRelatedArticles', () => {
  it('returns same-language articles (no cross-language bleed)', () => {
    const en = getAllArticles('en')
    if (en.length > 0) {
      const related = getRelatedArticles(en[0], 5)
      expect(related.every((a) => a.lang === 'en')).toBe(true)
      expect(related.every((a) => a.slug !== en[0].slug)).toBe(true)
    }
  })

  it('respects the limit argument', () => {
    const en = getAllArticles('en')
    if (en.length > 0) {
      expect(getRelatedArticles(en[0], 1).length).toBeLessThanOrEqual(1)
    }
  })
})

/**
 * Parity guards — catch the "added an article in English, forgot nl.md"
 * or "left the canonicalSlug as the English slug in every file" class of bug.
 *
 * The blog pipeline silently falls back to the blog index for missing
 * language variants (via `resolveAlternateUrls`), so these regressions do
 * not throw at build time — they just quietly ship a worse experience to
 * the affected language's readers. Catch them at CI instead.
 */
describe('per-article language parity', () => {
  const allCanonical = Array.from(
    new Set(BLOG_LANGUAGES.flatMap((l) => getAllArticles(l).map((a) => a.canonicalSlug))),
  )

  for (const canonical of allCanonical) {
    it(`"${canonical}" is translated into every supported language`, () => {
      const missing = BLOG_LANGUAGES.filter((l) => !getArticleByCanonicalSlug(canonical, l))
      expect(missing, `missing translations: ${missing.join(', ')}`).toEqual([])
    })

    it(`"${canonical}" uses a localized slug per language (not the English one in every file)`, () => {
      const slugs = BLOG_LANGUAGES.map((l) => getArticleByCanonicalSlug(canonical, l)?.slug).filter(
        (s): s is string => Boolean(s),
      )
      // At least 2 distinct slug strings — EN + at least one localized variant.
      // Catches the "slug = canonicalSlug in every language" mistake.
      expect(new Set(slugs).size, `every language shares slug "${slugs[0]}"`).toBeGreaterThan(1)
    })
  }
})
