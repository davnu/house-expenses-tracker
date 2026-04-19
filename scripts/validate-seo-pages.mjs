#!/usr/bin/env node
/**
 * validate-seo-pages.mjs
 *
 * Post-build validation: checks that the SEO page generation produced
 * correct output. Run after `npm run build` to catch regressions.
 *
 * Exits with code 1 on any failure.
 */

import { readFileSync, existsSync } from 'node:fs'
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

/* ═══════════════════ Validate each language page ═══════════════════ */

for (const lang of LANGUAGES) {
  const path = lang === 'en' ? 'index.html' : `${lang}/index.html`
  const html = readDist(path)

  console.log(`Checking /${path}...`)

  assert(html !== null, `File exists: dist/${path}`)
  if (!html) continue

  // <html lang>
  assert(html.includes(`<html lang="${lang}"`), `<html lang="${lang}"> present`)

  // <title> exists and is not empty
  const titleMatch = html.match(/<title>(.+?)<\/title>/)
  assert(titleMatch && titleMatch[1].startsWith('CasaTab'), `<title> starts with CasaTab`)

  // Meta description exists
  assert(html.includes('<meta name="description"'), `<meta description> present`)

  // Canonical URL
  const expectedUrl = lang === 'en' ? `${DOMAIN}/` : `${DOMAIN}/${lang}/`
  assert(html.includes(`<link rel="canonical" href="${expectedUrl}"`), `Canonical URL correct: ${expectedUrl}`)

  // OG tags
  assert(html.includes(`<meta property="og:url" content="${expectedUrl}"`), `og:url matches canonical`)
  assert(html.includes('<meta property="og:title"'), `og:title present`)
  assert(html.includes('<meta property="og:description"'), `og:description present`)
  assert(html.includes(`<meta property="og:locale" content="${lang}_`), `og:locale set for ${lang}`)

  // Twitter tags
  assert(html.includes('<meta name="twitter:title"'), `twitter:title present`)
  assert(html.includes('<meta name="twitter:description"'), `twitter:description present`)

  // hreflang tags — should have one for each language + x-default
  const hreflangCount = (html.match(/<link rel="alternate" hreflang="/g) || []).length
  assert(hreflangCount === 7, `Has 7 hreflang tags (got ${hreflangCount})`)
  assert(html.includes('hreflang="x-default"'), `Has x-default hreflang`)
  for (const l of LANGUAGES) {
    assert(html.includes(`hreflang="${l}"`), `Has hreflang="${l}"`)
  }

  // JSON-LD: should have SoftwareApplication, FAQPage, WebPage
  const jsonLdCount = (html.match(/<script type="application\/ld\+json">/g) || []).length
  assert(jsonLdCount === 3, `Has 3 JSON-LD blocks (got ${jsonLdCount})`)

  // Validate JSON-LD is parseable
  const jsonLdBlocks = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g) || []
  for (const block of jsonLdBlocks) {
    const jsonStr = block.replace(/<script type="application\/ld\+json">\s*/, '').replace(/\s*<\/script>/, '')
    try {
      const parsed = JSON.parse(jsonStr)
      assert(parsed['@context'] === 'https://schema.org', `JSON-LD has @context`)
      assert(parsed['@type'], `JSON-LD has @type: ${parsed['@type']}`)
    } catch {
      assert(false, `JSON-LD is valid JSON: ${jsonStr.substring(0, 80)}...`)
    }
  }

  // Pre-rendered content: should have an <h1>
  const h1Count = (html.match(/<h1[\s>]/g) || []).length
  assert(h1Count === 1, `Has exactly 1 <h1> (got ${h1Count})`)

  // Pre-rendered content: should have multiple <h2> (sections)
  const h2Count = (html.match(/<h2[\s>]/g) || []).length
  assert(h2Count >= 6, `Has 6+ <h2> section headings (got ${h2Count})`)

  // Pre-rendered content: FAQ should be present (<dt> / <dd>)
  const dtCount = (html.match(/<dt[\s>]/g) || []).length
  assert(dtCount >= 6, `Has 6+ FAQ <dt> items (got ${dtCount})`)

  // English page: should have language detection redirect script with pathname guard
  if (lang === 'en') {
    assert(html.includes("if(window.location.pathname!=='/')return"), `English page has pathname guard in redirect script`)
    assert(html.includes('window.location.replace'), `English page has language detection redirect script`)
  }

  // Non-English pages: should set localStorage
  if (lang !== 'en') {
    assert(html.includes(`localStorage.setItem('i18nextLng','${lang}')`), `Sets localStorage to '${lang}'`)
  }

  // No duplicate <title> or <meta description>
  const titleCount = (html.match(/<title>/g) || []).length
  assert(titleCount === 1, `Has exactly 1 <title> (got ${titleCount})`)
  const descCount = (html.match(/<meta name="description"/g) || []).length
  assert(descCount === 1, `Has exactly 1 meta description (got ${descCount})`)

  // Favicon chain — missing favicon.ico was why Google wasn't showing the
  // icon in search results. Lock every link in so a future index.html edit
  // can't silently drop one.
  assert(
    /<link rel="icon" href="\/favicon\.ico" sizes="any"/.test(html),
    `Has <link rel="icon" href="/favicon.ico" sizes="any"> — sizes="any" honestly describes the multi-res ICO so crawlers pick the biggest entry`,
  )
  assert(
    /<link rel="icon" type="image\/png" sizes="48x48" href="\/favicon-48\.png"/.test(html),
    `Has 48×48 PNG favicon (Google's preferred size)`,
  )
  assert(
    /<link rel="icon" type="image\/png" sizes="192x192" href="\/icon-192\.png"/.test(html),
    `Has 192×192 PNG favicon for hi-dpi`,
  )
  assert(
    /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/.test(html),
    `Has SVG favicon for modern browsers`,
  )
  assert(
    /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/.test(html),
    `Has apple-touch-icon for iOS home-screen`,
  )
}

/* ═══════════════════ Validate favicon assets ═══════════════════ */

console.log('Checking favicon assets...')
// These must ship in /dist or Google's crawler hits 404 on /favicon.ico and
// silently refuses to show the icon in search results. Vite copies
// public/** → dist/** automatically, so the assertion is simple — but the
// check still matters: if generate-favicon.mjs was never run, dist has no
// .ico, Google has no favicon.
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

// Staleness check: if icon-512.png is edited but generate-favicon.mjs is not
// re-run, the derived files (ico, 48px, maskable) drift. A pinned SHA-256
// snapshot of the source catches this at CI time instead of in production.
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

// Hard-coded fill colours make the SVG invisible in dark browser tabs.
// The canonical fix is currentColor + prefers-color-scheme; verify both
// primitives are still in place so a future SVG edit can't accidentally
// regress to a hard-coded fill.
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
    // Android adaptive-icon compatibility: needs at least one maskable icon,
    // otherwise launchers letterbox the icon on a white background when the
    // PWA is installed.
    const maskable = manifest.icons?.some((i) => String(i.purpose ?? '').split(/\s+/).includes('maskable'))
    assert(maskable === true, 'manifest.icons has at least one purpose:"maskable" entry (Android adaptive-icon compatibility)')
    const anyPurpose = manifest.icons?.some((i) => String(i.purpose ?? 'any').split(/\s+/).includes('any'))
    assert(anyPurpose === true, 'manifest.icons has at least one purpose:"any" entry (default launcher icon)')
  } catch (e) {
    assert(false, `manifest.json is valid JSON (${e.message})`)
  }
}

/* ═══════════════════ Validate sitemap ═══════════════════ */

console.log('Checking /sitemap.xml...')
const sitemap = readDist('sitemap.xml')
assert(sitemap !== null, 'sitemap.xml exists')

if (sitemap) {
  // All language URLs present
  for (const lang of LANGUAGES) {
    const url = lang === 'en' ? `${DOMAIN}/` : `${DOMAIN}/${lang}/`
    assert(sitemap.includes(`<loc>${url}</loc>`), `Sitemap has ${url}`)
  }

  // hreflang in sitemap
  assert(sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'), 'Sitemap has xhtml namespace')
  const sitemapHreflangCount = (sitemap.match(/xhtml:link rel="alternate"/g) || []).length
  // 6 language URLs × 7 hreflang links each = 42
  assert(sitemapHreflangCount === 42, `Sitemap has 42 hreflang links (got ${sitemapHreflangCount})`)

  // Static pages present
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
