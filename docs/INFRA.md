# CasaTab Infrastructure Runbook

_Last updated: 2026-04-17_

This is the operational reference for every service CasaTab depends on — how it's
wired, how to deploy, how to rotate secrets, and how to recover if something
breaks. Read it when you come back in six months and forget how this all works.

---

## Overview

CasaTab runs across four external services:

```
                    ┌───────────────────────────────────────┐
                    │         casatab.com                   │
                    │   (Firebase Hosting: static site      │
                    │    + /__/auth/* action handler)       │
                    └──────┬────────────────────────────┬───┘
                           │                            │
                  auth / data reads/writes   page_view / event pings
                           │                 (PUBLIC ROUTES ONLY)
                           │                            │
                ┌──────────▼──────────┐    ┌────────────▼──────────┐
                │  Firebase Services  │    │      Umami on         │
                │  - Authentication   │    │      Vercel           │
                │  - Cloud Firestore  │    │   (self-hosted,       │
                │  - Cloud Storage    │    │    cookieless)        │
                └─────────────────────┘    └────────────┬──────────┘
                                                        │
                                               ┌────────▼─────────┐
                                               │  Neon Postgres   │
                                               │  (EU Frankfurt)  │
                                               └──────────────────┘

               ┌─────────────────────────────┐
               │  Google Search Console      │    (read-only: SEO
               │  (verifies casatab.com via  │     keyword + CTR
               │   meta tag in index.html)   │     reports)
               └─────────────────────────────┘
```

**Key architectural property**: analytics fires **only** on public routes
(`/`, `/es/…pt/`, `/login`, `/privacy`, `/invite/:id`). It is physically
prevented from firing inside `/app/*` by the `isAppRoute()` gate in
`src/lib/analytics.ts`. This is the backbone of the "zero tracking inside the
app" promise in the privacy policy and landing hero.

---

## Services

### 1. Firebase (app backend + hosting)

- **Project ID**: `house-expenses-tracker-812cf`
- **Console**: https://console.firebase.google.com/project/house-expenses-tracker-812cf
- **What it provides**:
  - Hosting — serves `casatab.com` from `dist/`
  - Authentication — email/password + Google SSO
  - Cloud Firestore — all app data (houses, members, expenses, mortgages, etc.)
  - Cloud Storage — file attachments (receipts, contracts)
  - Custom email sender — verification emails from `hello@nualsolutions.com`
- **Deploy**: `npm run build && firebase deploy`
- **Security rules**: `firestore.rules`, `storage.rules` in repo root (deployed automatically)

### 2. Umami (cookieless analytics)

- **Hosted on**: Vercel (free Hobby tier)
- **Vercel project name**: `casatab-umami` (or whatever you named it during deploy)
- **Vercel dashboard**: https://vercel.com/dashboard → select the project
- **Umami dashboard URL**: the project's Vercel preview URL (currently `https://casatab-umami-*.vercel.app`). Stored in CasaTab's `.env` as `VITE_UMAMI_HOST`.
- **Admin login**: `admin` / `<password in your password manager>`
- **Website ID**: stored in CasaTab's `.env` as `VITE_UMAMI_WEBSITE_ID`. Also visible in Umami dashboard → Settings → Websites → CasaTab.
- **Tracked events**:
  - Auto: `page_view` on every public route change
  - Custom: `cta_click` (with `cta_location`, `cta_label`), `language_switch`, `faq_expand`, `signup_start`, `login_start`, `sign_up`, `login`, `invite_landed`
- **What is collected** (per Umami's cookieless mode): visited URL, referrer, country, device type, daily hash (not IP, not identity, not cross-site, not persistent)

### 3. Neon (Postgres for Umami)

- **Project name**: `casatab-analytics`
- **Dashboard**: https://console.neon.tech → select project
- **Region**: Europe (Frankfurt)
- **Connection string**: stored in Vercel project env var `DATABASE_URL`. Same value is the "Connection string" on the Neon project dashboard.
- **Backups**: Neon's free tier includes 7 days of point-in-time recovery (PITR) — see Neon console → Branches if you ever need to roll back.

### 4. Google Search Console (SEO)

- **Property type**: URL prefix (`https://casatab.com`)
- **Console**: https://search.google.com/search-console
- **Verification**: HTML meta tag in `index.html` line ~41
  - Content value: `Js5G9ZSxawlXRV8vK0pVgkxIVa65dviPZyoGcNs4ACE`
  - This value is not a secret — it's a public verification token
- **What it shows**: organic Google Search queries, impressions, clicks, CTR, rank, which pages are indexed, Core Web Vitals

---

## Environment variables

### CasaTab build-time (in `.env`, baked into the JS bundle by Vite at `npm run build`)

| Name | Value source | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web app | Firebase SDK init |
| `VITE_FIREBASE_AUTH_DOMAIN` | same | Firebase Auth |
| `VITE_FIREBASE_PROJECT_ID` | same | Firebase project routing |
| `VITE_FIREBASE_STORAGE_BUCKET` | same | Firebase Storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same | (FCM, unused) |
| `VITE_FIREBASE_APP_ID` | same | Firebase app identifier |
| `VITE_UMAMI_HOST` | Umami's Vercel URL | Where to load the tracker script from |
| `VITE_UMAMI_WEBSITE_ID` | Umami dashboard → Settings → Websites → CasaTab | Identifies this site in Umami |
| `VITE_GSC_VERIFICATION` | (reserved, currently unused — GSC tag is hard-coded in index.html) | — |

> `.env` is gitignored. `.env.example` in repo is the template with blank values.

### Umami server-side (in Vercel env, read by Umami at runtime)

Set in Vercel project → Settings → Environment Variables.

| Name | Purpose | Rotation policy |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | Rotate only if Neon credentials are compromised |
| `DATABASE_TYPE` | Must be `postgresql` | Never changes |
| `HASH_SALT` | Secret for daily visitor hash | **Do not rotate** — breaks continuity of returning-visitor counts |
| `APP_SECRET` | Umami admin session token signing | Rotate only if compromised (logs you out) |

---

## Deploy procedures

### Deploy CasaTab

```bash
cd /Users/david/projects/house-expenses
npm run build
firebase deploy
```

`npm run build` runs:
1. `tsc -b` — TypeScript check
2. `vite build` — bundle + minify to `dist/`
3. `node scripts/generate-seo-pages.mjs` — pre-render 6-language HTML
4. `node scripts/validate-seo-pages.mjs` — assert SEO-critical fields present

If `tsc -b` fails on unrelated pre-existing WIP: run `npx vite build && node scripts/generate-seo-pages.mjs && node scripts/validate-seo-pages.mjs` directly and then `firebase deploy`.

### Redeploy Umami (rarely needed)

Umami auto-deploys on every push to its forked GitHub repo's main branch. To manually trigger:

1. Vercel dashboard → `casatab-umami` project → Deployments tab
2. Click `...` on the latest deployment → **Redeploy**
3. Wait ~1 minute

To update to a newer Umami version:

1. On GitHub, go to the forked Umami repo
2. Sync with upstream (`umami-software/umami` main branch)
3. Vercel detects the push and auto-deploys
4. After deploy, log in to Umami → if database migrations are needed, Umami applies them on startup

### Deploy secret changes

If you change anything in `.env`:

```bash
npm run build && firebase deploy
```

If you change anything in Vercel env vars (Umami side): in Vercel → Deployments → Redeploy.

---

## Dashboards & where credentials live

Your day-to-day access points. Log in with your password manager.

| Dashboard | URL | Purpose | What's stored where |
|---|---|---|---|
| Firebase Console | https://console.firebase.google.com/project/house-expenses-tracker-812cf | Auth users, Firestore data, Storage, rules, Hosting | Google account (davnual@gmail.com) |
| Vercel | https://vercel.com/dashboard | Umami deployment status, env vars | GitHub login |
| Umami (app) | see `VITE_UMAMI_HOST` in `.env` | Analytics dashboard | admin / password manager |
| Neon | https://console.neon.tech | Postgres for Umami | Google login |
| Google Search Console | https://search.google.com/search-console | SEO reports | Google account |
| Google Cloud (IAM, for Firebase custom email) | https://console.cloud.google.com | If you ever touch Firebase email settings | Google account |

---

## Optional setup: custom `analytics.casatab.com` subdomain

**Why bother:** cleaner URL in DevTools Network tab + reinforces the
"self-hosted analytics" trust story. Purely cosmetic.

**Prerequisites:** DNS access for `casatab.com`. Check where your DNS is
managed — likely Firebase Hosting (if you're using Firebase's auto-DNS) or
your domain registrar.

**Steps (~10 min + DNS propagation):**

1. **Add the CNAME record** in your DNS provider:
   - Name: `analytics`
   - Type: `CNAME`
   - Value: `cname.vercel-dns.com`
   - TTL: default (3600 is fine)

2. **Register the domain with Vercel**:
   - Vercel → `casatab-umami` project → Settings → Domains
   - Input: `analytics.casatab.com` → Add
   - Vercel will say "Invalid Configuration" for a moment while it verifies DNS
   - Once DNS propagates (~5-15 min), Vercel issues a free SSL cert
   - Status should change to "Valid Configuration"

3. **Update CasaTab's `.env`**:
   ```
   VITE_UMAMI_HOST=https://analytics.casatab.com
   ```

4. **Rebuild and redeploy**:
   ```bash
   npm run build && firebase deploy
   ```

5. **Verify**: open https://casatab.com in incognito, DevTools Network tab, should see the tracker load from `analytics.casatab.com/script.js` instead of the Vercel URL.

6. **Optional hardening**: in Umami dashboard → Settings → Websites → CasaTab → change the Domain field to match `casatab.com` (should already be correct).

---

## Security & secret rotation

### If Umami admin password leaks
1. Log in → profile icon (top right) → Change password
2. Update in password manager
3. No other action needed

### If `APP_SECRET` leaks
1. Generate new: `openssl rand -base64 32`
2. Vercel → project → Settings → Env Vars → edit `APP_SECRET` → save → Redeploy
3. Consequence: all existing Umami admin sessions are invalidated (you'll have to log in again)

### If Neon `DATABASE_URL` leaks
1. Neon dashboard → project → Settings → Reset password (on the main role)
2. Copy new connection string
3. Vercel → project → Settings → Env Vars → update `DATABASE_URL` → Redeploy

### If `HASH_SALT` leaks
Normally: **do not rotate**. Rotating it means visitors who came before the rotation look like new visitors after it (cosmetic discontinuity in visitor-counting reports).

Only rotate if you have specific evidence the hash is being reversed. In that case: rotate and accept the discontinuity.

### If Firebase API keys leak
Firebase API keys are **public by design** (they're in your JS bundle). Your security is enforced by Firestore/Storage rules, not by key secrecy. If someone grabs them, they can't do anything your security rules don't already allow.

No rotation needed unless the security rules have a gap. Review rules in `firestore.rules` + `storage.rules` periodically.

### Full secret rotation checklist (if laptop is lost, etc.)
1. Change Google account password
2. Revoke GitHub personal access tokens
3. Change Neon password (see above)
4. Change Umami admin password (see above)
5. Rotate `APP_SECRET` (see above)
6. Revoke any Firebase service-account keys (Firebase Console → Project Settings → Service accounts)
7. Review Firebase Auth users list for anything unexpected
8. Review Firestore data for anything unexpected

---

## Troubleshooting

### Umami Realtime shows zero visits
- Confirm `VITE_UMAMI_HOST` and `VITE_UMAMI_WEBSITE_ID` are set in `.env` before you ran `npm run build`
- Open casatab.com in incognito → DevTools → Network tab → filter by the Umami URL → you should see `script.js` load. If not, check your Umami instance is actually up (open the URL directly in a new tab — should show the login page).
- If `script.js` loads but no `/api/send` requests fire: double-check the Website ID matches (Umami Settings → Websites → should be the exact UUID in `.env`)

### "Inside /app/* seeing Umami calls"
This should be impossible. If it happens:
1. Open DevTools Console on an `/app/*` page
2. Run `(await import('/src/lib/analytics.ts')).isAppRoute(window.location.pathname)` — should return `true`
3. If it returns `false`: the route prefix changed or there's a routing bug. Check `src/lib/analytics.ts` line ~30 for the constant.

### CasaTab build fails
- Pre-existing `DashboardPage.tsx` WIP error from an incomplete feature — known issue, unrelated to deploy. Use the workaround in the Deploy section above.

### Favicon not showing in Google search results

If `casatab.com` appears in Google results without its icon:

1. **Check `/favicon.ico` is reachable.** Open `https://casatab.com/favicon.ico` in a fresh incognito tab. It must return a binary ICO, not a 404. If it 404s, `dist/` is missing the file — run `node scripts/generate-favicon.mjs` and redeploy. The post-build validator now asserts this; CI builds fail if the file is missing.
2. **Check the HTML link chain.** View-source on `casatab.com`. Must contain `<link rel="icon" href="/favicon.ico" ...>`. Google's crawler respects the declaration *and* also hits `/favicon.ico` by convention — both need to work.
3. **Force a re-crawl.** In Google Search Console → URL Inspection → enter `https://casatab.com/`. Click *Request Indexing*. Google re-pulls the favicon within days (not always immediate — the favicon pipeline is separate from the main index).
4. **If the source logo changes.** Re-run `node scripts/generate-favicon.mjs` (macOS, uses `sips`). Commit the regenerated `public/favicon.ico` + `public/favicon-48.png`. Rebuild + redeploy.

**Why this broke silently in the first place:** the generation script existed but its outputs weren't committed, and `index.html` declared only the SVG. Google supports SVG favicons but their SERP pipeline is conservative about them — a missing `/favicon.ico` means they refuse to render anything. The fix added `.ico` + a 48×48 PNG (their preferred size), plus locked both into the SEO validator so the regression can't silently return.

### Firebase email verifications going to spam
This is handled in `docs/email-deliverability.md` (if created separately) or:
- The template and sender are set up. Gmail filters are learning over time. Ask early users to mark "Not spam".
- To improve further, move sender from `hello@nualsolutions.com` to `hello@casatab.com` (requires setting up email hosting for casatab.com domain).

### Vercel build fails for Umami
- Most common: malformed `DATABASE_URL` (missing `?sslmode=require`). Edit in Vercel env vars, redeploy.
- Second most common: Umami version bumps that require DB migrations — check the deploy logs for migration errors. If so, roll back to the previous deployment from the Vercel Deployments tab.

---

## Architecture decisions (why we built it this way)

### Why Umami (not GA4, not Plausible)
- **Not GA4**: would require a cookie consent banner under GDPR. The banner itself is a trust-negative for a financial app. Our audience (EU-centric, privacy-conscious) actively dislikes it. Also, GA4 sends visit data to Google — reinforces the "you're the product" narrative.
- **Not Plausible Cloud**: €9/mo, and data still lives on someone else's server.
- **Not Plausible self-hosted**: heavy stack (ClickHouse + Elixir) — harder to keep running for one person.
- **Chosen — Umami self-hosted**: MIT-licensed, Node + Postgres only, 2 KB tracker script, cookieless, 100% free at our scale, data stays on infra we control.

### Why self-hosted (not Umami Cloud)
- Self-hosted = we own the data. No third party ever sees visits.
- The privacy policy says we host our own analytics. That has to remain true to keep the trust claim.
- Umami Cloud's free tier only retains 6 months of data. Self-hosted on Neon is unlimited.

### Why `/app/*` never tracks
- Users there have just trusted us with the biggest financial decision of their lives (a house purchase). They log expenses, mortgage details, upload legal documents. Any analytics inside that surface is a trust betrayal waiting to happen.
- Enforced at the code level (`isAppRoute` guard in `src/lib/analytics.ts`) so no event can fire from an app route even by accident.
- This is the strongest product-marketing claim on the landing page: "Zero tracking inside the app."

### Why no cookie banner
- Umami cookieless mode sets zero cookies, stores zero persistent identifiers. Under GDPR's ePrivacy Directive, cookie consent is only required when something is stored on the user's device. Since nothing is stored, no banner is required.
- No banner = cleaner UX, stronger trust signal, better first-impression conversion.

### Why the FAQ + trust cards use specific claims (AES-256, TLS, ISO 27001, SOC 2)
- Concrete, verifiable claims beat "enterprise-grade" buzzwords. They're credible to technical users and impressive-sounding to non-technical ones.
- ISO 27001 and SOC 2 apply to the **hosting infrastructure** (Google Cloud), not to CasaTab-the-company. The copy is carefully worded ("hosted on X-certified cloud infrastructure") to avoid overclaiming.

---

## Change log

_Keep dated entries when you change anything in this runbook or the infra itself._

- **2026-04-17**: Initial runbook written. Infrastructure live:
  - Firebase Hosting on casatab.com
  - Custom email sender (`hello@nualsolutions.com`) configured in Firebase Auth
  - Umami deployed on Vercel + Neon Postgres
  - Google Search Console verified via meta tag (content `Js5G9Z...`)
  - 6-language locales, privacy page with security hero, PrivacyShield badge on landing
  - All analytics route-gated to public surface only
- _(add future changes here)_
