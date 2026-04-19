#!/usr/bin/env node
/**
 * generate-favicon.mjs
 *
 * Generates all raster favicon derivatives from /public/icon-512.png:
 *   - public/favicon.ico       (multi-res 16/32/48, PNG-in-ICO)
 *   - public/favicon-48.png    (Google SERP preferred size — 48 = 48×1)
 *   - public/icon-maskable-512.png (Android adaptive-icon safe-zone variant)
 *   - public/.favicon-source-hash  (pins the source hash for staleness check)
 *
 * Why this script exists:
 *   Google's SERP favicon crawler requests /favicon.ico by default. Sites
 *   that ship only favicon.svg render as blank icons in search results —
 *   Google's favicon pipeline is conservative about SVG. Additionally,
 *   Android adaptive icons need a maskable variant with ~40% safe-zone
 *   padding or the icon gets letterboxed on circular launcher themes.
 *
 * When to run:
 *   Manually, whenever the source logo (public/icon-512.png) changes.
 *   Outputs are committed to /public so there's no build-time dependency
 *   on native tools. The companion validator (validate-seo-pages.mjs)
 *   checks the pinned source hash and fails CI if someone changes
 *   icon-512.png without re-running this script.
 *
 * Usage:
 *   node scripts/generate-favicon.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')
const SOURCE_PATH = join(PUBLIC_DIR, 'icon-512.png')

// Google recommends a multiple of 48 px. 16/32/48 covers browser tabs,
// Windows shortcuts, and the SERP favicon slot. Bigger sizes are served
// from icon-192.png / icon-512.png directly.
const ICO_SIZES = [16, 32, 48]

// Android adaptive icon spec: the logo must fit within a circle of diameter
// 80% of the icon canvas. We pad by 20% on each side (40% total) so the
// masked result still shows the whole logo. Solid background is required —
// maskable icons must have no transparency in the masked region.
// Docs: https://web.dev/articles/maskable-icon
//
// Background matches manifest.json `theme_color` (#171717). The source icon
// is already dark; extending that colour to the full canvas avoids a visible
// white seam when Android crops to circle/squircle/teardrop.
const MASKABLE_CANVAS = 512
const MASKABLE_SAFE_ZONE = 0.8 // 80% of canvas
const MASKABLE_LOGO_SIZE = Math.round(MASKABLE_CANVAS * MASKABLE_SAFE_ZONE) // 410
const MASKABLE_BG = { r: 23, g: 23, b: 23, alpha: 1 }

/**
 * Build a Windows ICO file that embeds PNG data. The ICO container is:
 *   ICONDIR (6 bytes) + ICONDIRENTRY × N (16 bytes each) + PNG payloads.
 * Modern renderers (Windows, all major browsers, Google's crawler) accept
 * PNG-in-ICO since Vista. Simpler and higher fidelity than BMP entries.
 */
function buildIco(images) {
  const HEADER = 6
  const ENTRY = 16
  const dirSize = HEADER + ENTRY * images.length

  const header = Buffer.alloc(HEADER)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(images.length, 4)

  const entries = Buffer.alloc(ENTRY * images.length)
  let offset = dirSize
  images.forEach((img, i) => {
    const entry = entries.subarray(i * ENTRY, (i + 1) * ENTRY)
    // width/height of 0 signals 256 px; otherwise the pixel size.
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0)
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1)
    entry.writeUInt8(0, 2) // palette colors (0 = truecolor)
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel (RGBA)
    entry.writeUInt32LE(img.data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += img.data.length
  })

  return Buffer.concat([header, entries, ...images.map((img) => img.data)])
}

async function resize(sourceBuffer, size) {
  const data = await sharp(sourceBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  return { size, data }
}

async function buildMaskable(sourceBuffer) {
  // Render the logo centered on the safe-zone square, then composite onto
  // a full-canvas solid background. Two-step keeps the source aspect ratio
  // intact while guaranteeing opaque padding all the way to the edges.
  const logo = await sharp(sourceBuffer)
    .resize(MASKABLE_LOGO_SIZE, MASKABLE_LOGO_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const offset = Math.floor((MASKABLE_CANVAS - MASKABLE_LOGO_SIZE) / 2)
  return sharp({
    create: {
      width: MASKABLE_CANVAS,
      height: MASKABLE_CANVAS,
      channels: 4,
      background: MASKABLE_BG,
    },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  console.log(`Generating favicon assets from ${SOURCE_PATH}`)
  const sourceBuffer = readFileSync(SOURCE_PATH)

  // Build ICO from resized PNGs
  const pngs = await Promise.all(ICO_SIZES.map((s) => resize(sourceBuffer, s)))
  const ico = buildIco(pngs)
  writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), ico)
  console.log(`  ✓ public/favicon.ico (${ico.length} bytes, sizes: ${ICO_SIZES.join(', ')})`)

  // Standalone 48×48 PNG for <link rel="icon" sizes="48x48">.
  // Google explicitly prefers this size for search result snippets.
  const png48 = pngs.find((p) => p.size === 48).data
  writeFileSync(join(PUBLIC_DIR, 'favicon-48.png'), png48)
  console.log(`  ✓ public/favicon-48.png (${png48.length} bytes)`)

  // Maskable icon for Android adaptive-icon PWA installs
  const maskable = await buildMaskable(sourceBuffer)
  writeFileSync(join(PUBLIC_DIR, 'icon-maskable-512.png'), maskable)
  console.log(`  ✓ public/icon-maskable-512.png (${maskable.length} bytes, safe-zone 80%)`)

  // Pin the source hash so the validator can detect "source changed but
  // derivatives weren't regenerated". Stored as plain SHA-256 hex (no
  // extension on the filename — it's a marker, not an image).
  const hash = createHash('sha256').update(sourceBuffer).digest('hex')
  writeFileSync(join(PUBLIC_DIR, '.favicon-source-hash'), `${hash}\n`)
  console.log(`  ✓ public/.favicon-source-hash (${hash.slice(0, 12)}…)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error('Favicon generation failed:', err)
  process.exit(1)
})
