#!/usr/bin/env node
/**
 * validate-seo-pages.mjs
 *
 * Post-build validation: checks that the SEO page generation produced
 * correct output. Run after `npm run build` to catch regressions.
 *
 * Exits with code 1 on any failure.
 *
 * Three page types are validated, each with distinct expectations:
 *  - LANDING:      dist/index.html + dist/{lang}/index.html (6 files)
 *  - BLOG INDEX:   dist/blog/index.html + dist/{lang}/blog/index.html (6 files)
 *  - BLOG ARTICLE: dist/blog/{slug}/index.html + dist/{lang}/blog/{slug}/index.html (per article × lang)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const PUBLIC_DIR = join(__dirname, '..', 'public')

const LANGUAGES = ['en', 'es', 'fr', 'de', 'nl', 'pt']
const DOMAIN = 'https://casatab.com'

let failures = 0
let checks = 0

function assert(condition, message) {
  checks++
  if (!condition) {
    failures++
    console.error(`  ✗ ${message}`)
  }
}

function readDist(path) {
  const full = join(DIST, path)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf-8')
}

/* ═══════════════════ Shared head-element validators ═══════════════════ */

function validateHeadBasics(html, { lang, expectedUrl, context }) {
  assert(html.includes(`<html lang="${lang}"`), `[${context}] <html lang="${lang}"> present`)
  const titleMatch = html.match(/<title>(.+?)<\/title>/)
  assert(titleMatch && titleMatch[1].length > 0, `[${context}] <title> present and non-empty`)
  assert(html.includes('<meta name="description"'), `[${context}] <meta description> present`)
  assert(
    html.includes(`<link rel="canonical" href="${expectedUrl}"`),
    `[${context}] canonical URL correct: ${expectedUrl}`,
  )
  assert(
    html.includes(`<meta property="og:url" content="${expectedUrl}"`),
    `[${context}] og:url matches canonical`,
  )
  assert(html.includes('<meta property="og:title"'), `[${context}] og:title present`)
  assert(html.includes('<meta property="og:description"'), `[${context}] og:description present`)
  assert(html.includes(`<meta property="og:locale" content="${lang}_`), `[${context}] og:locale set`)
  assert(html.includes('<meta name="twitter:title"'), `[${context}] twitter:title present`)

  const titleCount = (html.match(/<title>/g) || []).length
  assert(titleCount === 1, `[${context}] exactly 1 <title> (got ${titleCount})`)
  const descCount = (html.match(/<meta name="description"/g) || []).length
  assert(descCount === 1, `[${context}] exactly 1 meta description (got ${descCount})`)
}

function validateHreflangCount(html, expected, context) {
  const hreflangCount = (html.match(/<link rel="alternate" hreflang="/g) || []).length
  assert(hreflangCount === expected, `[${context}] ${expected} hreflang tags (got ${hreflangCount})`)
  assert(html.includes('hreflang="x-default"'), `[${context}] has x-default hreflang`)
}

function validateJsonLdBlocks(html, expectedCount, expectedTypes, context) {
  const blocks = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g) || []
  // Expected-count accepts an exact number OR an array of allowed counts.
  // Blog articles emit 2 blocks normally (Article + BreadcrumbList) and 3
  // when FAQPage schema is added — validator must accept both.
  const validCounts = Array.isArray(expectedCount) ? expectedCount : [expectedCount]
  assert(
    validCounts.includes(blocks.length),
    `[${context}] ${validCounts.join(' or ')} JSON-LD blocks (got ${blocks.length})`,
  )
  const foundTypes = []
  for (const block of blocks) {
    const jsonStr = block.replace(/<script type="application\/ld\+json">\s*/, '').replace(/\s*<\/script>/, '')
    try {
      const parsed = JSON.parse(jsonStr)
      assert(parsed['@context'] === 'https://schema.org', `[${context}] JSON-LD @context`)
      assert(parsed['@type'], `[${context}] JSON-LD @type: ${parsed['@type']}`)
      foundTypes.push(parsed['@type'])
    } catch (e) {
      assert(false, `[${context}] JSON-LD parses: ${jsonStr.substring(0, 80)}... (${e.message})`)
    }
  }
  for (const type of expectedTypes) {
    assert(foundTypes.includes(type), `[${context}] JSON-LD includes @type=${type}`)
  }
  return foundTypes
}

function validateFavicons(html, context) {
  assert(
    /<link rel="icon" href="\/favicon\.ico" sizes="any"/.test(html),
    `[${context}] <link rel="icon" href="/favicon.ico" sizes="any">`,
  )
  assert(
    /<link rel="icon" type="image\/png" sizes="48x48" href="\/favicon-48\.png"/.test(html),
    `[${context}] 48×48 PNG favicon`,
  )
  assert(
    /<link rel="icon" type="image\/png" sizes="192x192" href="\/icon-192\.png"/.test(html),
    `[${context}] 192×192 PNG favicon`,
  )
  assert(
    /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/.test(html),
    `[${context}] SVG favicon`,
  )
  assert(
    /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/.test(html),
    `[${context}] apple-touch-icon`,
  )
}

/* ═══════════════════ Landing page validator ═══════════════════ */

function validateLandingPage(html, lang) {
  const context = `landing:${lang}`
  const expectedUrl = lang === 'en' ? `${DOMAIN}/` : `${DOMAIN}/${lang}/`

  validateHeadBasics(html, { lang, expectedUrl, context })

  // 7 hreflang (6 languages + x-default)
  validateHreflangCount(html, 7, context)
  for (const l of LANGUAGES) {
    assert(html.includes(`hreflang="${l}"`), `[${context}] hreflang="${l}"`)
  }

  // Landing JSON-LD: SoftwareApplication + FAQPage + BreadcrumbList + WebPage
  validateJsonLdBlocks(
    html,
    4,
    ['SoftwareApplication', 'FAQPage', 'BreadcrumbList', 'WebPage'],
    context,
  )

  const h1Count = (html.match(/<h1[\s>]/g) || []).length
  assert(h1Count === 1, `[${context}] exactly 1 <h1> (got ${h1Count})`)
  const h2Count = (html.match(/<h2[\s>]/g) || []).length
  assert(h2Count >= 6, `[${context}] 6+ <h2> (got ${h2Count})`)
  const dtCount = (html.match(/<dt[\s>]/g) || []).length
  assert(dtCount >= 6, `[${context}] 6+ FAQ <dt> (got ${dtCount})`)

  if (lang === 'en') {
    assert(
      html.includes("if(window.location.pathname!=='/')return"),
      `[${context}] pathname guard in redirect script`,
    )
    assert(html.includes('window.location.replace'), `[${context}] redirect script present`)
  }
  if (lang !== 'en') {
    assert(
      html.includes(`localStorage.setItem('i18nextLng','${lang}')`),
      `[${context}] localStorage language setter`,
    )
  }

  validateFavicons(html, context)
}

/* ═══════════════════ Blog index validator ═══════════════════ */

function validateBlogIndexPage(html, lang) {
  const context = `blog-index:${lang}`
  const expectedUrl = lang === 'en' ? `${DOMAIN}/blog/` : `${DOMAIN}/${lang}/blog/`

  validateHeadBasics(html, { lang, expectedUrl, context })

  // 7 hreflang (6 languages + x-default) — all blog index pages exist in all languages
  validateHreflangCount(html, 7, context)
  for (const l of LANGUAGES) {
    assert(html.includes(`hreflang="${l}"`), `[${context}] hreflang="${l}"`)
  }

  // Blog index JSON-LD: WebPage + CollectionPage
  validateJsonLdBlocks(html, 2, ['WebPage', 'CollectionPage'], context)

  const h1Count = (html.match(/<h1[\s>]/g) || []).length
  assert(h1Count === 1, `[${context}] exactly 1 <h1> (got ${h1Count})`)

  // Blog pages must NOT contain the English→locale auto-redirect script.
  // A Spanish browser landing on /blog/ should stay on /blog/, not jump to /es/.
  assert(
    !html.includes('window.location.replace'),
    `[${context}] no language-redirect script (should not redirect)`,
  )

  if (lang !== 'en') {
    assert(
      html.includes(`localStorage.setItem('i18nextLng','${lang}')`),
      `[${context}] localStorage language setter`,
    )
  }

  validateFavicons(html, context)
}

/* ═══════════════════ Blog article validator ═══════════════════ */

function validateBlogArticlePage(html, lang, slug) {
  const context = `blog-article:${lang}/${slug}`
  const expectedUrl = lang === 'en' ? `${DOMAIN}/blog/${slug}/` : `${DOMAIN}/${lang}/blog/${slug}/`

  validateHeadBasics(html, { lang, expectedUrl, context })

  // Article JSON-LD: Article + BreadcrumbList
  // 2 blocks = Article + BreadcrumbList (article has no Q&A structure).
  // 3 blocks = above + FAQPage (article has ≥2 question-shaped H2/H3).
  const types = validateJsonLdBlocks(html, [2, 3], ['Article', 'BreadcrumbList'], context)
  void types

  // Article JSON-LD must have a valid author (Organization fallback OR Person
  // when frontmatter names one — both are legitimate E-E-A-T signals).
  const articleBlock = html.match(/<script type="application\/ld\+json">\s*(\{[^<]*?"@type"\s*:\s*"Article"[\s\S]*?\})\s*<\/script>/)
  if (articleBlock) {
    try {
      const parsed = JSON.parse(articleBlock[1])
      const authorType = parsed.author?.['@type']
      const authorName = parsed.author?.name
      assert(
        (authorType === 'Organization' || authorType === 'Person') && typeof authorName === 'string' && authorName.length > 0,
        `[${context}] Article.author present as Organization or Person with a non-empty name (got type=${authorType}, name=${authorName})`,
      )
      assert(parsed.datePublished, `[${context}] Article.datePublished present`)
      assert(parsed.dateModified, `[${context}] Article.dateModified present`)
      assert(parsed.inLanguage === lang, `[${context}] Article.inLanguage=${lang}`)
      assert(typeof parsed.image === 'string' && parsed.image.length > 0, `[${context}] Article.image present`)

      // If the image is a WebP hero (our realistic-photo convention), the
      // two size variants must exist in dist/blog/ — otherwise srcset 404s
      // for mobile + tablet viewports.
      if (parsed.image?.endsWith('.webp')) {
        const heroFile = parsed.image.replace(DOMAIN, '')
        const base = heroFile.replace(/\.webp$/, '')
        for (const w of [800, 1200]) {
          const variantPath = `${base}-${w}.webp`.replace(/^\//, '')
          assert(
            readDist(variantPath) !== null,
            `[${context}] hero variant exists: dist/${variantPath}`,
          )
        }
      }
    } catch (e) {
      assert(false, `[${context}] Article JSON-LD parses (${e.message})`)
    }
  }

  // Hero <img> — if present, must have a non-empty alt (either from
  // heroImageAlt frontmatter or an explicit descriptive caption). An empty
  // alt on a content-bearing hero is an a11y + image-SEO miss.
  const heroImgTag = html.match(/<figure[^>]*>[\s\S]*?<img\s[^>]*src="\/blog\/[^"]+"[^>]*>[\s\S]*?<\/figure>/)
  if (heroImgTag) {
    const altMatch = heroImgTag[0].match(/\salt="([^"]*)"/)
    assert(
      altMatch && altMatch[1].trim().length > 0,
      `[${context}] hero <img> has non-empty alt text`,
    )
  }

  // FAQPage JSON-LD — articles with ≥2 question-shaped H2/H3 headings in the
  // article BODY (not related-article cards or other chrome) must emit
  // FAQPage schema so AI assistants lift the Q&A verbatim.
  //
  // Scope narrowing is critical: related-article card titles often end with
  // "?" (because other articles have Q-shaped titles) but they're chrome,
  // not content. The SEO script's extractor only scans `article.html` — the
  // pre-rendered body — so the validator must match that scope.
  //
  // Heuristic: exclude any heading that contains an <a href="..."> (which
  // signals it's a card/related-link, not a body heading) or whose tag sits
  // inside an article-listing card (we don't parse HTML, so the link-tag
  // heuristic catches this reliably in practice).
  const questionHeadings = (html.match(/<h[23][^>]*>[\s\S]*?<\/h[23]>/g) || []).filter((h) => {
    if (/<a\s+[^>]*href=/i.test(h)) return false // link-wrapped → card title, skip
    const text = h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    return /[?？]$/.test(text)
  })

  if (questionHeadings.length >= 2) {
    const faqBlock = html.match(/<script type="application\/ld\+json">\s*(\{[^<]*?"@type"\s*:\s*"FAQPage"[\s\S]*?\})\s*<\/script>/)
    assert(faqBlock, `[${context}] FAQPage JSON-LD present (article has ${questionHeadings.length} question-headings)`)
    if (faqBlock) {
      try {
        const parsed = JSON.parse(faqBlock[1])
        assert(
          Array.isArray(parsed.mainEntity) && parsed.mainEntity.length >= 2,
          `[${context}] FAQPage.mainEntity has ≥2 Question items`,
        )
        for (const item of parsed.mainEntity || []) {
          assert(
            typeof item.name === 'string' && item.name.trim().length > 0,
            `[${context}] FAQPage Question.name non-empty`,
          )
          assert(
            typeof item.acceptedAnswer?.text === 'string' && item.acceptedAnswer.text.trim().length > 0,
            `[${context}] FAQPage Question.acceptedAnswer.text non-empty`,
          )
        }
      } catch (e) {
        assert(false, `[${context}] FAQPage JSON-LD parses (${e.message})`)
      }
    }
  }

  const h1Count = (html.match(/<h1[\s>]/g) || []).length
  assert(h1Count === 1, `[${context}] exactly 1 <h1> (got ${h1Count})`)

  assert(/<article[\s>]/.test(html), `[${context}] contains <article> element`)

  assert(
    !html.includes('window.location.replace'),
    `[${context}] no language-redirect script`,
  )

  if (lang !== 'en') {
    assert(
      html.includes(`localStorage.setItem('i18nextLng','${lang}')`),
      `[${context}] localStorage language setter`,
    )
  }

  validateFavicons(html, context)
}

/* ═══════════════════ Validate landing pages ═══════════════════ */

for (const lang of LANGUAGES) {
  const path = lang === 'en' ? 'index.html' : `${lang}/index.html`
  const html = readDist(path)
  console.log(`Checking /${path}...`)
  assert(html !== null, `File exists: dist/${path}`)
  if (html) validateLandingPage(html, lang)
}

/* ═══════════════════ Validate blog index pages ═══════════════════ */

for (const lang of LANGUAGES) {
  const path = lang === 'en' ? 'blog/index.html' : `${lang}/blog/index.html`
  const html = readDist(path)
  console.log(`Checking /${path}...`)
  assert(html !== null, `File exists: dist/${path}`)
  if (html) validateBlogIndexPage(html, lang)
}

/* ═══════════════════ Validate blog article pages ═══════════════════ */

// Walk the dist/blog and dist/{lang}/blog directories to find every article.
function listArticleSlugs(baseDir) {
  if (!existsSync(baseDir)) return []
  const slugs = []
  for (const entry of readdirSync(baseDir)) {
    const full = join(baseDir, entry)
    if (!statSync(full).isDirectory()) continue
    if (!existsSync(join(full, 'index.html'))) continue
    slugs.push(entry)
  }
  return slugs
}

let articleValidationsRun = 0
for (const lang of LANGUAGES) {
  const baseDir = lang === 'en' ? join(DIST, 'blog') : join(DIST, lang, 'blog')
  const slugs = listArticleSlugs(baseDir)
  for (const slug of slugs) {
    const path = lang === 'en' ? `blog/${slug}/index.html` : `${lang}/blog/${slug}/index.html`
    const html = readDist(path)
    console.log(`Checking /${path}...`)
    if (html) {
      validateBlogArticlePage(html, lang, slug)
      articleValidationsRun++
    }
  }
}

assert(articleValidationsRun > 0, 'At least one blog article was validated')

/* ═══════════════════ Validate favicon assets ═══════════════════ */

console.log('Checking favicon assets...')
const FAVICON_FILES = [
  { path: 'favicon.ico', minBytes: 500 },
  { path: 'favicon-48.png', minBytes: 100 },
  { path: 'favicon.svg', minBytes: 100 },
  { path: 'icon-192.png', minBytes: 500 },
  { path: 'icon-maskable-512.png', minBytes: 500 },
  { path: 'apple-touch-icon.png', minBytes: 500 },
]
for (const { path, minBytes } of FAVICON_FILES) {
  const buf = readDist(path)
  assert(buf !== null, `dist/${path} exists`)
  if (buf !== null) {
    assert(
      buf.length >= minBytes,
      `dist/${path} is non-empty (got ${buf.length} bytes, expected ≥${minBytes})`,
    )
  }
}

const sourcePath = join(PUBLIC_DIR, 'icon-512.png')
const hashPath = join(PUBLIC_DIR, '.favicon-source-hash')
if (!existsSync(hashPath)) {
  assert(false, `public/.favicon-source-hash missing — run \`node scripts/generate-favicon.mjs\``)
} else if (existsSync(sourcePath)) {
  const currentHash = createHash('sha256').update(readFileSync(sourcePath)).digest('hex')
  const pinnedHash = readFileSync(hashPath, 'utf-8').trim()
  assert(
    currentHash === pinnedHash,
    `public/icon-512.png changed but derived favicons are stale. ` +
      `Re-run \`node scripts/generate-favicon.mjs\` and commit the updated assets. ` +
      `(pinned ${pinnedHash.slice(0, 12)}… vs source ${currentHash.slice(0, 12)}…)`,
  )
}

/* ═══════════════════ Validate favicon.svg dark-mode ═══════════════════ */

const faviconSvg = readDist('favicon.svg')
if (faviconSvg) {
  assert(
    /currentColor/.test(faviconSvg),
    `favicon.svg uses currentColor (dark-mode compatibility)`,
  )
  assert(
    /prefers-color-scheme\s*:\s*dark/.test(faviconSvg),
    `favicon.svg has @media (prefers-color-scheme: dark) rule`,
  )
}

/* ═══════════════════ Validate manifest.json ═══════════════════ */

console.log('Checking /manifest.json...')
const manifestRaw = readDist('manifest.json')
assert(manifestRaw !== null, 'manifest.json exists in dist')
if (manifestRaw) {
  try {
    const manifest = JSON.parse(manifestRaw)
    assert(Array.isArray(manifest.icons), 'manifest.icons is an array')
    const maskable = manifest.icons?.some((i) => String(i.purpose ?? '').split(/\s+/).includes('maskable'))
    assert(maskable === true, 'manifest.icons has at least one purpose:"maskable" entry')
    const anyPurpose = manifest.icons?.some((i) => String(i.purpose ?? 'any').split(/\s+/).includes('any'))
    assert(anyPurpose === true, 'manifest.icons has at least one purpose:"any" entry')
  } catch (e) {
    assert(false, `manifest.json is valid JSON (${e.message})`)
  }
}

/* ═══════════════════ Validate sitemap ═══════════════════ */

console.log('Checking /sitemap.xml...')
const sitemap = readDist('sitemap.xml')
assert(sitemap !== null, 'sitemap.xml exists')

if (sitemap) {
  for (const lang of LANGUAGES) {
    const url = lang === 'en' ? `${DOMAIN}/` : `${DOMAIN}/${lang}/`
    assert(sitemap.includes(`<loc>${url}</loc>`), `Sitemap has landing ${url}`)
    const blogUrl = lang === 'en' ? `${DOMAIN}/blog/` : `${DOMAIN}/${lang}/blog/`
    assert(sitemap.includes(`<loc>${blogUrl}</loc>`), `Sitemap has blog index ${blogUrl}`)
  }

  assert(sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'), 'Sitemap has xhtml namespace')

  // Dynamic expected count:
  //   - 6 landing × 7 hreflang = 42
  //   - 6 blog index × 7 hreflang = 42
  //   - per article: (translated-count) × per-article-url, where each URL gets
  //     one hreflang per translated variant + 1 x-default (if en exists).
  //   For the flagship article (6 translations), that's 6 URLs × 7 hreflang = 42.
  //   Total baseline with 1 flagship article: 42 + 42 + 42 = 126.
  const landingHreflang = 6 * 7
  const blogIndexHreflang = 6 * 7
  // Detect articles dynamically: how many unique <loc>…/blog/{slug}/</loc> entries exist
  const articleLocs = sitemap.match(/<loc>[^<]+\/blog\/[^/]+\/<\/loc>/g) || []
  // Articles with 6-language coverage: 6 URLs × 7 links
  // We don't know per-article coverage at runtime without parsing — just verify
  // the total is a multiple of 7 and at least baseline.
  const sitemapHreflangCount = (sitemap.match(/xhtml:link rel="alternate"/g) || []).length
  const minExpected = landingHreflang + blogIndexHreflang + 7 // at least one article URL with hreflang
  assert(
    sitemapHreflangCount >= minExpected,
    `Sitemap hreflang count ≥ ${minExpected} (got ${sitemapHreflangCount}, article URLs=${articleLocs.length})`,
  )
  assert(
    sitemapHreflangCount % 7 === 0,
    `Sitemap hreflang count is a multiple of 7 (got ${sitemapHreflangCount})`,
  )

  assert(sitemap.includes(`${DOMAIN}/login`), 'Sitemap has /login')
  assert(sitemap.includes(`${DOMAIN}/privacy`), 'Sitemap has /privacy')
}

/* ═══════════════════ Summary ═══════════════════ */

console.log('')
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed`)
  process.exit(1)
} else {
  console.log(`PASSED: all ${checks} checks passed`)
}
