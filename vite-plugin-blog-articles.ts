/**
 * vite-plugin-blog-articles.ts
 *
 * Transforms blog article markdown files into precomputed JS modules so
 * `marked` + `isomorphic-dompurify` never ship to the browser.
 *
 * Pipeline (per `.md` file under `src/content/blog/posts/`):
 *   1. Extract frontmatter with a minimal YAML-subset regex (same parser
 *      the client used to run) and body.
 *   2. Render body with `marked` → HTML.
 *   3. Sanitise with `isomorphic-dompurify`.
 *   4. Post-process h2/h3 to inject slugified `id` attributes and collect
 *      the headings list for table-of-contents anchoring.
 *   5. Emit a JS module whose default export is the precomputed Article
 *      data. `src/lib/blog.ts` imports these directly — zero markdown work
 *      at runtime, zero bundle bloat.
 *
 * Errors (malformed YAML, unknown heading shape, etc.) bubble up as Vite
 * build errors at the offending file, not silent runtime glitches in prod.
 *
 * The headline slugifier mirrors `scripts/generate-seo-pages.mjs` exactly
 * so SSG anchors and hydrated anchors match byte-for-byte — otherwise
 * linking into a `#section` from Google would land on the wrong element.
 */
import type { Plugin } from 'vite'
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

const ARTICLE_PATH_RE = /\/src\/content\/blog\/posts\/[^/]+\/(?:en|es|fr|de|nl|pt)\.md$/

function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }
  const [, header, body] = match
  const data: Record<string, string> = {}
  for (const line of header.split(/\r?\n/)) {
    const lineMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/)
    if (!lineMatch) continue
    const [, key, rawValue] = lineMatch
    const v = rawValue.trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      data[key] = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
    } else {
      data[key] = v
    }
  }
  return { data, content: body }
}

interface Heading {
  id: string
  level: 2 | 3
  text: string
}

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

/**
 * The plugin emits three variants so `src/lib/blog.ts` can eager-bundle the
 * tiny metadata for listings and lazy-load the heavier body per article:
 *
 *   import foo from './foo.md'          → full object (meta + body)
 *   import meta from './foo.md?meta'    → metadata only (frontmatter + wordCount)
 *   import body from './foo.md?body'    → body only ({ html, headings, body })
 *
 * With `?body` used in a non-eager `import.meta.glob`, Vite code-splits each
 * article's HTML into its own chunk. The main bundle only ships metadata —
 * bundle size stays roughly flat as the corpus grows.
 *
 * The full (no-query) form is retained for backwards compatibility and for
 * any future caller that wants both in one import.
 */
export function blogArticlesPlugin(): Plugin {
  return {
    name: 'casatab-blog-articles',
    enforce: 'pre',
    transform(code, id) {
      const [idNoQuery, query = ''] = id.split('?')
      if (!ARTICLE_PATH_RE.test(idNoQuery)) return null

      const wantsMeta = query.includes('meta')
      const wantsBody = query.includes('body')

      const { data: frontmatter, content } = parseFrontmatter(code)
      const body = content.trim()
      const wordCount = body.split(/\s+/).filter(Boolean).length

      // Only render HTML when we actually need it. Metadata-only glob
      // avoids running marked/DOMPurify for listings.
      let html = ''
      let headings: Heading[] = []
      if (!wantsMeta || wantsBody) {
        const htmlRaw = marked.parse(body, { async: false, gfm: true }) as string
        const sanitized = DOMPurify.sanitize(htmlRaw, { USE_PROFILES: { html: true } })
        const processed = addHeadingIds(sanitized)
        html = processed.html
        headings = processed.headings
      }

      let payload: unknown
      if (wantsMeta && !wantsBody) {
        payload = { ...frontmatter, wordCount }
      } else if (wantsBody && !wantsMeta) {
        payload = { html, headings, body }
      } else {
        payload = { ...frontmatter, body, html, headings, wordCount }
      }

      return {
        code: `export default ${JSON.stringify(payload)}`,
        map: null,
      }
    },
  }
}
