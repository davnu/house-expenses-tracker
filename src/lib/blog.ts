/**
 * Blog content loader.
 *
 * Markdown articles live in `src/content/blog/posts/{canonicalSlug}/{lang}.md`.
 * `vite-plugin-blog-articles.ts` transforms each file into precomputed JS
 * modules — one metadata module and one body module — so the client bundle
 * never ships `marked` or `isomorphic-dompurify`.
 *
 * Metadata is eager-bundled (fast sync access for listings, routing, and
 * related-article queries). Body HTML is lazy-loaded on demand (each
 * article's body becomes its own code-split chunk at build time), so
 * bundle size stays roughly flat as the corpus grows.
 */
import { z } from 'zod'

const DOMAIN = 'https://casatab.com'

export const BLOG_LANGUAGES = ['en', 'es', 'fr', 'de', 'nl', 'pt'] as const
export type BlogLang = (typeof BLOG_LANGUAGES)[number]

export const BLOG_CATEGORIES = ['costs', 'mortgage', 'renovation', 'legal', 'moving'] as const
export type BlogCategory = (typeof BLOG_CATEGORIES)[number]

/* ═══════════════════ Frontmatter schema ═══════════════════ */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be a valid calendar date')

const slugPattern = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, 'slug must be lowercase-kebab-case (letters, digits, hyphens)')

const ArticleFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  excerpt: z.string().min(1),
  slug: slugPattern,
  canonicalSlug: slugPattern,
  publishedAt: isoDate,
  updatedAt: isoDate.optional(),
  category: z.enum(BLOG_CATEGORIES),
  heroImage: z.string().optional(),
  /** Descriptive alt text for the hero image. Omit on decorative heroes. */
  heroImageAlt: z.string().optional(),
  /**
   * Named byline. Empty → renders the default "CasaTab Editorial". Name a
   * specific expert when you can — named human bylines are the strongest
   * E-E-A-T signal Google rewards in 2026.
   */
  author: z.string().optional(),
})
type ArticleFrontmatter = z.infer<typeof ArticleFrontmatterSchema>

export const DEFAULT_AUTHOR = 'CasaTab Editorial'

export interface Heading {
  id: string
  level: 2 | 3
  text: string
}

/** Lightweight, sync-accessible article record. Holds everything needed for
 *  listings, routing, hreflang, and the article header. */
export interface Article extends ArticleFrontmatter {
  lang: BlogLang
  wordCount: number
  readingTime: number
  /** Always populated — falls back to `publishedAt` when the frontmatter omits it. */
  updatedAt: string
}

/** Body artefacts — loaded lazily by `loadArticleBody`. */
export interface ArticleBody {
  body: string
  html: string
  headings: Heading[]
}

export type FullArticle = Article & ArticleBody

/* ═══════════════════ Precomputed modules ═══════════════════ */

type MetaModule = ArticleFrontmatter & { wordCount: number }

// Eager: every article's metadata is in the main bundle (tiny — a few KB
// total for 20+ articles). Needed synchronously by the router, the listing,
// and hreflang resolution.
const metaModules = import.meta.glob<MetaModule>(
  '/src/content/blog/posts/**/*.md',
  { query: '?meta', eager: true, import: 'default' },
)

// Lazy: each body is a dedicated chunk loaded on demand. The import is a
// thunk (`() => Promise<ArticleBody>`) that Vite code-splits per file.
const bodyModules = import.meta.glob<ArticleBody>(
  '/src/content/blog/posts/**/*.md',
  { query: '?body', import: 'default' },
)

/* ═══════════════════ Helpers ═══════════════════ */

function slugifyHeading(text: string, used: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  const seen = used.get(base) ?? 0
  used.set(base, seen + 1)
  return seen === 0 ? base : `${base}-${seen + 1}`
}

function addHeadingIds(html: string): { html: string; headings: Heading[] } {
  const used = new Map<string, number>()
  const headings: Heading[] = []
  const withIds = html.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (_, tag: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '').trim()
    const id = slugifyHeading(text, used)
    headings.push({ id, level: tag === 'h2' ? 2 : 3, text })
    return `<${tag} id="${id}">${inner}</${tag}>`
  })
  return { html: withIds, headings }
}

export function calculateReadingTime(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, '')
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

/** Wraps a plugin-emitted meta module in an Article, validating frontmatter. */
function buildArticle(path: string, mod: MetaModule): Article | null {
  const match = path.match(/\/posts\/([^/]+)\/(en|es|fr|de|nl|pt)\.md$/)
  if (!match) return null
  const [, , lang] = match
  const { wordCount, ...frontmatter } = mod
  const result = ArticleFrontmatterSchema.safeParse(frontmatter)
  if (!result.success) {
    const summary = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ')
    throw new Error(`[blog] Invalid frontmatter in ${path} — ${summary}`)
  }
  const fm = result.data
  return {
    ...fm,
    updatedAt: fm.updatedAt ?? fm.publishedAt,
    lang: lang as BlogLang,
    wordCount,
    readingTime: Math.max(1, Math.round(wordCount / 200)),
  }
}

/* ═══════════════════ Load metadata ═══════════════════ */

const ARTICLES: readonly Article[] = Object.entries(metaModules)
  .map(([path, mod]) => buildArticle(path, mod))
  .filter((a): a is Article => a !== null)
  .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))

// Resolve path → body-loader for fast lazy access by slug+lang.
// Key: `${lang}|${slug}` ; Value: () => Promise<ArticleBody>
const BODY_LOADERS = new Map<string, () => Promise<ArticleBody>>()
for (const [path, loader] of Object.entries(bodyModules)) {
  const match = path.match(/\/posts\/([^/]+)\/(en|es|fr|de|nl|pt)\.md$/)
  if (!match) continue
  const [, , lang] = match
  // Need the article's slug, which lives in the corresponding metaModule.
  const meta = metaModules[path]
  if (!meta) continue
  BODY_LOADERS.set(`${lang}|${meta.slug}`, loader)
}

// Dev-only sanity check: collision between two articles in the same language
// is a content bug (second one silently shadows the first in getArticle).
if (import.meta.env?.DEV) {
  const seen = new Set<string>()
  for (const a of ARTICLES) {
    const key = `${a.lang}|${a.slug}`
    if (seen.has(key)) {
      // eslint-disable-next-line no-console
      console.warn(`[blog] Duplicate slug "${a.slug}" in language "${a.lang}" — second article shadows the first`)
    }
    seen.add(key)
  }
}

/* ═══════════════════ Public API ═══════════════════ */

export function getAllArticles(lang: BlogLang): Article[] {
  return ARTICLES.filter((a) => a.lang === lang)
}

export function getArticle(slug: string, lang: BlogLang): Article | undefined {
  return ARTICLES.find((a) => a.lang === lang && a.slug === slug)
}

export function getArticleByCanonicalSlug(canonicalSlug: string, lang: BlogLang): Article | undefined {
  return ARTICLES.find((a) => a.lang === lang && a.canonicalSlug === canonicalSlug)
}

export function getRelatedArticles(article: Article, limit = 2): Article[] {
  const sameLang = ARTICLES.filter((a) => a.lang === article.lang && a.slug !== article.slug)
  const sameCategory = sameLang.filter((a) => a.category === article.category)
  const rest = sameLang.filter((a) => a.category !== article.category)
  return [...sameCategory, ...rest].slice(0, limit)
}

export function getAllCanonicalSlugs(): string[] {
  return Array.from(new Set(ARTICLES.map((a) => a.canonicalSlug)))
}

export function getArticlesByCanonicalSlug(canonicalSlug: string): Article[] {
  return ARTICLES.filter((a) => a.canonicalSlug === canonicalSlug)
}

/**
 * Lazy-load an article's body (rendered HTML + headings + source markdown).
 * Each body is its own chunk, so navigating to an article only downloads
 * that one article's body payload.
 */
export async function loadArticleBody(
  slug: string,
  lang: BlogLang,
): Promise<ArticleBody | undefined> {
  const loader = BODY_LOADERS.get(`${lang}|${slug}`)
  if (!loader) return undefined
  return loader()
}

export function extractHeadings(html: string): Heading[] {
  return addHeadingIds(html).headings
}

export function blogUrl(lang: BlogLang, slug?: string): string {
  const base = lang === 'en' ? '/blog/' : `/${lang}/blog/`
  return slug ? `${base}${slug}/` : base
}

export function fullBlogUrl(lang: BlogLang, slug?: string): string {
  return `${DOMAIN}${blogUrl(lang, slug)}`
}

/**
 * Returns a lang → full-URL map for hreflang + language switcher.
 * Falls back to the blog index for languages where the article isn't translated yet.
 */
export function resolveAlternateUrls(canonicalSlug: string): Record<BlogLang, string> {
  const out = {} as Record<BlogLang, string>
  for (const lang of BLOG_LANGUAGES) {
    const article = getArticleByCanonicalSlug(canonicalSlug, lang)
    out[lang] = article ? fullBlogUrl(lang, article.slug) : fullBlogUrl(lang)
  }
  return out
}
