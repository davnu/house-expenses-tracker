# CasaTab Blog Runbook

_Last updated: 2026-04-23_

The operational reference for the CasaTab blog: how articles are structured,
how to write a new one, how the build pipeline renders them, and how to
recover when something breaks.

---

## One-sentence elevator

Articles are markdown files (one folder per article, 6 localized `.md` files
inside) that the build pipeline compiles into pre-rendered HTML pages,
per-language RSS/JSON feeds, a multilingual sitemap, and code-split React
chunks — all indexed by Googlebot without needing JavaScript to execute.

---

## Quick start: creating a new article

Four steps, ~30 min end-to-end (most of which is waiting on Claude).

### 1. Run the slash command

In the Claude Code prompt:

```
/new-article
```

or with a topic hint:

```
/new-article spain mortgage refinancing 2026
```

Claude executes the workflow defined in `.claude/commands/new-article.md`:

- Reads every existing article and the blog schema
- If you didn't supply a topic hint: proposes 3 distinct ideas (evergreen
  or trending) with working titles, keyword clusters, and "aha moments",
  then **stops and waits for you to pick one** before writing anything.
- If you did supply a topic hint (`/new-article spain mortgage refinancing 2026`):
  skips the brainstorm, confirms the angle in 2–3 sentences, and proceeds
  straight to writing.
- SERP-checks the chosen angle against the top 3 Google results
- Captures 3–5 People Also Ask questions and plans 2+ direct answers
- Writes the English article under `src/content/blog/posts/<slug>/en.md`
- Re-authors (not translates) into 5 other languages with country-specific
  sources, vocabulary, and examples
- Verifies `npm run test:unit -- blog` passes
- Outputs two Gemini 3 Pro Image prompts for the hero (realistic editorial
  photography)

### 2. Review the drafts

- Read the English draft end-to-end.
- Spot-check at least one localization for native-speaker feel.
- Fact-check any load-bearing number against the sources log Claude prints.
- Check the frontmatter craft (title ≤65 chars, description ≤160 chars,
  slug localized per language, canonicalSlug identical in all 6 files).

### 3. Generate the hero image

**Automated path (recommended):** if `GEMINI_API_KEY` is set in `.env`,
`/new-article` generates the hero via the Gemini 3 Pro Image API
automatically — writing it to `public/blog/`, processing variants, and
adding `heroImage` + `heroImageAlt` to all 6 frontmatter files. You do
nothing. See "Setting up the Gemini API key" below if the key isn't set
yet.

**Manual path (if no API key):** Claude prints two image prompts
(primary + fallback). Open Gemini (gemini.google.com or AI Studio) with
the primary prompt. Optionally upload 1–3 reference photos from FT /
Monocle / Kinfolk / Cereal — Nano Banana Pro accepts up to 14 references
and responds more reliably to image references than to text alone.

Export whatever size/format Gemini gives you (typically PNG at 2K/4K).
Don't crop or convert manually. Save to:

```
public/blog/<canonicalSlug>-hero.<png|jpg|webp>
```

Then run:

```
npm run process-heroes
```

The script (`scripts/generate-hero-variants.mjs`) center-crops to 16:9,
resizes to 1600×900, re-encodes as WebP q82, writes the canonical
`{slug}-hero.webp`, and generates responsive variants `{slug}-hero-800.webp`
+ `{slug}-hero-1200.webp` in the same directory. Non-WebP sources are
deleted after successful processing (one canonical file per hero).

The script is idempotent — already-processed heroes are skipped. If you
re-export from Gemini with a new version, just replace the file and re-run;
stale variants are invalidated automatically.

Finally, add these two lines to each of the 6 language frontmatter blocks
(all-or-nothing — never mix half-heroed languages):

```yaml
heroImage: "/blog/<canonicalSlug>-hero.webp"
heroImageAlt: "One-sentence description for accessibility + image SEO."
```

**Tip — if your hero has an off-center subject**, ask Gemini to regenerate
at 16:9 natively (the `/new-article` prompt already requests 16:9). The
script center-crops, so a portrait or extreme landscape export will clip
at top/bottom or left/right.

### Setting up the Gemini API key (one-time)

Why the API vs the consumer app at gemini.google.com:

- **No visible watermark.** Consumer-app exports carry a corner sparkle
  logo. API outputs carry only the invisible SynthID provenance signal —
  imperceptible to readers, doesn't affect how the image looks.
- **Reproducibility.** Same prompt → consistent style. Consumer app's
  aesthetic drifts between sessions.
- **Automation.** `/new-article` can run end-to-end without you opening
  a browser.

Steps:

1. Get a key: <https://aistudio.google.com/apikey>. Gemini 3 Pro Image
   needs a billing-enabled project (<$1/month for typical blog cadence —
   ~$0.035 per 2K image).
2. Open `.env` (already gitignored) and add:
   ```
   GEMINI_API_KEY=<paste your key>
   ```
3. That's it. Next `/new-article` run picks it up.

The key never enters the client bundle (no `VITE_` prefix — Vite won't
expose it to the browser) and only ever gets read by `scripts/generate-hero-image.mjs`,
which calls Google's SDK (`@google/genai`).

### Ad-hoc hero generation for existing articles

To replace the legacy SVG hero on `true-cost-of-buying-a-house` with a
realistic photo, or to add a hero to any article after the fact:

```bash
# Write the prompt to a temp file — CLI argv breaks on em-dashes + quotes.
cat > /tmp/hero.txt <<'EOF'
Editorial photograph, magazine-style — <your prompt here>
EOF

npm run generate-hero -- \
  --slug true-cost-of-buying-a-house-hero \
  --prompt-file /tmp/hero.txt \
  --update-frontmatter \
  --canonical-slug true-cost-of-buying-a-house \
  --image-alt "One-sentence description for accessibility."
```

This single command generates the image, processes it into a canonical
WebP + size variants, and atomically adds `heroImage` + `heroImageAlt` to
all 6 language frontmatter files.

### A/B comparison mode

Generate the primary AND fallback prompts, then interactively pick the
one you prefer. Costs ~$0.07 (double). Requires an interactive terminal
— use your own shell, not Claude Code's Bash tool.

```bash
npm run generate-hero -- \
  --slug foo-hero \
  --prompt-file /tmp/primary.txt \
  --fallback-prompt-file /tmp/fallback.txt \
  --with-fallback \
  --update-frontmatter \
  --canonical-slug foo \
  --image-alt "..."
```

Both images get saved with `.primary` / `.fallback` suffixes for you to
preview. You're prompted to pick `p` or `f`; the winner is renamed to
the canonical path and the loser is deleted.

### Cost ledger

Every generation appends a JSONL entry to `.hero-generations.log`
(gitignored via the `*.log` rule) with slug, model, mode (single / A/B),
duration, raw bytes, and estimated cost. Handy for tracking spend and
debugging if an article is generated multiple times during iteration.

### Error recovery

The script exits non-zero with specific diagnostics:

- **403** → key invalid, billing not enabled, or the project lacks access
  to Gemini 3 Pro Image. Check AI Studio.
- **429 / 503** → transient; the script already retries 3× with exponential
  backoff. If it still fails, wait a minute and retry.
- **400 with `imageConfig`** → model rename. Override with
  `GEMINI_IMAGE_MODEL` in `.env`.
- **Prompt blocked** → safety filter. Usually a negative-constraint clause
  triggers a content policy; drop or rephrase it.

If `generate-hero-image.mjs` succeeds but the variant-processing step
(`generate-hero-variants.mjs`) fails, the raw API output stays at
`public/blog/<slug>.png` — run `npm run process-heroes` to retry
processing without re-calling the API.

### 4. Build and deploy

```
npm run build
firebase deploy --only hosting
```

`npm run build` runs the full pipeline:
1. TypeScript check
2. Vite bundle (code-splits each article body into its own chunk)
3. Hero variant generation (800w + 1200w WebP siblings via sharp)
4. SEO page generation (pre-rendered HTML, JSON-LD, OG/Twitter, sitemap, feeds)
5. SEO page validation (800+ invariants — fails the build if anything regressed)

---

## Architecture

```
  src/content/blog/posts/
    └── <canonicalSlug>/
          ├── en.md    ┐
          ├── es.md    │
          ├── fr.md    ├── one article, 6 localized files
          ├── de.md    │
          ├── nl.md    │
          └── pt.md    ┘

  public/blog/
    ├── <canonicalSlug>-hero.webp      ← generated in Gemini, you commit this
    ├── <canonicalSlug>-hero-800.webp  ← generated at build time by sharp
    └── <canonicalSlug>-hero-1200.webp ← generated at build time by sharp

  dist/ (produced by npm run build)
    ├── blog/<slug>/index.html          ← pre-rendered EN articles
    ├── <lang>/blog/<slug>/index.html   ← pre-rendered non-EN articles
    ├── sitemap.xml                     ← includes every article URL
    ├── feed.xml     + feed.json        ← English RSS + JSON Feed
    └── <lang>/feed.xml + feed.json     ← per-language feeds
```

### Client runtime

- `src/lib/blog.ts` imports every article via `import.meta.glob` with two
  queries: `?meta` eager (metadata only, in the main bundle) and `?body`
  lazy (rendered HTML, code-split per article).
- The Vite plugin at `vite-plugin-blog-articles.ts` transforms each `.md`
  file into precomputed JS modules at build time. `marked` and
  `isomorphic-dompurify` run in the plugin, not in the browser — they're
  absent from the client bundle.
- `src/pages/BlogArticlePage.tsx` renders the header/hero/meta immediately
  from sync metadata; `useEffect` + `loadArticleBody()` streams the body
  chunk in. On pre-rendered pages the body DOM is already present from
  SSG, so hydration is visually invisible.
- Click delegation on the article container fires `cta_click` analytics
  with `cta_location: 'blog_article_inline'` for inline CasaTab links.

### SEO build pipeline

`scripts/generate-seo-pages.mjs` runs after `vite build` and:

- Parses every `.md` file independently (using `gray-matter` + `marked` +
  `isomorphic-dompurify` in Node — the build script doesn't share code
  with the client, intentionally).
- Emits pre-rendered HTML for every article URL in every language.
- Injects Article JSON-LD (with `dateModified`, `wordCount`,
  `mainEntityOfPage`, author as Person when frontmatter names one else as
  Organization) and BreadcrumbList JSON-LD.
- Mirrors `og:image` → `twitter:image` per article.
- Generates `sitemap.xml` with hreflang, x-default, `lastmod`.
- Generates RSS 2.0 (`feed.xml`) and JSON Feed 1.1 (`feed.json`) per language.
- Injects `<link rel="alternate" type="application/rss+xml">` and
  JSON Feed discovery links into every blog page's `<head>`.

`scripts/validate-seo-pages.mjs` runs after generation and asserts ~800
invariants. The build fails hard if any of them regress.

---

## Frontmatter reference

Defined in the Zod schema at `src/lib/blog.ts`.

| Field | Required | Rules |
|---|---|---|
| `title` | ✅ | 55–65 chars. Primary keyword near the start. This is `<title>` + `<h1>`. |
| `description` | ✅ | **150–160 chars, hard ceiling** (Google truncates). Primary keyword in the first 65 chars. Ends with a soft hook, no sales language. |
| `excerpt` | ✅ | 1–2 conversational sentences about what the reader *learns*. Shown on the blog index + article header. |
| `slug` | ✅ | 3–5 words, kebab-case, **localized per language**. Primary keyword in slug. |
| `canonicalSlug` | ✅ | **Identical across all 6 language files.** Typically the English slug. Used by `resolveAlternateUrls()`. |
| `publishedAt` | ✅ | `YYYY-MM-DD`, today on first publish. |
| `updatedAt` | optional | `YYYY-MM-DD`. Bump whenever a cited rate/regulation/program changes — Google rewards genuine freshness. |
| `category` | ✅ | One of: `costs`, `mortgage`, `renovation`, `legal`, `moving`. |
| `heroImage` | optional | Absolute path from `/`. Omit if no hero yet — a broken-image icon is worse than no hero. **All-or-nothing across all 6 files.** |
| `heroImageAlt` | optional | One-sentence description. Used for a11y and image SEO. Omit only on truly decorative heroes. |
| `author` | optional | Named byline. If omitted, `DEFAULT_AUTHOR` ("CasaTab Editorial") is used and JSON-LD emits Organization. When present, JSON-LD emits `Person` — the stronger E-E-A-T signal. |

---

## Slug + cross-link convention (important)

**Slugs are localized per language. `canonicalSlug` is the shared ID.**

Example from the existing corpus:

```yaml
# src/content/blog/posts/true-cost-of-buying-a-house/en.md
slug: "true-cost-of-buying-a-house"
canonicalSlug: "true-cost-of-buying-a-house"

# src/content/blog/posts/true-cost-of-buying-a-house/es.md
slug: "coste-real-de-comprar-casa"
canonicalSlug: "true-cost-of-buying-a-house"

# src/content/blog/posts/true-cost-of-buying-a-house/de.md
slug: "wahre-kosten-hauskauf"
canonicalSlug: "true-cost-of-buying-a-house"
```

This gives each language a native-looking URL (ranks better in each market)
while `resolveAlternateUrls()` + hreflang wire them together for Google.

**When linking from one article to another in markdown**, resolve the
target's localized slug in that language:

```markdown
# In es.md:
[desglose completo](/es/blog/coste-real-de-comprar-casa/)

# In de.md:
[vollständige Aufstellung](/de/blog/wahre-kosten-hauskauf/)
```

Not `/es/blog/true-cost-of-buying-a-house/` — that slug doesn't exist in
Spanish, so the link 404s.

Parity tests in `src/lib/blog.test.ts` catch both (a) a missing language
variant for any `canonicalSlug` and (b) an article whose slugs aren't
actually localized (every language sharing the English slug). They run on
every `npm run test:unit`.

---

## Hero image workflow

### Style direction

**Realistic editorial photography.** Not flat-vector illustration. Think FT,
Monocle, Kinfolk, The Atlantic business section.

The full prompt formula and guidance live in `.claude/commands/new-article.md`
under Step 4. Key rules:

- Lead with `Editorial photograph, magazine-style`.
- Use the slot order: Subject → Composition → Action/mood → Setting →
  Camera & lens → Lighting → Color grading → Aspect ratio → Negative constraints.
- Name the camera/lens/film literally ("Hasselblad medium format, 80mm,
  f/4, Portra 400 tones") — biggest single lever on quality.
- Negative constraints always include: no text, no logos, no watermarks,
  no human faces, no stock-photo poses, no HDR, no lens flares.

### File placement

Everything lives in `public/blog/` and is committed (variants included —
each is ~20–50 KB WebP, trivial repo overhead):

- **Source**: drop the raw Gemini export as `<slug>-hero.<png|jpg|webp>` at
  any size. `npm run process-heroes` (or `npm run build`) center-crops to
  16:9, resizes to 1600×900, re-encodes as WebP q85, and writes the
  canonical `{slug}-hero.webp`. Non-WebP sources are deleted after
  successful processing so the tree stays clean.
- **Variants** (800w, 1200w): same script emits `{slug}-hero-800.webp` and
  `{slug}-hero-1200.webp` alongside the canonical. Stale variants are
  invalidated automatically when you re-export the hero.

The pipeline runs `generate-hero-variants.mjs` *before* `vite build`, so
the processed heroes + variants are in `public/blog/` when Vite copies them
into `dist/`. Same files serve in `npm run dev` and production — no
mismatch.

### SVG vs WebP

The legacy hero (`/blog/true-cost-hero.svg`) is flat-vector. New heroes
should be WebP realistic-photo. Mixed is fine in the interim — plan to
regenerate the SVG eventually so the blog is visually consistent.

---

## Testing + validation

| Command | What it guards |
|---|---|
| `npm run test:unit` | All unit tests. Blog tests cover: every language has content, every `canonicalSlug` has all 6 languages, slugs are localized per language, reading-time math, heading slugification and dedup, URL helpers. |
| `npm run test:unit -- blog` | Only blog tests — fast. |
| `npm run build` | Type-check + Vite bundle + hero variants + SEO pages + ~800 SEO invariants via `scripts/validate-seo-pages.mjs`. A single invariant failure fails the build. |

Never deploy with a failing build. The validator catches real regressions
(missing canonical, broken hreflang, empty `<title>`, stale meta).

---

## Common tasks

### Update an existing article

1. Edit the relevant `.md` files.
2. Bump `updatedAt: "YYYY-MM-DD"` in every edited language file.
3. `npm run build` — regenerates SEO pages + sitemap lastmod.
4. Deploy.

Freshness signals matter for finance/real-estate ranking — an article last
`updatedAt` 18 months ago ranks worse than one updated quarterly.

### Switch from "CasaTab Editorial" to a named author

1. Add `author: "Real Name"` to every language's frontmatter.
2. Build + deploy.
3. JSON-LD now emits `Person`-typed author; the byline updates everywhere
   (blog index, article header, pre-rendered HTML, RSS `<dc:creator>`,
   JSON Feed `authors[]`).

If you want a reusable "team" byline (e.g. "The CasaTab Team"), just set
`DEFAULT_AUTHOR` in `src/lib/blog.ts` and mirror the same change in
`scripts/generate-seo-pages.mjs` (look for `'CasaTab Editorial'`).

### Remove an article

1. Delete the article's folder under `src/content/blog/posts/`.
2. `npm run build` — sitemap, feeds, and pre-rendered HTML all regenerate
   without it.
3. Deploy.

Optionally: add a 301 redirect in `firebase.json` from the old URL to the
closest replacement article. Google preserves ranking equity across 301s.

### Regenerate a hero after exporting a new version from Gemini

Overwrite `public/blog/<slug>-hero.webp` (or drop a fresh PNG/JPG at
`public/blog/<slug>-hero.<ext>`) and run `npm run process-heroes`. The
script detects the size/format mismatch, re-encodes, and invalidates the
stale `-800.webp` / `-1200.webp` variants so they regenerate from the new
main. No manual cleanup needed.

---

## Troubleshooting

### "Failed to parse source for import analysis" on `.md`

The Vite plugin isn't loaded. Check:

- `vite.config.ts` has `blogArticlesPlugin()` in the root `plugins` array.
- The Vitest `unit` project config has `plugins: [blogArticlesPlugin()]`
  too — Vitest projects don't inherit root plugins automatically.

### Blog article returns 404 at `/es/blog/foo-slug/`

Most likely causes:

- The `es.md` file's `slug:` doesn't match the URL you typed (check for
  typos in the localized slug).
- `canonicalSlug` mismatches across languages — the parity test in
  `src/lib/blog.test.ts` catches this. Run `npm run test:unit -- blog`.
- You added a new article but didn't rebuild — pre-rendered HTML for that
  route doesn't exist in `dist/`. React client-side navigation still works,
  but direct visits and Googlebot see a 404. Run `npm run build`.

### Broken hero image on a published article

Either the `.webp` file isn't in `public/blog/`, or the `heroImage` path
in frontmatter doesn't match the file name. Check:

```bash
ls public/blog/<canonicalSlug>-hero.webp
grep heroImage src/content/blog/posts/<canonicalSlug>/*.md
```

If only some languages have `heroImage` set, the inconsistency is itself
the bug — set it in all 6 or none.

### Sitemap / RSS doesn't include the new article

The build failed (or you didn't run it). `scripts/generate-seo-pages.mjs`
is the single source of truth for both — if it ran, both updated. Check
the last successful build's console output for the line
`Done! Generated SEO pages for 6 languages + N blog article variants`.

### Claude writes an article but the slugs are all English

The `/new-article` command explicitly requires localized slugs per
language with an identical `canonicalSlug`. If this regresses, open
`.claude/commands/new-article.md` and check the "Frontmatter per language"
section is still intact under Step 3. A parity test
(`src/lib/blog.test.ts`, "uses a localized slug per language") will fail
CI if a new article ships with non-localized slugs.

---

## Anti-patterns

- **Fabricated statistics.** "30–50% of the overrun comes from scope creep"
  is a fabrication dressed as data if the cited source doesn't actually
  publish that breakdown. The command prompt bans this explicitly; the
  Quality Bar's "no invented percentage shares" check specifically audits
  for it. Cut the number or find a real source.
- **1:1 translation instead of re-authoring.** Each localized article must
  use the native country's tax rates, regulations, vocabulary, and idioms.
  A Dutch article that reads like translated American English is worse
  than an honest machine translation — Google's language-quality signals
  catch the stilted phrasing.
- **Identical slugs across languages.** Ranks worse in every non-English
  market, signals translation-farm content to Google. Parity tests block
  this at CI.
- **Identical structure to the top SERP results.** Google's March 2026
  update aggressively demotes reheated content. The command requires a
  SERP originality check before writing; follow it.
- **Shipping a `heroImage` path that doesn't exist.** Readers see a broken-
  image icon. Either omit the field across all 6 files, or ensure the
  WebP is in `public/blog/` and committed.
- **Deleting the old flagship article to "start fresh"**. Evergreen pillar
  articles accumulate backlinks and topical authority over time. Polish
  and update them; don't replace them.

---

## File index (where to look when you need to change something)

| What | File |
|---|---|
| Frontmatter schema | `src/lib/blog.ts` (Zod schema, Article + ArticleBody types) |
| Article loader runtime | `src/lib/blog.ts` (metadata eager + body lazy) |
| Markdown → HTML at build | `vite-plugin-blog-articles.ts` (Vite plugin) |
| SSG / SEO pages | `scripts/generate-seo-pages.mjs` |
| SEO validation | `scripts/validate-seo-pages.mjs` |
| Hero variant generation | `scripts/generate-hero-variants.mjs` |
| Gemini API image generation | `scripts/generate-hero-image.mjs` (uses `@google/genai` SDK) |
| Atomic frontmatter sync | `scripts/sync-hero-frontmatter.mjs` |
| Article page component | `src/pages/BlogArticlePage.tsx` |
| Article listing | `src/pages/BlogListPage.tsx` |
| Article meta (byline, date, category) | `src/components/blog/ArticleMeta.tsx` |
| Authoring workflow prompt | `.claude/commands/new-article.md` |
| Blog tests | `src/lib/blog.test.ts` |
| Locale parity tests | `src/locales/blog-parity.test.ts` |
