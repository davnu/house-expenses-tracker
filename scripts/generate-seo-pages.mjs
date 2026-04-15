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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
function prerenderedContent(t, lang) {
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

function generatePage(lang) {
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
    `<div id="root">${prerenderedContent(t, lang)}\n    </div>`
  )

  // 11. For non-default languages: set localStorage before React loads
  //     so i18next picks the right language on init.
  //     React Router has matching routes for /es, /fr, etc. so no URL normalization needed.
  if (lang !== DEFAULT_LANG) {
    html = html.replace(
      /<script type="module"/,
      `<script>try{localStorage.setItem('i18nextLng','${lang}')}catch(e){}</script>\n    <script type="module"`
    )
  }

  return html
}

/* ═══════════════════ Sitemap generation ═══════════════════ */

function generateSitemap() {
  const hreflangLinks = LANGUAGES.map(
    (lang) =>
      `      <xhtml:link rel="alternate" hreflang="${lang}" href="${langUrl(lang)}" />`
  )
  hreflangLinks.push(
    `      <xhtml:link rel="alternate" hreflang="x-default" href="${DOMAIN}/" />`
  )
  const hreflangBlock = hreflangLinks.join('\n')

  // Landing page in all languages
  const landingUrls = LANGUAGES.map(
    (lang) => `
    <url>
      <loc>${langUrl(lang)}</loc>
      <changefreq>weekly</changefreq>
      <priority>1.0</priority>
${hreflangBlock}
    </url>`
  ).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${landingUrls}

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

for (const lang of LANGUAGES) {
  const html = generatePage(lang)

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

// Overwrite sitemap with multilingual version
writeFileSync(join(DIST, 'sitemap.xml'), generateSitemap(), 'utf-8')
console.log('  ✓ /sitemap.xml (multilingual)')

console.log('Done! Generated SEO pages for', LANGUAGES.length, 'languages.')
