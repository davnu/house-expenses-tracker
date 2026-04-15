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

## i18n & SEO
- **6 languages**: en, es, fr, de, nl, pt — locale files in `src/locales/*.json`
- **Landing page**: pre-rendered in all 6 languages for SEO (`/`, `/es/`, `/fr/`, `/de/`, `/nl/`, `/pt/`)
- **Build pipeline**: `tsc → vite build → scripts/generate-seo-pages.mjs` — the SEO script generates pre-rendered HTML per language with translated meta tags, hreflang, JSON-LD, and full page content
- **React Router**: has explicit routes for `/es`, `/fr`, `/de`, `/nl`, `/pt` in App.tsx so the catch-all doesn't redirect language pages
- **Language detection**: i18next checks `localStorage` first, then `navigator`. Language pages set `localStorage('i18nextLng')` via inline script before React loads
- **SEO meta descriptions & keywords**: hand-crafted per language in `scripts/generate-seo-pages.mjs` (separate from UI copy for search optimization)
- **When changing locale copy**: rebuild to regenerate SEO pages. Landing page content in `landing.*` keys is duplicated as pre-rendered HTML by the build script — if the landing page structure changes significantly, update the `prerenderedContent()` function in the script

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
