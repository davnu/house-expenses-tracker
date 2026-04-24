#!/usr/bin/env node
/**
 * generate-hero-variants.mjs
 *
 * Processes every blog hero image end-to-end:
 *
 *   1. If the source is in any format/size (e.g. a raw Gemini 3 Pro Image
 *      export at 4K PNG), center-crop to 16:9, resize to 1600×900, re-encode
 *      as WebP q85, and write the canonical `{slug}-hero.webp`.
 *   2. Generate responsive size variants `{slug}-hero-800.webp` and
 *      `{slug}-hero-1200.webp` alongside.
 *   3. Delete the non-webp source file (PNG/JPG) after successful processing
 *      so the tree has one canonical file per hero.
 *
 * All I/O happens in `public/blog/`. The outputs are committable source
 * assets — Vite copies them into `dist/blog/` as-is at build time, so the
 * same files serve in dev and prod (no mismatch between `npm run dev` and
 * the deployed site).
 *
 * Idempotent: re-running on an already-processed hero does nothing (checks
 * dimensions + format + variant presence).
 *
 * Referenced paths (keep the `{slug}-hero-{width}.webp` convention in sync):
 *   - `src/pages/BlogArticlePage.tsx`  → `buildHeroSrcSet()`
 *   - `scripts/generate-seo-pages.mjs` → `buildSrcSetAttr()`
 *
 * The legacy SVG hero (`public/blog/true-cost-hero.svg`) is left alone —
 * it scales intrinsically and doesn't need raster variants.
 */

import { readdirSync, existsSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BLOG_DIR = join(ROOT, 'public', 'blog')

const TARGET_WIDTH = 1600
const TARGET_HEIGHT = 900
const VARIANT_WIDTHS = [800, 1200]

/**
 * WebP quality tuned per viewport size. For photographic hero images,
 * human perception plateaus around q80 — below that, smooth gradients
 * start showing artifacts; above it, file size grows with no visible gain.
 * Smaller viewports can tolerate slightly lower quality because each pixel
 * occupies less screen area.
 *
 * effort: 6 (max) squeezes ~15% more off the file at the cost of build time.
 * Since the pipeline runs rarely (once per new hero), the extra seconds are
 * worth it for every reader forever.
 *
 * smartSubsample: true uses better chroma subsampling — meaningful for
 * photographic content with fine colour detail (skin tones, wood grain,
 * fabric, plants), invisible on flat vector.
 */
const QUALITY_MAIN = 82      // 1600w — primary hero
const QUALITY_1200 = 78      // 1200w — tablet
const QUALITY_800 = 76       // 800w — mobile
const WEBP_EFFORT = 6

const SOURCE_EXT_RE = /\.(webp|png|jpe?g)$/i
const VARIANT_RE = /-(?:800|1200)\.webp$/i
const HERO_NAME_RE = /-hero\.(webp|png|jpe?g)$/i

if (!existsSync(BLOG_DIR)) {
  console.log('No public/blog/ directory — skipping hero processing.')
  process.exit(0)
}

/**
 * A "source" file is a hero candidate that still needs processing:
 *   - Ends in `-hero.{webp,png,jpg,jpeg}`
 *   - Is NOT a generated size variant (`-hero-800.webp`, `-hero-1200.webp`)
 *
 * Examples of sources:
 *   true-cost-hero.webp               (already in canonical format, may still need resize)
 *   home-renovation-budget-overrun-hero.png    (raw Gemini export — will be processed)
 *
 * Examples skipped:
 *   true-cost-hero.svg                (not raster)
 *   true-cost-hero-800.webp           (already a variant)
 *   og-image.png                      (no `-hero` suffix)
 */
const sources = readdirSync(BLOG_DIR).filter(
  (f) => SOURCE_EXT_RE.test(f) && !VARIANT_RE.test(f) && HERO_NAME_RE.test(f),
)

if (sources.length === 0) {
  console.log('No hero images found in public/blog/ — nothing to do.')
  process.exit(0)
}

console.log(`Processing ${sources.length} hero image(s) in public/blog/…`)

let processedMain = 0
let processedVariants = 0
let skipped = 0

for (const file of sources) {
  const input = join(BLOG_DIR, file)
  const ext = extname(file).toLowerCase()
  const stem = basename(file, ext) // e.g. `home-renovation-budget-overrun-hero`
  const canonicalWebp = join(BLOG_DIR, `${stem}.webp`)

  const meta = await sharp(input).metadata()
  if (!meta.width || !meta.height) {
    console.warn(`  ⚠ ${file}: no dimension metadata, skipping`)
    continue
  }

  const isAlreadyCanonical =
    ext === '.webp' &&
    meta.width === TARGET_WIDTH &&
    meta.height === TARGET_HEIGHT

  if (isAlreadyCanonical) {
    skipped++
  } else {
    // Needs cropping/resizing/re-encoding. sharp's fit:'cover' crops to the
    // target aspect ratio first (defaulting to centre), then resizes. If
    // your hero has an off-centre subject, render it at 16:9 in Gemini
    // directly (the `/new-article` prompt explicitly requests 16:9) so this
    // centre crop doesn't clip anything you care about.
    await sharp(input)
      .resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
      })
      .webp({ quality: QUALITY_MAIN, effort: WEBP_EFFORT, smartSubsample: true })
      .toFile(canonicalWebp + '.tmp')
    // Atomic swap: on Unix, rename is atomic, so readers never see a
    // half-written file. `fs.renameSync` would be tighter but we already
    // have sync APIs in scope — import rename.
    const { renameSync } = await import('node:fs')
    renameSync(canonicalWebp + '.tmp', canonicalWebp)

    const srcKb = Math.round(statSync(input).size / 1024)
    const outKb = Math.round(statSync(canonicalWebp).size / 1024)
    console.log(
      `  ✓ ${stem}.webp processed  (${meta.width}×${meta.height} ${ext.slice(1).toUpperCase()} ${srcKb} KB → ${TARGET_WIDTH}×${TARGET_HEIGHT} WebP ${outKb} KB)`,
    )
    processedMain++

    // If the source was a different format (PNG/JPG), delete it — we keep
    // one canonical `.webp` per hero. If the source was already .webp at
    // wrong dimensions, we overwrote it in place.
    if (ext !== '.webp') {
      unlinkSync(input)
    }

    // Invalidate stale variants so they regenerate from the new main below.
    // Without this, re-exporting a hero from Gemini would leave the old
    // 800/1200 crops of the previous version cached in the tree.
    for (const w of VARIANT_WIDTHS) {
      const variantPath = join(BLOG_DIR, `${stem}-${w}.webp`)
      if (existsSync(variantPath)) unlinkSync(variantPath)
    }
  }

  // Generate / verify size variants alongside the canonical hero. Each
  // variant uses its own quality knob — narrower viewports tolerate lower
  // quality because individual pixels occupy less screen area.
  for (const w of VARIANT_WIDTHS) {
    const variantPath = join(BLOG_DIR, `${stem}-${w}.webp`)
    if (existsSync(variantPath)) continue
    const quality = w === 800 ? QUALITY_800 : QUALITY_1200
    await sharp(canonicalWebp)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality, effort: WEBP_EFFORT, smartSubsample: true })
      .toFile(variantPath)
    const kb = Math.round(statSync(variantPath).size / 1024)
    console.log(`  ✓ ${stem}-${w}.webp  (${kb} KB)`)
    processedVariants++
  }
}

console.log(
  `Done. Main: ${processedMain} processed, ${skipped} already canonical. Variants: ${processedVariants} generated.`,
)
