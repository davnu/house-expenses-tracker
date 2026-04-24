#!/usr/bin/env node
/**
 * generate-seo-pages.mjs
 *
 * Post-build script that generates pre-rendered, SEO-optimized HTML pages
 * for each supported language. Run after `vite build`.
 *
 * What it produces (inside dist/):
 *   index.html            — English: hreflang tags + canonical + pre-rendered content
 *   es/index.html         — Spanish
 *   fr/index.html         — French
 *   de/index.html         — German
 *   nl/index.html         — Dutch
 *   pt/index.html         — Portuguese
 *   sitemap.xml           — Multilingual sitemap with hreflang annotations
 *
 * Why pre-rendered HTML matters:
 *   Google can index the full page content without executing JavaScript.
 *   Each language gets its own URL, meta tags, structured data, and hreflang
 *   — so users searching in Spanish find the Spanish page directly.
 *   React hydrates on top when JS loads; the pre-rendered HTML is replaced.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist')

const DOMAIN = 'https://casatab.com'
const LANGUAGES = ['en', 'es', 'fr', 'de', 'nl', 'pt']
const DEFAULT_LANG = 'en'
const CURRENT_YEAR = new Date().getFullYear()

/* ═══════════════════ Helpers ═══════════════════ */

function readLocale(lang) {
  return JSON.parse(readFileSync(join(ROOT, 'src', 'locales', `${lang}.json`), 'utf-8'))
}

/** Escape text for use inside HTML attribute values */
function attr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escape text for use inside HTML body content */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escape text for use inside JSON strings within <script> tags */
function jsonEsc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function langUrl(lang) {
  return lang === DEFAULT_LANG ? `${DOMAIN}/` : `${DOMAIN}/${lang}/`
}

/**
 * Returns ` srcset="..."` (with leading space) for hero images when size
 * variants are expected to exist. `scripts/generate-hero-variants.mjs` emits
 * `{name}-{width}.webp` siblings for every `/blog/*.webp` hero at build time.
 * Returns an empty string for non-webp heroes (e.g. the legacy SVG).
 */
function buildSrcSetAttr(src) {
  if (!src || !src.endsWith('.webp')) return ''
  const base = src.replace(/\.webp$/, '')
  return ` srcset="${base}-800.webp 800w, ${base}-1200.webp 1200w, ${src} 1600w"`
}

/* ═══════════════════ SEO-specific meta descriptions ═══════════════════ */

/**
 * Meta descriptions are hand-crafted per language for optimal search snippets.
 * They list specific cost types (high-value keywords) rather than using generic text.
 * ~150-155 chars each — stays under Google's ~160-char snippet limit.
 */
const META_DESCRIPTIONS = {
  en: 'Track down payments, notary fees, taxes, renovations, and furniture when buying your home. Store documents, track your mortgage, and see who paid what — all in one place.',
  es: 'Controla la entrada, notario, impuestos, reformas y muebles al comprar tu casa. Guarda documentos, sigue tu hipoteca y mira quién pagó qué — todo en un solo lugar.',
  fr: "Suivez l'apport, les frais de notaire, taxes, travaux et meubles lors de l'achat de votre maison. Stockez documents, suivez votre prêt et voyez qui a payé quoi.",
  de: 'Erfassen Sie Anzahlung, Notar, Steuern, Renovierung und Möbel beim Hauskauf. Dokumente speichern, Hypothek verfolgen und sehen, wer was bezahlt hat — alles an einem Ort.',
  nl: 'Houd aanbetaling, notaris, belastingen, verbouwing en meubels bij wanneer je een huis koopt. Bewaar documenten, volg je hypotheek en zie wie wat betaalde — op één plek.',
  pt: 'Registe entrada, notário, impostos, obras e móveis na compra da sua casa. Guarde documentos, acompanhe o crédito e veja quem pagou o quê — tudo num só lugar.',
}

/**
 * SEO-optimized page titles per language.
 * Format: "CasaTab — {action-oriented phrase with key terms}"
 * ~50-60 chars to fit Google's title display.
 */
const PAGE_TITLES = {
  en: 'CasaTab — Track Every Cost of Buying Your Home',
  es: 'CasaTab — Controla cada gasto de la compra de tu casa',
  fr: "CasaTab — Suivez chaque frais d'achat de votre maison",
  de: 'CasaTab — Alle Kosten beim Hauskauf im Blick',
  nl: 'CasaTab — Elke kost van je woningaankoop bijhouden',
  pt: 'CasaTab — Acompanhe cada custo da compra da sua casa',
}

/**
 * SEO keywords per language — terms people actually search for.
 */
const META_KEYWORDS = {
  en: 'home purchase cost tracker, home buying costs, house purchase budget, closing costs calculator, mortgage tracker, home buying expense tracker, down payment tracker, home buying budget',
  es: 'gastos compra casa, calculadora gastos compra vivienda, costes compra casa, seguimiento hipoteca, gastos notario compra casa, presupuesto compra vivienda',
  fr: "frais achat immobilier, coût achat maison, frais de notaire, calculateur prêt immobilier, budget achat maison, suivi dépenses achat immobilier",
  de: 'Hauskauf Kosten Rechner, Nebenkosten Hauskauf, Kaufnebenkosten Rechner, Hypothekenrechner, Hauskauf Budget, Grunderwerbsteuer Rechner',
  nl: 'kosten huis kopen, aankoopkosten woning, bijkomende kosten huis kopen, hypotheek calculator, kosten koper berekenen, notariskosten huis kopen',
  pt: 'custos compra casa, despesas compra casa, simulador crédito habitação, gastos notário compra casa, orçamento compra casa, IMT simulador',
}

/* ═══════════════════ hreflang tags ═══════════════════ */

function hreflangTags() {
  const tags = LANGUAGES.map(
    (lang) => `    <link rel="alternate" hreflang="${lang}" href="${langUrl(lang)}" />`
  )
  tags.push(`    <link rel="alternate" hreflang="x-default" href="${DOMAIN}/" />`)
  return tags.join('\n')
}

/* ═══════════════════ JSON-LD structured data ═══════════════════ */

function generateJsonLd(t, lang) {
  const url = langUrl(lang)

  // SoftwareApplication
  const app = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'CasaTab',
    description: META_DESCRIPTIONS[lang],
    url: DOMAIN,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    inLanguage: lang,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      description: lang === 'en' ? 'Free plan available' : t.landing.faq.a1.split('.')[0],
    },
    featureList: [
      t.landing.features.dashboard.title,
      t.landing.features.categories.title,
      t.landing.features.mortgage.title,
      t.landing.features.household.title,
      t.landing.features.documents.title,
      t.landing.features.international.title,
    ],
    screenshot: `${DOMAIN}/og-image.png`,
  }

  // FAQPage
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: Array.from({ length: 6 }, (_, i) => ({
      '@type': 'Question',
      name: t.landing.faq[`q${i + 1}`],
      acceptedAnswer: {
        '@type': 'Answer',
        text: t.landing.faq[`a${i + 1}`],
      },
    })),
  }

  // WebPage (tells Google this is a specific language version)
  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: PAGE_TITLES[lang],
    description: META_DESCRIPTIONS[lang],
    url,
    inLanguage: lang,
    isPartOf: {
      '@type': 'WebSite',
      name: 'CasaTab',
      url: DOMAIN,
    },
  }

  return [
    `    <script type="application/ld+json">\n    ${JSON.stringify(app)}\n    </script>`,
    `    <script type="application/ld+json">\n    ${JSON.stringify(faq)}\n    </script>`,
    `    <script type="application/ld+json">\n    ${JSON.stringify(webPage)}\n    </script>`,
  ].join('\n')
}

/* ═══════════════════ Pre-rendered HTML content ═══════════════════ */

/**
 * Generates semantic HTML that mirrors the landing page content.
 * Google indexes this without needing JavaScript execution.
 * React replaces it when the app mounts.
 *
 * The HTML uses basic inline styles for a reasonable fallback appearance
 * in case JS fails to load (rare but possible on slow connections).
 */
function prerenderedContent(t, lang, landingArticles = []) {
  const loginHref = '/login?mode=signup'
  const langLinks = LANGUAGES
    .map((l) => `<a href="${langUrl(l)}">${l.toUpperCase()}</a>`)
    .join(' ')

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171717;max-width:72rem;margin:0 auto;padding:0 1.5rem">

    <!-- Header -->
    <header style="padding:1rem 0;display:flex;align-items:center;justify-content:space-between">
      <a href="${langUrl(lang)}" style="font-weight:700;font-size:1.1rem;text-decoration:none;color:#171717">CasaTab</a>
      <nav>
        <a href="#features" style="margin-right:1.5rem;color:#666;text-decoration:none">${esc(t.landing.nav.features)}</a>
        <a href="#how-it-works" style="margin-right:1.5rem;color:#666;text-decoration:none">${esc(t.landing.nav.howItWorks)}</a>
        <a href="#faq" style="margin-right:1.5rem;color:#666;text-decoration:none">${esc(t.landing.nav.faq)}</a>
        <a href="/login" style="margin-right:1rem;color:#666;text-decoration:none">${esc(t.landing.nav.logIn)}</a>
        <a href="${loginHref}" style="background:#863bff;color:#fff;padding:0.5rem 1rem;border-radius:0.5rem;text-decoration:none;font-weight:600">${esc(t.landing.nav.getStarted)}</a>
      </nav>
    </header>

    <main>

      <!-- Hero -->
      <section style="text-align:center;padding:4rem 0 2rem">
        <p style="font-size:0.75rem;font-weight:600;color:#863bff;text-transform:uppercase;letter-spacing:0.1em">${esc(t.landing.hero.badge)}</p>
        <h1 style="font-size:2.8rem;font-weight:800;line-height:1.1;margin:1rem auto;max-width:48rem">${esc(t.landing.hero.title)}</h1>
        <p style="font-size:1.1rem;color:#666;max-width:40rem;margin:1rem auto;line-height:1.6">${esc(t.landing.hero.subtitle)}</p>
        <div style="margin-top:2rem">
          <a href="${loginHref}" style="background:#863bff;color:#fff;padding:0.75rem 1.5rem;border-radius:0.75rem;text-decoration:none;font-weight:600;font-size:1rem">${esc(t.landing.hero.cta)}</a>
        </div>
        <p style="margin-top:1rem;font-size:0.8rem;color:#999">${esc(t.landing.hero.noCreditCard)}</p>
      </section>

      <!-- Stats -->
      <section style="border-top:1px solid #eee;border-bottom:1px solid #eee;padding:2rem 0;display:flex;justify-content:space-around;text-align:center">
        <div><strong style="font-size:1.8rem;color:#863bff">34+</strong><br><span style="font-size:0.85rem;color:#666">${esc(t.landing.stats.countries)}</span></div>
        <div><strong style="font-size:1.8rem;color:#863bff">6</strong><br><span style="font-size:0.85rem;color:#666">${esc(t.landing.stats.languages)}</span></div>
        <div><strong style="font-size:1.8rem;color:#863bff">100%</strong><br><span style="font-size:0.85rem;color:#666">${esc(t.landing.stats.free)}</span></div>
      </section>

      <!-- Problem -->
      <section style="padding:4rem 0">
        <h2 style="font-size:2rem;font-weight:800;text-align:center;max-width:40rem;margin:0 auto 2.5rem">${esc(t.landing.problem.title)}</h2>
        ${[1, 2, 3]
          .map(
            (n) => `
        <article style="border:1px solid #eee;border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem">
          <h3 style="font-weight:700;margin-bottom:0.5rem">${esc(t.landing.problem[`card${n}Title`])}</h3>
          <p style="color:#666;line-height:1.6;font-size:0.9rem">${esc(t.landing.problem[`card${n}Text`])}</p>
        </article>`
          )
          .join('')}
      </section>

      <!-- Features -->
      <section id="features" style="padding:4rem 0">
        <p style="text-align:center;font-size:0.75rem;font-weight:600;color:#863bff;text-transform:uppercase;letter-spacing:0.1em">${esc(t.landing.features.label)}</p>
        <h2 style="font-size:2rem;font-weight:800;text-align:center;margin:0.5rem auto 2.5rem">${esc(t.landing.features.title)}</h2>
        ${['dashboard', 'categories', 'mortgage', 'household', 'documents', 'international']
          .map(
            (key) => `
        <article style="border:1px solid #eee;border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem">
          <h3 style="font-weight:700;margin-bottom:0.5rem">${esc(t.landing.features[key].title)}</h3>
          <p style="color:#666;line-height:1.6;font-size:0.9rem">${esc(t.landing.features[key].text)}</p>
        </article>`
          )
          .join('')}
      </section>

      <!-- How It Works -->
      <section id="how-it-works" style="padding:4rem 0">
        <h2 style="font-size:2rem;font-weight:800;text-align:center;margin-bottom:2.5rem">${esc(t.landing.howItWorks.title)}</h2>
        <ol style="list-style:none;padding:0;counter-reset:steps">
          ${[1, 2, 3]
            .map(
              (n) => `
          <li style="margin-bottom:2rem;text-align:center">
            <strong style="display:inline-block;background:#863bff;color:#fff;width:3rem;height:3rem;line-height:3rem;border-radius:0.75rem;font-size:1.2rem;text-align:center">${n}</strong>
            <h3 style="font-weight:700;font-size:1.1rem;margin:0.75rem 0 0.25rem">${esc(t.landing.howItWorks[`step${n}Title`])}</h3>
            <p style="color:#666;font-size:0.9rem;max-width:20rem;margin:0 auto;line-height:1.6">${esc(t.landing.howItWorks[`step${n}Text`])}</p>
          </li>`
            )
            .join('')}
        </ol>
      </section>

      <!-- Mortgage -->
      <section style="padding:4rem 0">
        <p style="font-size:0.75rem;font-weight:600;color:#2a9d90;text-transform:uppercase;letter-spacing:0.1em">${esc(t.landing.mortgage.label)}</p>
        <h2 style="font-size:2rem;font-weight:800;margin:0.5rem 0 0.75rem">${esc(t.landing.mortgage.title)}</h2>
        <p style="color:#666;line-height:1.6;margin-bottom:1.5rem">${esc(t.landing.mortgage.subtitle)}</p>
        <ul style="list-style:none;padding:0">
          ${Array.from({ length: 6 }, (_, i) => `<li style="padding:0.75rem 0;border-bottom:1px solid #eee;font-size:0.9rem">✓ ${esc(t.landing.mortgage[`feature${i + 1}`])}</li>`).join('')}
        </ul>
      </section>

      <!-- Trust -->
      <section style="padding:4rem 0;text-align:center">
        <h2 style="font-size:2rem;font-weight:800;margin-bottom:0.5rem">${esc(t.landing.trust.title)}</h2>
        <p style="color:#666;max-width:32rem;margin:0 auto 2.5rem;line-height:1.6">${esc(t.landing.trust.subtitle)}</p>
        ${['encryption', 'export', 'delete', 'noAds']
          .map(
            (key) => `
        <div style="display:inline-block;width:14rem;vertical-align:top;padding:1rem;text-align:center">
          <h3 style="font-weight:700;font-size:0.95rem;margin-bottom:0.25rem">${esc(t.landing.trust[`${key}Title`])}</h3>
          <p style="color:#666;font-size:0.85rem;line-height:1.5">${esc(t.landing.trust[`${key}Text`])}</p>
        </div>`
          )
          .join('')}
      </section>

      ${landingArticles.length > 0 ? `
      <!-- Learn / From the blog — SSG mirror of the React Learn section.
           Googlebot reads these links without executing JS, passing homepage
           authority into every featured article. -->
      <section style="padding:4rem 0;background:#fafafa">
        <div style="text-align:center;margin-bottom:2.5rem">
          <p style="font-size:0.75rem;font-weight:600;color:#863bff;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.75rem">${esc(t.landing.learn.eyebrow)}</p>
          <h2 style="font-size:2rem;font-weight:800;margin:0 0 1rem">${esc(t.blog.index.title)}</h2>
          <p style="color:#666;max-width:36rem;margin:0 auto;line-height:1.6;font-size:0.95rem">${esc(t.blog.index.subtitle)}</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;max-width:64rem;margin:0 auto">
          ${landingArticles
            .map((a) => {
              const url = lang === DEFAULT_LANG ? `/blog/${a.slug}/` : `/${lang}/blog/${a.slug}/`
              const categoryLabel = t.blog.categories[a.category] ?? a.category
              const heroImg = a.heroImage
                ? `<div style="aspect-ratio:16/9;background:#f5f5f5;overflow:hidden"><img src="${a.heroImage}" alt="${attr(a.heroImageAlt || '')}" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy" /></div>`
                : `<div style="aspect-ratio:16/9;background:linear-gradient(135deg,#f5f0ff,#fafafa);display:flex;align-items:center;justify-content:center"><span style="color:#863bff;opacity:0.25;font-weight:800;font-size:1.25rem">CasaTab</span></div>`
              return `
          <article style="border:1px solid #eee;border-radius:0.75rem;overflow:hidden;background:#fff">
            ${heroImg}
            <div style="padding:1.25rem">
              <p style="font-size:0.65rem;font-weight:700;color:#863bff;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 0.5rem">${esc(categoryLabel)}</p>
              <h3 style="font-size:1rem;font-weight:700;margin:0 0 0.5rem;line-height:1.3"><a href="${url}" style="color:#171717;text-decoration:none">${esc(a.title)}</a></h3>
              <p style="color:#666;font-size:0.85rem;line-height:1.5;margin:0">${esc(a.excerpt)}</p>
            </div>
          </article>`
            })
            .join('')}
        </div>
        <div style="text-align:center;margin-top:2rem">
          <a href="${lang === DEFAULT_LANG ? '/blog/' : `/${lang}/blog/`}" style="color:#863bff;text-decoration:none;font-weight:600;font-size:0.9rem">${esc(t.landing.learn.viewAll)} →</a>
        </div>
      </section>
      ` : ''}

      <!-- FAQ -->
      <section id="faq" style="padding:4rem 0;max-width:42rem;margin:0 auto">
        <h2 style="font-size:2rem;font-weight:800;text-align:center;margin-bottom:2rem">${esc(t.landing.faq.title)}</h2>
        <dl>
          ${Array.from(
            { length: 6 },
            (_, i) => `
          <dt style="font-weight:600;padding:1rem 0 0.5rem;border-top:1px solid #eee">${esc(t.landing.faq[`q${i + 1}`])}</dt>
          <dd style="color:#666;line-height:1.6;padding-bottom:1rem;margin:0;font-size:0.9rem">${esc(t.landing.faq[`a${i + 1}`])}</dd>`
          ).join('')}
        </dl>
      </section>

      <!-- CTA -->
      <section style="padding:4rem 0;text-align:center">
        <div style="background:#863bff;color:#fff;border-radius:1.5rem;padding:3rem 2rem">
          <h2 style="font-size:2rem;font-weight:800;margin-bottom:0.75rem">${esc(t.landing.cta.title)}</h2>
          <p style="opacity:0.8;max-width:28rem;margin:0 auto 1.5rem">${esc(t.landing.cta.subtitle)}</p>
          <a href="${loginHref}" style="background:#fff;color:#863bff;padding:0.75rem 2rem;border-radius:0.75rem;text-decoration:none;font-weight:600">${esc(t.landing.cta.button)}</a>
        </div>
      </section>

    </main>

    <!-- Footer -->
    <footer style="border-top:1px solid #eee;padding:2rem 0;color:#666;font-size:0.85rem">
      <p style="font-weight:700;color:#171717;margin-bottom:0.25rem">CasaTab</p>
      <p style="margin-bottom:1.5rem">${esc(t.landing.footer.tagline)}</p>
      <nav style="margin-bottom:1rem">
        <a href="/privacy" style="color:#666;margin-right:1rem;text-decoration:none">${esc(t.common.privacyPolicy)}</a>
        <a href="/login" style="color:#666;text-decoration:none">${esc(t.landing.nav.logIn)}</a>
      </nav>
      <p style="font-size:0.75rem;color:#999">&copy; ${CURRENT_YEAR} CasaTab. ${esc(t.landing.footer.rights)}</p>
      <nav style="margin-top:0.5rem">${langLinks}</nav>
    </footer>

  </div>`
}

/* ═══════════════════ Page generation ═══════════════════ */

// Read the base HTML once (before any modifications)
const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf-8')

function generatePage(lang, landingArticles = []) {
  const t = readLocale(lang)
  const url = langUrl(lang)
  const title = PAGE_TITLES[lang]
  const description = META_DESCRIPTIONS[lang]
  const keywords = META_KEYWORDS[lang]

  let html = baseHtml

  // 1. Set <html lang>
  html = html.replace(/<html\s+lang="[^"]*"/, `<html lang="${lang}"`)

  // 2. Replace <title>
  html = html.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)

  // 3. Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${attr(description)}" />`
  )

  // 4. Replace keywords
  html = html.replace(
    /<meta name="keywords" content="[^"]*" \/>/,
    `<meta name="keywords" content="${attr(keywords)}" />`
  )

  // 5. Replace OG tags
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${attr(title)}" />`
  )
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${attr(description)}" />`
  )
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${url}" />`
  )
  const OG_LOCALES = { en: 'en_US', es: 'es_ES', fr: 'fr_FR', de: 'de_DE', nl: 'nl_NL', pt: 'pt_PT' }
  html = html.replace(
    /<meta property="og:locale" content="[^"]*" \/>/,
    `<meta property="og:locale" content="${OG_LOCALES[lang]}" />`
  )

  // 6. Replace Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${attr(title)}" />`
  )
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${attr(description)}" />`
  )

  // 7. Replace canonical URL
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${url}" />`
  )

  // 8. Remove existing JSON-LD and add language-specific versions
  html = html.replace(
    /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
    ''
  )
  const jsonLd = generateJsonLd(t, lang)

  // 9. Add hreflang tags + canonical + JSON-LD before </head>
  const headInsert = [
    '',
    '    <!-- hreflang: tell search engines about language versions -->',
    hreflangTags(),
    '',
    '    <!-- Structured data -->',
    jsonLd,
  ].join('\n')

  html = html.replace('</head>', `${headInsert}\n  </head>`)

  // 10. Insert pre-rendered content inside <div id="root">
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${prerenderedContent(t, lang, landingArticles)}\n    </div>`
  )

  // 11. Language scripts injected before the module script in <head>
  if (lang === DEFAULT_LANG) {
    // For the root English page: detect non-English browsers and redirect
    // to their language page before <body> is parsed (prevents flash of wrong language).
    // Googlebot uses navigator.language="en-US" so the redirect never fires for crawlers.
    const supportedList = LANGUAGES.join(',')
    const detectScript = `<script>(function(){if(window.location.pathname!=='/')return;var s='${supportedList}'.split(',');var l;try{l=localStorage.getItem('i18nextLng')}catch(e){}if(!l){var n=navigator.language||'';l=n.split('-')[0].toLowerCase()}if(l&&l!=='en'&&s.indexOf(l)!==-1){window.location.replace('/'+l+'/')}})()</script>`
    html = html.replace(
      /<script type="module"/,
      `${detectScript}\n    <script type="module"`
    )
  } else {
    // For non-default languages: set localStorage before React loads
    // so i18next picks the right language on init.
    // React Router has matching routes for /es, /fr, etc. so no URL normalization needed.
    html = html.replace(
      /<script type="module"/,
      `<script>try{localStorage.setItem('i18nextLng','${lang}')}catch(e){}</script>\n    <script type="module"`
    )
  }

  return html
}

/* ═══════════════════ Blog content loader (Node-side) ═══════════════════ */

const BLOG_DIR = join(ROOT, 'src', 'content', 'blog', 'posts')

/**
 * Walks `src/content/blog/posts/{canonicalSlug}/{lang}.md` and returns a
 * flat list of parsed articles. Mirrors the client loader in `src/lib/blog.ts`
 * but runs in Node at build time to emit pre-rendered HTML per article.
 */
function loadBlogArticles() {
  if (!existsSync(BLOG_DIR)) return []
  const articles = []
  for (const folder of readdirSync(BLOG_DIR)) {
    const folderPath = join(BLOG_DIR, folder)
    let files
    try {
      files = readdirSync(folderPath)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const lang = file.replace(/\.md$/, '')
      if (!LANGUAGES.includes(lang)) continue
      const raw = readFileSync(join(folderPath, file), 'utf-8')
      const parsed = matter(raw)
      const fm = parsed.data
      if (!fm.title || !fm.slug || !fm.canonicalSlug || !fm.publishedAt || !fm.category) continue
      const body = parsed.content.trim()
      const htmlRaw = marked.parse(body, { async: false, gfm: true })
      // Mirror the client pipeline: sanitise before adding heading ids so the
      // static HTML and the React-rendered HTML are byte-comparable.
      const sanitized = DOMPurify.sanitize(htmlRaw, { USE_PROFILES: { html: true } })
      const html = addHeadingIdsNode(sanitized)
      const wordCount = body.split(/\s+/).filter(Boolean).length
      articles.push({
        title: fm.title,
        description: fm.description ?? fm.excerpt ?? '',
        excerpt: fm.excerpt ?? fm.description ?? '',
        slug: fm.slug,
        canonicalSlug: fm.canonicalSlug,
        publishedAt: fm.publishedAt,
        updatedAt: fm.updatedAt ?? fm.publishedAt,
        category: fm.category,
        heroImage: fm.heroImage,
        heroImageAlt: fm.heroImageAlt ?? '',
        author: fm.author ?? 'CasaTab Editorial',
        lang,
        body,
        html,
        readingTime: Math.max(1, Math.round(wordCount / 200)),
        wordCount,
      })
    }
  }
  articles.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
  return articles
}

/** Mirrors the client-side heading slugifier so TOC anchors match between SSG HTML and hydrated HTML. */
function addHeadingIdsNode(html) {
  const used = new Map()
  return html.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (_, tag, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim()
    const base = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    const id = seen === 0 ? base : `${base}-${seen + 1}`
    return `<${tag} id="${id}">${inner}</${tag}>`
  })
}

/* ═══════════════════ Blog URL + hreflang helpers ═══════════════════ */

function blogIndexUrl(lang) {
  return lang === DEFAULT_LANG ? `${DOMAIN}/blog/` : `${DOMAIN}/${lang}/blog/`
}

function blogArticleUrl(lang, slug) {
  return lang === DEFAULT_LANG ? `${DOMAIN}/blog/${slug}/` : `${DOMAIN}/${lang}/blog/${slug}/`
}

function blogIndexHreflang() {
  const tags = LANGUAGES.map(
    (lang) => `    <link rel="alternate" hreflang="${lang}" href="${blogIndexUrl(lang)}" />`,
  )
  tags.push(`    <link rel="alternate" hreflang="x-default" href="${DOMAIN}/blog/" />`)
  return tags.join('\n')
}

function articleHreflang(canonicalSlug, articlesByLang) {
  const tags = []
  for (const lang of LANGUAGES) {
    const article = articlesByLang.get(`${canonicalSlug}|${lang}`)
    if (!article) continue
    tags.push(`    <link rel="alternate" hreflang="${lang}" href="${blogArticleUrl(lang, article.slug)}" />`)
  }
  const englishArticle = articlesByLang.get(`${canonicalSlug}|en`)
  if (englishArticle) {
    tags.push(`    <link rel="alternate" hreflang="x-default" href="${blogArticleUrl(DEFAULT_LANG, englishArticle.slug)}" />`)
  }
  return tags.join('\n')
}

/* ═══════════════════ Blog JSON-LD ═══════════════════ */

function generateBlogIndexJsonLd(t, lang) {
  const url = blogIndexUrl(lang)
  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${t.blog.index.title} — CasaTab`,
    description: t.blog.index.subtitle,
    url,
    inLanguage: lang,
    isPartOf: { '@type': 'WebSite', name: 'CasaTab', url: DOMAIN },
  }
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t.blog.index.title,
    url,
    inLanguage: lang,
  }
  return [
    `    <script type="application/ld+json">\n    ${JSON.stringify(webPage)}\n    </script>`,
    `    <script type="application/ld+json">\n    ${JSON.stringify(collection)}\n    </script>`,
  ].join('\n')
}

function generateArticleJsonLd(article, t) {
  const url = blogArticleUrl(article.lang, article.slug)
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description || article.excerpt,
    inLanguage: article.lang,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    wordCount: article.wordCount,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: article.heroImage
      ? (article.heroImage.startsWith('http') ? article.heroImage : `${DOMAIN}${article.heroImage}`)
      : `${DOMAIN}/og-image.png`,
    // If the frontmatter names a specific author, expose them as a Person —
    // the strongest E-E-A-T signal Google rewards. Fall back to the brand
    // as Organization when no name is provided.
    author: article.author && article.author !== 'CasaTab Editorial'
      ? { '@type': 'Person', name: article.author }
      : { '@type': 'Organization', name: 'CasaTab', url: DOMAIN },
    publisher: {
      '@type': 'Organization',
      name: 'CasaTab',
      logo: { '@type': 'ImageObject', url: `${DOMAIN}/icon-192.png` },
    },
  }
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'CasaTab', item: article.lang === DEFAULT_LANG ? DOMAIN + '/' : `${DOMAIN}/${article.lang}/` },
      { '@type': 'ListItem', position: 2, name: t.blog.index.title, item: blogIndexUrl(article.lang) },
      { '@type': 'ListItem', position: 3, name: article.title, item: url },
    ],
  }
  const blocks = [
    `    <script type="application/ld+json">\n    ${JSON.stringify(articleLd)}\n    </script>`,
    `    <script type="application/ld+json">\n    ${JSON.stringify(breadcrumbs)}\n    </script>`,
  ]

  // FAQPage JSON-LD — auto-extracted from H2/H3 headings that end in "?"
  // (or the fullwidth "？") followed by paragraph answers. This is the
  // single highest-ROI LLM citation signal per 2026 research — ChatGPT /
  // Perplexity / Google AI Overviews lift FAQPage Q&A verbatim.
  const faqItems = extractFaqItems(article.html)
  if (faqItems.length >= 2) {
    const faqPage = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: article.lang,
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    }
    blocks.push(`    <script type="application/ld+json">\n    ${JSON.stringify(faqPage)}\n    </script>`)
  }

  return blocks.join('\n')
}

/**
 * Scan the rendered article HTML for H2/H3 headings whose trimmed inner text
 * ends with "?" (or fullwidth "？") and pair each with the paragraph text
 * that immediately follows it (until the next h2/h3). Returns `[]` when no
 * question-headings are present.
 *
 * Notes on robustness:
 * - HTML here is our own output (from marked + DOMPurify), so regex parsing
 *   is safe enough — we control the structure and don't need a DOM parser.
 * - Heading text may contain nested inline tags (<strong>, <em>); strip
 *   those before evaluating the trailing character.
 * - Answer text is capped at 1200 chars so FAQPage JSON-LD doesn't dwarf
 *   the Article schema (Google rich-result guidelines recommend concise
 *   answers).
 */
function extractFaqItems(html) {
  const items = []
  const re = /<(h[23])[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<h[23][\s>]|$)/g
  let m
  while ((m = re.exec(html)) !== null) {
    const questionText = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!/[?？]$/.test(questionText)) continue

    // Extract paragraphs inside the captured body, strip inline HTML
    const body = m[3]
    const paragraphs = []
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/g
    let pm
    while ((pm = pRe.exec(body)) !== null) {
      const text = pm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (text) paragraphs.push(text)
    }
    const answer = paragraphs.join(' ').slice(0, 1200).trim()
    if (answer.length < 40) continue
    items.push({ question: questionText, answer })
  }
  return items
}

/* ═══════════════════ Blog pre-rendered HTML ═══════════════════ */

function formatDate(iso, lang) {
  // Avoid Intl in the build script — it relies on CLDR data. A plain
  // "Month Day, Year" (localised month names per language) is enough for
  // the SEO fallback; React replaces it with date-fns on client mount.
  const months = {
    en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    es: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
    fr: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
    de: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
    nl: ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'],
    pt: ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],
  }
  const d = new Date(iso)
  const m = months[lang] ?? months.en
  if (lang === 'en') return `${m[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
  return `${d.getUTCDate()} ${m[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function prerenderedBlogIndex(t, lang, articles) {
  const articleCards = articles
    .map((a) => {
      const url = lang === DEFAULT_LANG ? `/blog/${a.slug}/` : `/${lang}/blog/${a.slug}/`
      return `
        <article style="border:1px solid #eee;border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem;background:#fff">
          <p style="font-size:0.7rem;font-weight:700;color:#863bff;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 0.5rem">${esc(t.blog.categories[a.category] ?? a.category)}</p>
          <h2 style="font-size:1.25rem;font-weight:800;margin:0 0 0.5rem"><a href="${url}" style="color:#171717;text-decoration:none">${esc(a.title)}</a></h2>
          <p style="color:#666;line-height:1.6;font-size:0.9rem;margin:0 0 0.75rem">${esc(a.excerpt)}</p>
          <p style="font-size:0.8rem;color:#999;margin:0">${esc(formatDate(a.publishedAt, lang))} · ${a.readingTime} min</p>
        </article>`
    })
    .join('')

  const landingHome = lang === DEFAULT_LANG ? '/' : `/${lang}/`

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171717;max-width:72rem;margin:0 auto;padding:0 1.5rem">

    <header style="padding:1rem 0;display:flex;align-items:center;justify-content:space-between">
      <a href="${landingHome}" style="font-weight:700;font-size:1.1rem;text-decoration:none;color:#171717">CasaTab</a>
      <nav>
        <a href="${landingHome}#features" style="margin-right:1.5rem;color:#666;text-decoration:none">${esc(t.landing.nav.features)}</a>
        <a href="${blogIndexUrl(lang).replace(DOMAIN, '')}" style="margin-right:1.5rem;color:#171717;text-decoration:none;font-weight:600">${esc(t.landing.nav.blog)}</a>
        <a href="/login?mode=signup" style="background:#863bff;color:#fff;padding:0.5rem 1rem;border-radius:0.5rem;text-decoration:none;font-weight:600">${esc(t.landing.nav.getStarted)}</a>
      </nav>
    </header>

    <main>
      <section style="text-align:center;padding:4rem 0 2rem">
        <p style="font-size:0.75rem;font-weight:600;color:#863bff;text-transform:uppercase;letter-spacing:0.1em">${esc(t.blog.index.eyebrow)}</p>
        <h1 style="font-size:2.5rem;font-weight:800;line-height:1.1;margin:1rem auto;max-width:42rem">${esc(t.blog.index.title)}</h1>
        <p style="font-size:1.1rem;color:#666;max-width:38rem;margin:1rem auto;line-height:1.6">${esc(t.blog.index.subtitle)}</p>
      </section>

      <section style="padding:2rem 0">
        ${articleCards}
      </section>
    </main>

    <footer style="border-top:1px solid #eee;padding:2rem 0;color:#666;font-size:0.85rem">
      <p style="font-weight:700;color:#171717;margin-bottom:0.25rem">CasaTab</p>
      <p style="margin-bottom:1.5rem">${esc(t.landing.footer.tagline)}</p>
      <nav style="margin-bottom:1rem">
        <a href="/privacy" style="color:#666;margin-right:1rem;text-decoration:none">${esc(t.common.privacyPolicy)}</a>
        <a href="/login" style="color:#666;text-decoration:none">${esc(t.landing.nav.logIn)}</a>
      </nav>
      <p style="font-size:0.75rem;color:#999">&copy; ${CURRENT_YEAR} CasaTab. ${esc(t.landing.footer.rights)}</p>
    </footer>
  </div>`
}

function prerenderedBlogArticle(article, t, allArticles) {
  const lang = article.lang
  const landingHome = lang === DEFAULT_LANG ? '/' : `/${lang}/`
  const blogIndexPath = blogIndexUrl(lang).replace(DOMAIN, '')

  // Related: same-category first, then rest; limit 2
  const sameLang = allArticles.filter((a) => a.lang === lang && a.slug !== article.slug)
  const sameCat = sameLang.filter((a) => a.category === article.category)
  const related = [...sameCat, ...sameLang.filter((a) => a.category !== article.category)].slice(0, 2)

  const relatedCards = related
    .map((a) => {
      const url = lang === DEFAULT_LANG ? `/blog/${a.slug}/` : `/${lang}/blog/${a.slug}/`
      return `
        <article style="border:1px solid #eee;border-radius:0.75rem;padding:1.25rem;background:#fff">
          <p style="font-size:0.7rem;font-weight:700;color:#863bff;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 0.5rem">${esc(t.blog.categories[a.category] ?? a.category)}</p>
          <h3 style="font-size:1rem;font-weight:700;margin:0 0 0.5rem"><a href="${url}" style="color:#171717;text-decoration:none">${esc(a.title)}</a></h3>
          <p style="color:#666;line-height:1.5;font-size:0.85rem;margin:0">${esc(a.excerpt)}</p>
        </article>`
    })
    .join('')

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171717;max-width:72rem;margin:0 auto;padding:0 1.5rem">

    <header style="padding:1rem 0;display:flex;align-items:center;justify-content:space-between">
      <a href="${landingHome}" style="font-weight:700;font-size:1.1rem;text-decoration:none;color:#171717">CasaTab</a>
      <nav>
        <a href="${blogIndexPath}" style="margin-right:1.5rem;color:#666;text-decoration:none">${esc(t.landing.nav.blog)}</a>
        <a href="/login?mode=signup" style="background:#863bff;color:#fff;padding:0.5rem 1rem;border-radius:0.5rem;text-decoration:none;font-weight:600">${esc(t.landing.nav.getStarted)}</a>
      </nav>
    </header>

    <main>
      <p style="padding:1rem 0"><a href="${blogIndexPath}" style="color:#666;text-decoration:none;font-size:0.9rem">← ${esc(t.blog.article.backToBlog)}</a></p>

      <article style="max-width:42rem;margin:0 auto;padding:1rem 0">
        <header style="text-align:center;margin-bottom:2.5rem">
          <p style="font-size:0.7rem;font-weight:700;color:#863bff;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 0.75rem">${esc(t.blog.categories[article.category] ?? article.category)}</p>
          <h1 style="font-size:2.25rem;font-weight:800;line-height:1.15;margin:0 0 1rem">${esc(article.title)}</h1>
          <p style="color:#666;font-size:1.05rem;line-height:1.5;margin:0 0 1rem">${esc(article.excerpt)}</p>
          <p style="color:#999;font-size:0.85rem;margin:0">
            <span itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name">${esc(article.author)}</span></span>
            · <time datetime="${article.publishedAt}">${esc(formatDate(article.publishedAt, lang))}</time>
            · ${article.readingTime} min
          </p>
        </header>
        ${article.heroImage ? `
        <figure style="margin:0 0 2.5rem;border-radius:1rem;overflow:hidden;border:1px solid #eee;aspect-ratio:16/9">
          <img src="${article.heroImage}"${buildSrcSetAttr(article.heroImage)} sizes="(min-width: 1024px) 960px, (min-width: 640px) 90vw, 100vw" alt="${attr(article.heroImageAlt || '')}" width="1600" height="900" style="width:100%;height:100%;object-fit:cover;display:block" loading="eager" fetchpriority="high" decoding="async" />
        </figure>` : ''}

        <div style="line-height:1.75;font-size:1.05rem;color:#333">
${article.html}
        </div>
      </article>

      <section style="max-width:42rem;margin:3rem auto;padding:2rem;background:#863bff;color:#fff;border-radius:1.5rem;text-align:center">
        <h2 style="font-size:1.75rem;font-weight:800;margin:0 0 0.75rem">${esc(t.blog.article.ctaTitle)}</h2>
        <p style="opacity:0.85;margin:0 0 1.25rem">${esc(t.blog.article.ctaSubtitle)}</p>
        <a href="/login?mode=signup" style="background:#fff;color:#863bff;padding:0.75rem 2rem;border-radius:0.75rem;text-decoration:none;font-weight:600">${esc(t.blog.article.ctaButton)}</a>
      </section>

      ${relatedCards ? `
      <section style="max-width:56rem;margin:3rem auto;padding:2rem 0;border-top:1px solid #eee">
        <h2 style="font-size:1.5rem;font-weight:800;margin:0 0 1.5rem">${esc(t.blog.article.relatedArticles)}</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
          ${relatedCards}
        </div>
      </section>` : ''}
    </main>

    <footer style="border-top:1px solid #eee;padding:2rem 0;color:#666;font-size:0.85rem">
      <p style="font-weight:700;color:#171717;margin-bottom:0.25rem">CasaTab</p>
      <p>${esc(t.landing.footer.tagline)}</p>
      <p style="font-size:0.75rem;color:#999;margin-top:1rem">&copy; ${CURRENT_YEAR} CasaTab. ${esc(t.landing.footer.rights)}</p>
    </footer>
  </div>`
}

/* ═══════════════════ Shared head-meta rewriter ═══════════════════ */

/**
 * Runs the 11-step head rewrite that both landing and blog generators need.
 * `jsonLd` should already be the serialized `<script>` blocks (indented).
 */
function replaceHeadMeta({ baseHtml, lang, title, description, keywords, url, ogImage, jsonLd, hreflang, rssUrl }) {
  let html = baseHtml
  html = html.replace(/<html\s+lang="[^"]*"/, `<html lang="${lang}"`)
  html = html.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${attr(description)}" />`,
  )
  if (keywords !== undefined) {
    html = html.replace(
      /<meta name="keywords" content="[^"]*" \/>/,
      `<meta name="keywords" content="${attr(keywords)}" />`,
    )
  }
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${attr(title)}" />`,
  )
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${attr(description)}" />`,
  )
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${url}" />`,
  )
  const OG_LOCALES = { en: 'en_US', es: 'es_ES', fr: 'fr_FR', de: 'de_DE', nl: 'nl_NL', pt: 'pt_PT' }
  html = html.replace(
    /<meta property="og:locale" content="[^"]*" \/>/,
    `<meta property="og:locale" content="${OG_LOCALES[lang]}" />`,
  )
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${attr(title)}" />`,
  )
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${attr(description)}" />`,
  )
  if (ogImage) {
    html = html.replace(
      /<meta property="og:image" content="[^"]*" \/>/,
      `<meta property="og:image" content="${attr(ogImage)}" />`,
    )
    // Twitter's card fetcher reads twitter:image independently of og:image
    // on some paths (X.com, embedded previews). Mirror the OG image so
    // social shares show the right hero regardless of which crawler picks.
    html = html.replace(
      /<meta name="twitter:image" content="[^"]*" \/>/,
      `<meta name="twitter:image" content="${attr(ogImage)}" />`,
    )
  }
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${url}" />`,
  )
  html = html.replace(
    /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
    '',
  )
  const parts = [
    '',
    '    <!-- hreflang -->',
    hreflang,
    '',
    '    <!-- Structured data -->',
    jsonLd,
  ]
  if (rssUrl) {
    parts.push(
      '',
      '    <!-- Feed discovery -->',
      `    <link rel="alternate" type="application/rss+xml" title="CasaTab — ${lang.toUpperCase()}" href="${rssUrl}" />`,
      `    <link rel="alternate" type="application/feed+json" title="CasaTab — ${lang.toUpperCase()}" href="${rssUrl.replace(/\.xml$/, '.json')}" />`,
    )
  }
  html = html.replace('</head>', `${parts.join('\n')}\n  </head>`)
  return html
}

/* ═══════════════════ Blog page generators ═══════════════════ */

function generateBlogIndexPage(lang, articles) {
  const t = readLocale(lang)
  const url = blogIndexUrl(lang)
  const title = `${t.blog.index.title} — CasaTab`
  const description = t.blog.index.subtitle
  const jsonLd = generateBlogIndexJsonLd(t, lang)
  const hreflang = blogIndexHreflang()

  let html = replaceHeadMeta({
    baseHtml,
    lang,
    title,
    description,
    keywords: undefined,
    url,
    jsonLd,
    hreflang,
    rssUrl: feedUrl(lang, 'xml'),
  })

  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${prerenderedBlogIndex(t, lang, articles)}\n    </div>`,
  )

  // Inject localStorage for non-English so i18next picks the right locale.
  // We deliberately do NOT inject the browser-language-redirect script —
  // the blog index is a valid destination in every language and hreflang
  // tells search engines about the alternates.
  if (lang !== DEFAULT_LANG) {
    html = html.replace(
      /<script type="module"/,
      `<script>try{localStorage.setItem('i18nextLng','${lang}')}catch(e){}</script>\n    <script type="module"`,
    )
  }

  return html
}

function generateBlogArticlePage(article, articlesByLang, allArticles) {
  const lang = article.lang
  const t = readLocale(lang)
  const url = blogArticleUrl(lang, article.slug)
  const title = `${article.title} — CasaTab`
  const description = article.description || article.excerpt
  const jsonLd = generateArticleJsonLd(article, t)
  const hreflang = articleHreflang(article.canonicalSlug, articlesByLang)
  const ogImage = article.heroImage
    ? (article.heroImage.startsWith('http') ? article.heroImage : `${DOMAIN}${article.heroImage}`)
    : undefined

  let html = replaceHeadMeta({
    baseHtml,
    lang,
    title,
    description,
    keywords: undefined,
    url,
    ogImage,
    jsonLd,
    hreflang,
    rssUrl: feedUrl(lang, 'xml'),
  })

  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${prerenderedBlogArticle(article, t, allArticles)}\n    </div>`,
  )

  if (lang !== DEFAULT_LANG) {
    html = html.replace(
      /<script type="module"/,
      `<script>try{localStorage.setItem('i18nextLng','${lang}')}catch(e){}</script>\n    <script type="module"`,
    )
  }

  return html
}

/* ═══════════════════ RSS + JSON Feed ═══════════════════ */

/**
 * One feed per language. Default language lives at `/feed.xml`; others at
 * `/{lang}/feed.xml`. Readers and LLM crawlers (ChatGPT, Perplexity, Claude)
 * consume these to discover and cite new articles. Keeping them language-
 * scoped avoids mixing locales in a single aggregator view.
 */
function feedUrl(lang, ext = 'xml') {
  return lang === DEFAULT_LANG ? `${DOMAIN}/feed.${ext}` : `${DOMAIN}/${lang}/feed.${ext}`
}

/** Minimal XML escape for RSS text nodes + CDATA fallback for HTML bodies. */
function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function rfc822(iso) {
  const d = new Date(iso)
  return d.toUTCString()
}

function generateRssFeed(lang, articles) {
  const t = readLocale(lang)
  const channelTitle = `${t.blog.index.title} — CasaTab`
  const channelDesc = t.blog.index.subtitle
  const lastBuild = articles.length > 0 ? articles[0].updatedAt : new Date().toISOString().slice(0, 10)

  const items = articles
    .slice(0, 50)
    .map((a) => {
      const url = blogArticleUrl(lang, a.slug)
      // content:encoded carries the full HTML body wrapped in CDATA so
      // feed readers can render it; description is the short excerpt.
      return `
    <item>
      <title>${xmlEsc(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(a.publishedAt)}</pubDate>
      <category>${xmlEsc(t.blog.categories[a.category] ?? a.category)}</category>
      <dc:creator>${xmlEsc(a.author)}</dc:creator>
      <description>${xmlEsc(a.excerpt)}</description>
      <content:encoded><![CDATA[${a.html}]]></content:encoded>
    </item>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEsc(channelTitle)}</title>
    <link>${blogIndexUrl(lang)}</link>
    <atom:link href="${feedUrl(lang, 'xml')}" rel="self" type="application/rss+xml" />
    <description>${xmlEsc(channelDesc)}</description>
    <language>${lang}</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <generator>CasaTab SEO build</generator>${items}
  </channel>
</rss>
`
}

function generateJsonFeed(lang, articles) {
  const t = readLocale(lang)
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${t.blog.index.title} — CasaTab`,
    description: t.blog.index.subtitle,
    home_page_url: blogIndexUrl(lang),
    feed_url: feedUrl(lang, 'json'),
    language: lang,
    items: articles.slice(0, 50).map((a) => ({
      id: blogArticleUrl(lang, a.slug),
      url: blogArticleUrl(lang, a.slug),
      title: a.title,
      content_html: a.html,
      summary: a.excerpt,
      date_published: new Date(a.publishedAt).toISOString(),
      date_modified: new Date(a.updatedAt).toISOString(),
      authors: [{ name: a.author }],
      tags: [t.blog.categories[a.category] ?? a.category],
      image: a.heroImage
        ? (a.heroImage.startsWith('http') ? a.heroImage : `${DOMAIN}${a.heroImage}`)
        : undefined,
    })),
  }
}

/* ═══════════════════ Sitemap generation ═══════════════════ */

function generateSitemap(articles) {
  const landingHreflang = LANGUAGES.map(
    (lang) => `      <xhtml:link rel="alternate" hreflang="${lang}" href="${langUrl(lang)}" />`,
  )
  landingHreflang.push(`      <xhtml:link rel="alternate" hreflang="x-default" href="${DOMAIN}/" />`)
  const landingHreflangBlock = landingHreflang.join('\n')

  const landingUrls = LANGUAGES.map(
    (lang) => `
    <url>
      <loc>${langUrl(lang)}</loc>
      <changefreq>weekly</changefreq>
      <priority>1.0</priority>
${landingHreflangBlock}
    </url>`,
  ).join('')

  // Blog index per language, cross-hreflang'd to every other language's blog index.
  const blogIndexHreflangBlock = LANGUAGES
    .map((lang) => `      <xhtml:link rel="alternate" hreflang="${lang}" href="${blogIndexUrl(lang)}" />`)
    .concat(`      <xhtml:link rel="alternate" hreflang="x-default" href="${DOMAIN}/blog/" />`)
    .join('\n')

  const blogIndexUrls = LANGUAGES.map(
    (lang) => `
    <url>
      <loc>${blogIndexUrl(lang)}</loc>
      <changefreq>weekly</changefreq>
      <priority>0.8</priority>
${blogIndexHreflangBlock}
    </url>`,
  ).join('')

  // Articles: one <url> per (canonicalSlug, lang) with hreflang linking to all translated variants.
  const canonicals = Array.from(new Set(articles.map((a) => a.canonicalSlug)))
  const articlesByLang = new Map()
  for (const a of articles) articlesByLang.set(`${a.canonicalSlug}|${a.lang}`, a)

  const articleUrls = []
  for (const canonical of canonicals) {
    const hreflang = LANGUAGES.map((lang) => {
      const art = articlesByLang.get(`${canonical}|${lang}`)
      if (!art) return null
      return `      <xhtml:link rel="alternate" hreflang="${lang}" href="${blogArticleUrl(lang, art.slug)}" />`
    }).filter(Boolean)
    const enArt = articlesByLang.get(`${canonical}|en`)
    if (enArt) {
      hreflang.push(`      <xhtml:link rel="alternate" hreflang="x-default" href="${blogArticleUrl(DEFAULT_LANG, enArt.slug)}" />`)
    }
    const hreflangBlock = hreflang.join('\n')

    for (const lang of LANGUAGES) {
      const art = articlesByLang.get(`${canonical}|${lang}`)
      if (!art) continue
      articleUrls.push(`
    <url>
      <loc>${blogArticleUrl(lang, art.slug)}</loc>
      <lastmod>${art.updatedAt}</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.7</priority>
${hreflangBlock}
    </url>`)
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${landingUrls}
${blogIndexUrls}
${articleUrls.join('')}

    <url>
      <loc>${DOMAIN}/login</loc>
      <changefreq>monthly</changefreq>
      <priority>0.6</priority>
    </url>

    <url>
      <loc>${DOMAIN}/privacy</loc>
      <changefreq>monthly</changefreq>
      <priority>0.3</priority>
    </url>
</urlset>
`
}

/* ═══════════════════ Main ═══════════════════ */

console.log('Generating SEO pages...')

// Load articles once — the landing pages' new Learn section features the
// top 3 articles per language, and the blog pages need the full corpus.
const blogArticles = loadBlogArticles()
const articlesByLang = new Map()
for (const a of blogArticles) articlesByLang.set(`${a.canonicalSlug}|${a.lang}`, a)

for (const lang of LANGUAGES) {
  // Top 3 articles for the landing's Learn section (already sorted by
  // publishedAt desc in loadBlogArticles).
  const landingArticles = blogArticles.filter((a) => a.lang === lang).slice(0, 3)
  const html = generatePage(lang, landingArticles)

  if (lang === DEFAULT_LANG) {
    // Overwrite dist/index.html (English)
    writeFileSync(join(DIST, 'index.html'), html, 'utf-8')
    console.log(`  ✓ /index.html (${lang})`)
  } else {
    // Create dist/{lang}/index.html
    const dir = join(DIST, lang)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), html, 'utf-8')
    console.log(`  ✓ /${lang}/index.html`)
  }
}

/* ── Blog pages ── */

for (const lang of LANGUAGES) {
  const articlesForLang = blogArticles.filter((a) => a.lang === lang)
  const indexHtml = generateBlogIndexPage(lang, articlesForLang)
  const indexDir = lang === DEFAULT_LANG ? join(DIST, 'blog') : join(DIST, lang, 'blog')
  mkdirSync(indexDir, { recursive: true })
  writeFileSync(join(indexDir, 'index.html'), indexHtml, 'utf-8')
  console.log(`  ✓ ${lang === DEFAULT_LANG ? '/blog/index.html' : `/${lang}/blog/index.html`}`)

  for (const article of articlesForLang) {
    const articleHtml = generateBlogArticlePage(article, articlesByLang, blogArticles)
    const articleDir = lang === DEFAULT_LANG
      ? join(DIST, 'blog', article.slug)
      : join(DIST, lang, 'blog', article.slug)
    mkdirSync(articleDir, { recursive: true })
    writeFileSync(join(articleDir, 'index.html'), articleHtml, 'utf-8')
    console.log(`  ✓ ${lang === DEFAULT_LANG ? `/blog/${article.slug}/index.html` : `/${lang}/blog/${article.slug}/index.html`}`)
  }
}

// Overwrite sitemap with multilingual version (includes blog URLs)
writeFileSync(join(DIST, 'sitemap.xml'), generateSitemap(blogArticles), 'utf-8')
console.log('  ✓ /sitemap.xml (multilingual + blog)')

/* ── RSS + JSON Feed (per language) ── */

for (const lang of LANGUAGES) {
  const articlesForLang = blogArticles.filter((a) => a.lang === lang)
  if (articlesForLang.length === 0) continue

  const rss = generateRssFeed(lang, articlesForLang)
  const jsonFeed = JSON.stringify(generateJsonFeed(lang, articlesForLang), null, 2)

  const feedDir = lang === DEFAULT_LANG ? DIST : join(DIST, lang)
  mkdirSync(feedDir, { recursive: true })
  writeFileSync(join(feedDir, 'feed.xml'), rss, 'utf-8')
  writeFileSync(join(feedDir, 'feed.json'), jsonFeed, 'utf-8')
  console.log(`  ✓ ${lang === DEFAULT_LANG ? '/feed.xml + /feed.json' : `/${lang}/feed.xml + /${lang}/feed.json`}`)
}

console.log(
  `Done! Generated SEO pages for ${LANGUAGES.length} languages` +
    ` + ${blogArticles.length} blog article variants` +
    ` across ${new Set(blogArticles.map((a) => a.canonicalSlug)).size} unique articles.`,
)
