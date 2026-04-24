# CasaTab

## Purpose
CasaTab tracks everything you spend buying a house: down payment, notary, taxes, renovations, furniture, etc. Plus mortgage tracking. This is NOT a monthly budget app — it's specifically for the house purchase.

## Stack
React 18 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (hand-rolled in src/components/ui/), Recharts, React Router v7, React Hook Form + Zod, date-fns, lucide-react, Firebase (Auth + Firestore + Storage + Hosting).

## Architecture
- **Multi-user households**: users create a house, invite others via shareable link. All members share expenses.
- **Firestore structure**: `houses/{houseId}/expenses`, `houses/{houseId}/members/{uid}`, `houses/{houseId}/meta/mortgage`, `users/{uid}` (profile), `invites/{inviteId}`
- **Repository pattern**: `src/data/repository.ts` (interface) → `src/data/firestore-repository.ts` (implementation, takes `houseId`)
- **Contexts**: `AuthContext` → `HouseholdContext` → `ExpenseContext` + `MortgageContext`
- **Mortgage**: separate feature with its own page, amortization calculator, rate periods, extra repayments
- **Attachments**: blobs in Firebase Storage (`houses/{houseId}/attachments/{id}/{filename}`)
- **Payers are dynamic**: `Expense.payer` is a uid string, resolved via `HouseholdContext.getMemberName()`
- **Amounts stored as integer cents** (1500 = €15.00)
- **No "recurring" or "ongoing" concept** — every expense is a house-buying cost, logged when paid. Mortgage is tracked separately.

## Categories
down_payment, notary, taxes, financial_advisor, renovations, furniture, moving, home_inspection, insurance_setup, fees_commissions, other

## Pages
- Dashboard: total house cost hero card, category bar chart, timeline, mortgage summary, person split
- Mortgage: config, progress, amortization schedule/chart, rate periods, extra repayments
- Expenses: CRUD list with filters, sort, attachments
- Summary: print-friendly report with category table, monthly table, per-person breakdown
- Settings: profile, household, invite links

## Firebase
- Project ID: `house-expenses-tracker-812cf`
- Config: `.env` (gitignored), template: `.env.example`
- Rules: `firestore.rules` (membership-based), `storage.rules`
- Deploy: `npm run build && firebase deploy`

## Analytics & infrastructure
- **Analytics**: self-hosted Umami on Vercel + Neon Postgres. Cookieless, no consent banner, **never fires inside `/app/*`** — enforced by `isAppRoute()` in `src/lib/analytics.ts`. Tracker loads from `VITE_UMAMI_HOST` with `VITE_UMAMI_WEBSITE_ID` (both gitignored in `.env`, empty = no-op in dev).
- **Event instrumentation** (public routes only): `page_view`, `cta_click`, `language_switch`, `faq_expand`, `signup_start`, `login_start`, `sign_up`, `login`, `invite_landed`.
- **SEO**: Google Search Console verified via meta tag in `index.html` (content value is public, not secret).
- **Full operational runbook**: `docs/INFRA.md` — deploy procedures, env var reference, secret rotation, `analytics.casatab.com` optional subdomain setup, troubleshooting, architecture decisions.

## i18n & SEO
- **6 languages**: en, es, fr, de, nl, pt — locale files in `src/locales/*.json`
- **Landing page**: pre-rendered in all 6 languages for SEO (`/`, `/es/`, `/fr/`, `/de/`, `/nl/`, `/pt/`)
- **Build pipeline**: `tsc → vite build → scripts/generate-hero-variants.mjs → scripts/generate-seo-pages.mjs → scripts/validate-seo-pages.mjs` — the SEO script generates pre-rendered HTML per language with translated meta tags, hreflang, JSON-LD, sitemap, RSS + JSON feeds, and full page content
- **React Router**: has explicit routes for `/es`, `/fr`, `/de`, `/nl`, `/pt` in App.tsx so the catch-all doesn't redirect language pages
- **Language detection**: i18next checks `localStorage` first, then `navigator`. Language pages set `localStorage('i18nextLng')` via inline script before React loads
- **SEO meta descriptions & keywords**: hand-crafted per language in `scripts/generate-seo-pages.mjs` (separate from UI copy for search optimization)
- **When changing locale copy**: rebuild to regenerate SEO pages. Landing page content in `landing.*` keys is duplicated as pre-rendered HTML by the build script — if the landing page structure changes significantly, update the `prerenderedContent()` function in the script

## Blog
- **Content**: `src/content/blog/posts/{canonicalSlug}/{lang}.md` — one folder per article, 6 localized files (en/es/fr/de/nl/pt) with YAML frontmatter + markdown body.
- **Slug convention**: `slug` is **localized per language** for native-market SEO (e.g. Spanish `coste-real-de-comprar-casa`). `canonicalSlug` is **identical across all 6 files** and is the language-agnostic ID used by `resolveAlternateUrls()` + hreflang.
- **Runtime**: `src/lib/blog.ts` uses a Vite plugin (`vite-plugin-blog-articles.ts`) to pre-render markdown at build time — `marked` and `isomorphic-dompurify` do NOT ship to the browser. Metadata is eager; per-article body is lazy-loaded via code-split chunks.
- **SSG**: every article gets pre-rendered HTML at `dist/blog/{slug}/index.html` (and `/{lang}/blog/{slug}/index.html`) with Article JSON-LD, BreadcrumbList, per-article OG/Twitter tags, hreflang, and feed-discovery links. Sitemap + RSS + JSON Feed are all auto-generated per language.
- **Creating a new article**: run `/new-article` (or `/new-article <topic hint>`) — the slash command at `.claude/commands/new-article.md` executes the full workflow (topic selection, SERP originality check, PAA capture, EN draft, 5 localizations, hero-image prompt).
- **Hero images**: realistic editorial photography (not flat-vector). Two paths:
  - **With Gemini API key** (`GEMINI_API_KEY` in `.env`): `/new-article` calls Gemini 3 Pro Image directly, saves the raw PNG to `public/blog/`, auto-processes into 1600×900 WebP + 800w/1200w variants, and adds `heroImage` + `heroImageAlt` to all 6 frontmatter files. End-to-end, no manual steps. Watermark-free (API outputs carry only invisible SynthID).
  - **Without key**: Claude prints the prompts, you generate in gemini.google.com, drop the raw export into `public/blog/<canonicalSlug>-hero.<ext>`, run `npm run process-heroes`, and add `heroImage` + `heroImageAlt` to frontmatter yourself.
- The sharp-based processing script (`scripts/generate-hero-variants.mjs`) center-crops to 16:9, resizes to 1600×900, encodes as WebP q82 (main) / q78 (1200w) / q76 (800w) with `effort=6` + `smartSubsample`. Outputs land in `public/blog/` and are committed. `heroImage` frontmatter must be all-or-nothing across the 6 language files — never mix.
- **Full operator runbook**: `docs/BLOG.md` — frontmatter reference, slug rules, troubleshooting, common tasks (update article, add named author, remove article), anti-patterns.

## Dev
- `npm run dev` — localhost:5173, connects to real Firebase (no SEO pages in dev — those are build-time only)
- `npm run build` — type-checks, bundles, then generates SEO pages to `dist/`

## Tests
- `npm test` — runs all tests (unit + integration). Integration tests auto-start/stop Firebase emulators.
- `npm run test:unit` — unit tests only (fast, no emulators)
- `npm run test:integration` — integration tests only (starts Firebase emulators on ports 5180/5199/5299/5400)
- `npm run test:watch` — watch mode

**Unit tests** (`src/lib/*.test.ts`): mortgage calculations, amortization schedules (French/Italian), rate changes, extra repayments, balance corrections, mixed/variable/fixed configs, country/reference rate logic.

**Integration tests** (`tests/integration/*.test.ts`): Firestore security rules validation (user profiles, houses, members, expenses, invites, reference rates) and multi-user flows (create house → invite → join → shared expenses) running against Firebase emulators.

Prerequisite: Firebase CLI (`firebase`) must be installed for integration tests.

## Quality Standards
Always prioritize best UI design, best UX, best coding patterns, and maximum user value. Don't settle for "good enough."

## Gotchas
- Firestore rejects `undefined` — `stripUndefined()` in firestore-repository.ts deep-strips before all writes
- TypeScript 6 — no `baseUrl` in tsconfig, only `paths`
- shadcn/ui components are hand-written, live in `src/components/ui/`
- Payer is a uid string — resolve via `getMemberName(uid)` from HouseholdContext
- `calculateMonthlyPayment()` takes termMonths not termYears — always multiply by 12
- Mortgage is NOT an expense category — it has its own feature. Don't duplicate.
- Invite reads need `allow read: if true` in Firestore rules (unauthenticated users)
