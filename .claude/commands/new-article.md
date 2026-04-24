---
description: Generate a new SEO-oriented CasaTab blog article in all 6 languages with a realistic editorial photo prompt for Gemini 3 Pro Image
argument-hint: [optional topic hint]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
model: opus
---

You are writing a new SEO blog article for **CasaTab** (casatab.com) — a web app that tracks every cost of buying a house (down payment, notary, taxes, renovations, furniture, mortgage, etc.) across multi-user households in 6 languages (en, es, fr, de, nl, pt). Audience: first-time or mid-process home buyers in EU + US/Canada/UK/Australia.

TOPIC HINT (optional — may be empty): $ARGUMENTS

## Context: what "good" means in 2026

Google's March 2026 core update finished rolling out on 2026-04-08 and is actively downgrading unoriginal, thinly-sourced AI content. The articles that still rank and convert satisfy E-E-A-T — **Experience, Expertise, Authoritativeness, Trustworthiness** — with Experience and Trust being the biggest differentiators today. Every decision below flows from that.

Topical authority also matters more than ever: every article must sit squarely inside the **house-buying-cost / mortgage / moving / renovation / legal-closing** niche. Do not drift into general personal finance, investing, interior design trends, or real-estate market commentary. Staying on-topic compounds the site's ranking strength.

## Step 1 — Analyze what already exists, then pick a topic worth writing

1. Read every article under `src/content/blog/posts/*/en.md` and record: title, category, angle, primary keyword, and what user problem it solves.
2. Read `src/lib/blog.ts` for the frontmatter schema, allowed categories (`costs`, `mortgage`, `renovation`, `legal`, `moving`), and the language list.
3. Read one existing post end-to-end in **every** language (not just EN) — this is where you learn the established slug-localization pattern (see Step 2 frontmatter section) and the tone of each localization.

Now propose **3 distinct article ideas**. Every idea must fall into one of these two buckets — nothing else is worth writing:

- **Evergreen high-volume** — questions home buyers have searched for every month for years and will keep searching ("how much are notary fees in Spain", "what does closing cost include", "should I overpay my mortgage", "renovation budget checklist"). Reliable long-tail traffic.
- **Currently trending** — topics with a verifiable surge of real search interest right now (rate cuts/hikes, new first-time-buyer schemes, recent tax changes, seasonal moments, new regulations in any of our 6 markets). Use current events as the hook; write the piece so it still has value in 12 months. Use WebSearch to confirm the trend is real before proposing a trending topic.

**Before you commit to an angle**, run WebSearch for the top result of your target keyword and **read the top 3 SERP articles**. If your proposed structure matches theirs (same 7 bullets, same section order, same examples), your framing isn't original enough — Google's March 2026 update will bury it. Pick a different angle.

**While researching the SERP, also capture 3–5 "People Also Ask" (PAA) questions** Google surfaces for your target keyword. PAA is the single highest-leverage SEO signal in 2026 — it's how you capture featured snippets and zero-click traffic. The article must answer at least 2 PAA questions *directly* (in a section whose opening sentence is a crisp 1–2 sentence answer to the question). See Step 2 for the structural rule.

**Pick ONE primary keyword cluster** before writing — the exact phrase you're targeting. Record it in the topic-selection deliverable. Keyword placement rules (Step 2) will reference it.

**Reject** ideas that are: personal-essay / opinion pieces, topics with no measurable search demand, topics already well-covered by existing CasaTab posts, topics outside the house-buying niche, or topics too narrow to support 1,400+ words of real value.

For each of the 3 ideas give: working title, target keyword cluster + which bucket (evergreen/trending), search intent (informational / comparative / transactional-adjacent), category, and the "aha moment" where the app becomes the obvious solution.

### Stop here — the user picks the topic (not you)

After presenting the 3 ideas, **STOP and wait for the user to choose.** Do NOT proceed to Step 2 until they confirm a pick. This is non-negotiable even in auto mode — topic selection is the highest-leverage decision in the whole workflow, and the user has context (calendar, business priorities, parallel content plans) that you don't.

Prefer the `AskUserQuestion` tool if it's available — it renders a clean picker. Otherwise print the 3 options with a short recommendation on which you'd pick and why, then ask the user to reply (they can say "1", "the renovation one", "let's do idea 2 but focus more on X", etc.).

**Exception — TOPIC HINT provided:** if `$ARGUMENTS` is non-empty, skip the 3-idea brainstorm entirely. Briefly confirm the angle + aha moment in 2–3 sentences (plus a one-line SERP-originality read), then proceed straight to Step 2 without asking. The user already made the topic decision when they typed the hint.

## Step 2 — Write the English article (`en.md`)

Rules:
- **SEO-first, value-first.** The article must teach something real — a checklist, a calculation, a framework, a country-by-country comparison, a mistake-avoidance guide. If a reader gets no value without installing the app, it's a bad article. Rank-worthy posts are useful posts.
- **Target length 1,400–2,200 words.** Scannable: H2 every 150–300 words, short paragraphs (2–4 sentences max), bullet lists, bolded key terms, concrete numbers and percentages, real country examples, at least one markdown table for a worked example.
- **Soft conversion, never pushy.** The app is mentioned *at most* 2–3 times total, and only when it's the honest answer to a pain the reader just felt. Pattern: describe a concrete pain → show the reader they already have this problem → casually note that this is exactly what CasaTab was built for, with a contextual link (`[track it in CasaTab](https://casatab.com)`). No "sign up now!" energy.
- **Structure that converts:** hook (a specific scenario the reader recognizes) → the real scope of the problem (numbers, categories, surprises) → practical guidance → a "here's how people who get this right actually do it" section (← natural home for the CasaTab mention) → a closing that restates the stakes without pitching.
- Avoid AI tells: no "In this article we will explore", no "In conclusion", no generic advice lists, no em-dash tic patterns, no "it's important to note". Write like a sharp finance/real-estate journalist.

### Frontmatter — critical conventions (read carefully)

The Zod schema lives in `src/lib/blog.ts`. Every file must satisfy it. Beyond the schema, these project conventions are **load-bearing for SEO**:

- `title`: **55–65 characters.** Primary keyword appears near the start. Specific and click-worthy, not generic ("Why Renovations Go 30% Over Budget — and How to Stop It" beats "Renovation Cost Guide"). This is also the `<title>` tag Google shows in the SERP — truncated around 60 chars on desktop.
- `description`: **150–160 characters, hard ceiling.** Primary keyword in the first 65 characters. Ends with a soft hook ("…here's the four-part system that catches it before it costs you.") not a sales pitch. This is the meta description Google shows under the title in the SERP.
- `excerpt`: 1–2 conversational sentences describing what the reader *learns*, not what the article "covers". Shown under the title on the blog index and in the article header.
- `slug`: **3–5 words maximum**, kebab-case, primary keyword in slug. Localize per language (native-language URLs rank better in each market):
  - English example: `home-renovation-budget-overrun`
  - Spanish example: `desviacion-presupuesto-reforma`
  - German example: `sanierungsbudget-ueberschreitung` (use `ae/oe/ue` for ä/ö/ü)
  - Each language uses the natural search term in that market.
- `canonicalSlug`: **identical across all 6 languages**, typically the English slug. This is what `resolveAlternateUrls()` uses to tie translations together. Think of it as the article's language-agnostic ID.
- `publishedAt`: today's date in YYYY-MM-DD (from system context).
- `updatedAt`: equals `publishedAt` on first publish. **Bump it whenever a cited tax rate, regulation, program threshold, or data point changes.** Google rewards genuine freshness on finance/real-estate topics.
- `category`: one of the enum values exactly.
- `heroImage`: **optional — omit entirely if the image hasn't been generated yet**. If you include a path that doesn't exist, every reader sees a broken-image icon until the file lands. All-or-nothing across all 6 language files when you do add it.

### Article opener structure (above the first H2) — answer-first, always

Every article opens in exactly this order. **The #1 rule: the answer comes first.** 44.2 % of LLM citations (ChatGPT, Perplexity, Google AI Overviews) are drawn from the first 30 % of a page — Kevin Indig's analysis of 1.2 M citations, Feb 2026. If the answer arrives in paragraph 3, the model quits before reaching it, and a human skimmer on mobile does the same. Open with the number.

1. **H1** — auto-rendered from the `title` frontmatter. Do not write an H1 in the body.
2. **Excerpt** — auto-rendered from the `excerpt` frontmatter.
3. **Answer-first lead paragraph** — the single highest-leverage block in the article. Exactly **one bolded sentence** at the start of paragraph 1 that directly answers the primary question the article exists to answer — with the number, percentage, or named mechanism inside it. Follow that bolded sentence with 1–3 unbolded sentences of essential context (country ranges, typical breakdown, key caveat). Total block ≤ 80 words. Include one authoritative inline citation if the core number comes from an external source. Do **not** lead with a narrative hook, a "you found the house" scenario, or "you've been saving for years…" storytelling — those delay the answer and are actively penalized by LLM citation and by 2026 Google answer-engine ranking.
4. **TL;DR / Key takeaways block** — a bulleted list of **3–5 single-sentence** takeaways, immediately after the answer-first lead. Label it in-language ("The short version:" / "Lo esencial:" / "L'essentiel :" / "Das Wesentliche:" / "In het kort:" / "Em resumo:"). This is what Google lifts as a featured snippet AND what a skimming mobile reader reads before deciding to scroll.
5. **Narrative scene (optional, max 2 sentences)** — only if it genuinely adds experiential credibility (E-E-A-T). Goes *after* the TL;DR, not before. If the article already feels practitioner-authored without it, skip it entirely.

Only then does the first H2 begin.

**Why this order (not the older "hook first" pattern):** the old narrative-hook-first structure is a legacy of long-form magazine writing, where attention was captive. In 2026, the reader — human *or* LLM — has already decided by sentence 2 whether to keep going. The answer-first lead is the single biggest change that lifts both AI citation rate and Google AI Overview inclusion. Every existing CasaTab article has been rewritten to follow this shape; new articles must match.

### Keyword placement (non-negotiable)

The primary keyword you chose in Step 1 must appear in **all** of these locations:
- The `title` (near the start).
- The `description` (in the first 65 characters).
- The first 100 words of the body.
- At least one H2 or H3.
- The URL `slug` (localized equivalently per language).

One or two secondary/long-tail keywords should appear naturally in H2s and body prose — never forced, never stuffed.

### People Also Ask (PAA) capture

From the PAA questions recorded in Step 1, answer **at least 2 directly** inside the article:
- Rephrase the PAA question as an H2 or H3 ("How much do renovations go over budget?" becomes a section heading).
- The **first sentence** under that heading is a direct 1–2 sentence answer (≤60 words). Google lifts this verbatim for featured snippets on zero-click results.
- Then elaborate in the rest of the section as normal.

This single practice typically doubles organic traffic on ranked articles. Don't skip it.

### Internal + outbound linking

- **Internal links: 2–3 contextual links** to the most relevant existing CasaTab articles. Natural in-body mentions, not a "related articles" dump (the site renders a separate related-articles block at the end). Each anchor text is naturally descriptive, never "click here". Before writing any cross-article link, `grep` the target article's `.md` file in that language for its `slug:` field and use that value — from `es.md`, the link to the true-cost article is `/es/blog/coste-real-de-comprar-casa/`, NOT `/es/blog/true-cost-of-buying-a-house/`.
- **Outbound authority links: at least 2 in-body links** to primary authoritative sources (government tax site, central bank, national statistics office, major publication). These reinforce Trustworthiness (the T in E-E-A-T) and are the quiet ranking signal most SEO farms skip. They're already part of your sourcing — make sure they're also clickable, not just cited by name.

## Sourcing & truthfulness (non-negotiable — this is how we earn trust)

Readers will make real financial decisions based on this article. If we lose their trust once, they will not use the app.

- **Do not fabricate anything.** No invented studies, no invented statistics, no plausible-sounding numbers pulled from memory, no made-up quotes, no hallucinated laws or program names.
- **Especially: do not fabricate "percentage of the overrun" / "share of X" breakdowns that your source doesn't actually publish.** If Houzz says "the top five reasons are A, B, C, D, E" without quantifying each, you cannot write "A causes 30–50% of the overrun" — that's a fabrication dressed as data. Either find a source that publishes the breakdown or reframe qualitatively ("A is the category with most leverage to prevent").
- **Every number, rate, percentage, law, program, deadline, or named mechanism must come from a real, authoritative, current source.** Use WebSearch + WebFetch to confirm against at least one primary source (government tax authority, central bank, official land-registry or notary body, national statistics office, major bank's official rate page) or, failing that, a credible secondary source (Reuters, FT, Le Monde, El País, Handelsblatt, NRC, major established real-estate publications — not SEO content farms).
- **WebFetch, not just WebSearch.** Search summaries sometimes hallucinate. Before citing a specific figure, WebFetch the source URL and confirm the number actually appears on that page. If it doesn't, find the real URL or cut the claim.
- **Historical facts (years, regulation dates, bans) get the same treatment.** Don't write "the German asbestos ban was 1978" or "the French lead-paint rule from 1948" without verifying. Renovation-risk heuristics are easy to fumble; default to "pre-1990 buildings" or "older stock" if you can't pin a date confidently.
- **Prefer primary over secondary.** For tax rates: the government tax site. For mortgage averages: the central bank or a named major lender. For legal thresholds: the statute. If only secondary sources exist, say so in the text ("according to X").
- **Currency of data.** Only cite figures valid as of today. If the most recent data you can verify is older, either find newer data or state the year explicitly.
- **Cite inline, naturally.** Name the source in-sentence: *"Spain's transfer tax (ITP) ranges from 6% to 10% depending on autonomous community, per the Agencia Tributaria."*
- **Uncertainty is a feature.** If a range is genuinely uncertain or regionally variable, say so honestly.
- **Keep a sources log.** At the end of Step 5, list every source you consulted (URL + what you used it for + whether you WebFetched it to verify).

## Quality bar (non-negotiable)

Before moving to translation, the English draft must pass all of these. If any fail, rewrite.

- **Specificity test** — every major claim has a number, a percentage, a country, a date, or a named mechanism. No "significant costs", no "various fees", no "in some cases".
- **Experience test (E-E-A-T)** — the article reads as if written by someone who has actually been through the process. Include at least two details that only a practitioner would know (the quirk in Dutch transfer tax under 35, the gift-letter paper-trail requirement, how French notaire fees bundle taxes, etc.).
- **Originality test** — compare your structure to the top 3 SERP results for your target keyword. If you have the same sections in the same order, rewrite the structure. Google 2026 buries reheated content.
- **Sourcing pass** — every number and named mechanism in the final draft traces back to an entry in the sources log AND has been WebFetched to confirm. If it doesn't, cut it.
- **No invented percentage shares** — specifically check each H2/H3 and each parenthetical for claims like "(30–50% of X)" that attribute a quantified share to a source that didn't publish one. These are the most common fabrication pattern.
- **PAA answer test** — confirm at least 2 sections directly answer a recorded PAA question in their opening sentence. Verify the opening sentence would read well as a standalone Google snippet (≤60 words, self-contained).
- **Keyword placement test** — primary keyword present in title, description (first 65 chars), first 100 words, ≥1 H2/H3, and slug. Walk the list explicitly; don't assume.
- **Editing pass** — cut 10% of the final draft.
- **Skim test** — a reader scanning only headings, bolded terms, TL;DR, and the first sentence of each section should still understand the full argument.

## Step 3 — Localize into es, fr, de, nl, pt

This is NOT translation. This is **re-authoring in the target language for a reader in that country.**

For each of `es`, `fr`, `de`, `nl`, `pt`:
- Use the natural financial/legal vocabulary of that country: `notario` / `notaire` / `Notar`, `ITP` / `frais de notaire` / `Grunderwerbsteuer` / `overdrachtsbelasting` / `IMT`.
- Replace US/generic examples with **country-specific examples verified against local primary sources**: real tax rates from the national tax authority, regional variation (Madrid vs. Cataluña ITP from Agencia Tributaria, Bundesland-level Grunderwerbsteuer, NHG limits, PTZ conditions from service-public.fr, IMT brackets from Portal das Finanças), typical € ranges for that market. Do NOT translate English-market numbers — verify the equivalent local number.
- Adjust the hook, metaphors and idioms so they sound native. A Dutch reader should not feel like they're reading a translated US blog. A Spanish reader should not see sentences structured like English.
- Keep the same H2/H3 structure and word-count ballpark, but rewrite sentences — don't map 1:1.
- Sourcing & Quality bar apply to every language. Each localized version must pass Specificity, Experience, and Sourcing with its own country-specific sources added to the sources log.

### Frontmatter per language (reiterating the slug rule)

- `slug`: localized, kebab-case, native language. Example set:
  - `en.md` → `home-renovation-budget-overrun`
  - `es.md` → `desviacion-presupuesto-reforma`
  - `fr.md` → `depassement-budget-renovation`
  - `de.md` → `sanierungsbudget-ueberschreitung` (use `ae/oe/ue` for ä/ö/ü)
  - `nl.md` → `verbouwingsbudget-overschrijding`
  - `pt.md` → `derrapagem-orcamento-obra`
- `canonicalSlug`: identical in all 6 files (typically the EN slug).
- `heroImage`: either omit across all 6 files, or include across all 6 with the same path — never mix.

### Cross-links inside the localized body

Every `[text](/{lang}/blog/...)` link MUST point to that article's localized slug in that language. Before writing a link, `grep` the target article's `.md` file for its `slug:` value and use that. Example — linking to the true-cost article from `es.md`: `/es/blog/coste-real-de-comprar-casa/`.

After writing all 6 files, run `npm run test:unit -- blog` and confirm parity tests still pass.

## Step 4 — Hero image prompt for Gemini 3 Pro Image (Nano Banana Pro)

CasaTab's direction for article heroes is **photoreal documentary photography that depicts a real subject the article is actually about** — not flat-lay still-lifes of tools and paperwork on a desk. Think Dwell, Cereal, Kinfolk, The Atlantic photo-essays — images that look like they were captured, not staged. Readers should not be able to tell the image was AI-generated.

### Two things every hero must do simultaneously

**1. Show a real subject tied to the article's topic.** An article about buying a house should depict a home, a room, a street, or the handover moment — not a flat-lay of a calculator and fountain pen. An article about mortgage decisions can show the house being paid off, or the kitchen where the decision is made, or a mailbox. The desk-with-props fallback is a bad default because every article ends up looking the same at thumbnail size.

Ask: *what is the most evocative real-world subject that represents this article's thesis?* Examples:
- "Buying costs" → the empty rooms on handover day
- "Renovation overrun" → a kitchen/room visibly mid-renovation
- "Mortgage decision" → the house being paid off, seen from the street
- "First-year costs" → a half-unpacked living room two weeks after moving in
- "Home inspection" → a close-up of a real structural detail being examined
- "Closing checklist" → the keys being handed over on a doorstep

**2. Look like a real photograph.** The brand is trust. Photoreal documentary beats stylized editorial every time for that goal.

### Photorealism recipe (the prompt formula)

**Lead-in language** (biases the model toward photoreal output — this is the single biggest quality lever):
- `Documentary photograph, shot on 35mm film` or `Available-light photograph, natural candid frame` or `35mm film photograph, handheld, caught in passing`
- Avoid `editorial photograph, magazine-style` as a lead-in — it pushes toward styled magazine shoots. Use it only if the specific article genuinely warrants that feel.

**Camera / lens / aperture triplet** (name one literally — concrete beats vague):
- Architecture / exterior wide: `24mm prime at f/8, deep depth of field, tripod-steady`
- Interior wide: `35mm prime at f/5.6, natural handheld feel`
- Environmental mid-range: `50mm prime at f/2.8, shallow DoF`
- Intimate detail: `85mm prime at f/1.8, very shallow focal plane`

**Film stock reference** (for grain + color science):
- `Kodak Portra 400 color science, slightly warm shadows, muted highlights` — the default for most scenes
- `Fujifilm Pro 400H film stock` — naturalistic, slightly cooler than Portra, good for overcast/neutral
- `Natural film grain, slight halation on the brightest edges` — always include

**Lighting clauses that read as real** (not studio-lit):
- `Overcast afternoon through a north-facing window` (diffuse, cool)
- `Warm morning sun raking across the floor at a low angle` (directional, amber)
- `Golden-hour side-light from the right, long warm shadows`
- `Diffuse daylight, no direct sun, slight blue-grey in the shadows`
- Avoid `perfectly lit`, `studio-lit`, `softbox`, `three-point lighting` — all read staged.

**Environmental realism cues** (small details that sell "real" vs "rendered"):
- `A mug rim with faint coffee residue`
- `A paint drip on the edge of a dust sheet`
- `A slightly crumpled moving-box corner`
- `Dust motes visible in a sunbeam`
- `A slightly off-level picture frame on the wall`
- `An old nail hole left on the wall from a previous tenant`

**Subject region hints** (when the article has a European audience):
- `Modest European semi-detached family home` / `European apartment with tall windows` / `Suburban European kitchen`
- Keep the architectural cues generic-European unless the article is geography-specific.

**Negative constraints — always include, all of these:**
- `Not a 3D render. Not CGI. Not a digital illustration. No AI-generated look.`
- `No over-smoothed surfaces, no plastic-looking textures, no HDR, no overdone bokeh.`
- `No symmetrical arrangement, no perfectly-staged composition — must feel caught, not arranged.`
- `No text, no numbers, no logos, no watermarks.`
- `No human faces, no hands, no stock-photo poses.`
- `No saturated colors, no lens flares, no heavy noise reduction.`

### Variables to VARY per article (so thumbnails aren't confusable)

Each new article's hero must differ from the previously-published heroes on at least 3 of these axes:

- **Subject scale**: exterior architecture / interior wide / interior mid / interior intimate detail
- **Camera angle**: eye-level / elevated / three-quarter / tilted
- **Setting**: street / empty room / mid-renovation space / lived-in room / close-up surface
- **Light quality**: golden hour / overcast / raking morning / soft afternoon
- **Color temperature**: amber / neutral-cool / honeyed / warm cream
- **Depth**: deep DoF architectural / deep DoF environmental / mid-DoF single-focal / shallow DoF intimate

Before writing a new prompt, grep `public/blog/*-hero.webp` to see the existing heroes. Your new one should feel like a different photographer took it at a different time of day in a different setting.

### Anti-patterns to avoid

Don't do these, even if they produce pretty images:
- Overhead flat-lay of small objects on a walnut wood desk (we already have too many; the style has become monotonous)
- "Styled editorial magazine" lead-in language unless the article is specifically about magazine content
- Perfectly symmetrical compositions
- A room/surface with absolutely nothing out of place (staging gives away AI)
- Generic golden-hour warmth applied to every scene regardless of topic fit
- `#863bff` purple being forced into the frame — leave brand color to the UI, not the image

### Palette note

Even with documentary realism, the overall palette should remain muted and warm-adjacent (not cold, not oversaturated). Don't force a purple brand accent into every image; it usually reads as AI-placed rather than natural. Consistency of *mood* across the set (quiet, considered, unhurried) matters more than consistency of color hits.

### Execute: generate the image (preferred) or fall back to manual prompts

First, check whether the Gemini API key is configured:

```bash
grep -q "^GEMINI_API_KEY=.\+" .env 2>/dev/null && echo "HAS_KEY" || echo "NO_KEY"
```

**If `HAS_KEY` — end-to-end automated flow:**

Never pass the prompt as a CLI argument. Em-dashes, curly quotes, and editorial-style punctuation routinely break shell tokenisation. Always write the prompt to a temp file and pass `--prompt-file`. Also write a one-sentence alt-text description while you're at it — it feeds the atomic frontmatter sync at the end.

1. Compose the primary prompt (following the clause order above — Subject → Composition → Action/mood → Setting → Camera → Lighting → Palette → Aspect → Negatives). Write it to `/tmp/hero-prompt.txt` using the Write tool.
2. Compose a one-sentence accessibility description for the image (what a blind reader should hear — short, factual, no prompt-speak). Call this `<image-alt>`.
3. Run, substituting `<canonicalSlug>` with the article folder name and `<image-alt>` with your sentence:

```bash
npm run generate-hero -- \
  --slug "<canonicalSlug>-hero" \
  --prompt-file /tmp/hero-prompt.txt \
  --aspect 16:9 \
  --resolution 2K \
  --update-frontmatter \
  --canonical-slug "<canonicalSlug>" \
  --image-alt "<image-alt>"
```

What happens end-to-end (~30–60 seconds, ~$0.035):

- SDK call to Gemini 3 Pro Image with retries on 429/503.
- Raw image saved to `public/blog/<canonicalSlug>-hero.png` (or .webp / .jpg depending on the API's mimeType).
- Auto-chain into `generate-hero-variants.mjs`: center-crops to 16:9, resizes to 1600×900, re-encodes as WebP q82, generates `-800.webp` + `-1200.webp` variants at q76/q78, deletes the source.
- Auto-chain into `sync-hero-frontmatter.mjs`: atomically writes `heroImage: "/blog/<canonicalSlug>-hero.webp"` + `heroImageAlt: "…"` into all 6 language files under `src/content/blog/posts/<canonicalSlug>/`. All-or-nothing — either every file updates or none do.
- Cost + duration logged to `.hero-generations.log`.

Output is watermark-free (API carries only invisible SynthID).

**If the API call fails or the prompt is blocked**, the script exits non-zero with actionable diagnostics. Options:
- Revise the prompt (safety-filter issues usually come from a negative clause — try dropping "no human faces" if it's blocking benign still-life shots).
- Rerun with the tweaked prompt.
- If persistent, fall back to the manual path below — tell the user why.

**If `NO_KEY` — manual fallback:**

Print the prompts for manual generation:

```
PROMPT (primary):
Editorial photograph, magazine-style — <one paragraph following the slot order above, 70–110 words>

PROMPT (fallback, different composition):
Editorial photograph, magazine-style — <different angle or subject, same style/palette/mood>

REFERENCE IMAGES TO UPLOAD IN GEMINI (optional, strongly recommended):
Upload 1–3 real editorial photos from publications whose aesthetic you like (FT, Monocle, Kinfolk, Cereal). Nano Banana Pro accepts up to 14 reference images.

FILENAME: <canonicalSlug>-hero.<png|jpg|webp>
SAVE TO: public/blog/<canonicalSlug>-hero.<ext>
NEXT:
  npm run process-heroes
  npm run sync-hero-frontmatter -- \
    --canonical-slug "<canonicalSlug>" \
    --image-alt "<one-sentence a11y description>"
```

Then tell the user: *"To automate this going forward, add `GEMINI_API_KEY=<your key>` to `.env`. Next `/new-article` will generate the image and update frontmatter in one shot."*

Do NOT edit the 6 frontmatter files yourself — always use `sync-hero-frontmatter.mjs` (or `--update-frontmatter`). It's atomic and handles the add-or-update branching correctly.

## Step 5 — Deliverables checklist

At the end, print:
- [ ] Chosen topic + bucket (evergreen/trending) + **primary keyword** + one-sentence angle + aha moment
- [ ] **SERP originality check**: top-3 competitors named + one-sentence description of why your angle is different
- [ ] **PAA questions captured** + which 2+ are answered directly in the article (map question → section heading)
- [ ] Quality bar: confirm each check passed, including "no invented percentage shares", "PAA answer test", "keyword placement test"
- [ ] **Sources log**: bulleted list of every URL, grouped by language, with a one-line note of what each source was used for AND whether you WebFetched it to verify
- [ ] 6 markdown files written (list the paths) — slugs correctly localized per language, canonicalSlug identical across all 6
- [ ] Cross-article links verified to point at each target's localized slug
- [ ] **Frontmatter craft check** (one line per article): title length, description length, primary keyword present in each required location
- [ ] Hero image: **which path was taken** (`API` / `manual`), final file sizes of `hero.webp` + `-800.webp` + `-1200.webp`, and whether `heroImage` + `heroImageAlt` were added to all 6 frontmatter blocks
- [ ] `npm run test:unit -- blog` result
- [ ] Any follow-ups ("user must run `npm run build` before deploy", "rebuild to regenerate SEO pages with the new hero")

Do NOT commit. The user reviews first.
