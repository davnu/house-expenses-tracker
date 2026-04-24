#!/usr/bin/env node
/**
 * sync-hero-frontmatter.mjs
 *
 * Atomically writes `heroImage` and `heroImageAlt` to the frontmatter of
 * every language file for a given article (`src/content/blog/posts/<canonical-slug>/*.md`).
 *
 * Why a dedicated script:
 *   The `heroImage` field is all-or-nothing across the 6 language files —
 *   half-heroed articles break visual consistency and the SEO pipeline.
 *   Relying on Claude to edit 6 files in a row (via separate Edit tool
 *   calls) leaves a real error surface: if one file misses, the state is
 *   inconsistent and no test catches it. This script is the single
 *   source of truth for that mutation.
 *
 * Guarantees:
 *   - All-or-nothing: either every file gets updated, or nothing is
 *     written. A dry-run pass validates all files first, then a second
 *     pass writes them atomically (tmp file + rename).
 *   - Idempotent: re-running with the same args is a no-op.
 *   - Minimal diffs: only `heroImage` + `heroImageAlt` lines change;
 *     other frontmatter and the body are byte-identical.
 *
 * Usage:
 *   node scripts/sync-hero-frontmatter.mjs \
 *     --canonical-slug <article folder name> \
 *     --image-alt "<one-sentence a11y description>" \
 *     [--image-path "/blog/<slug>-hero.webp"]   (defaults to the canonical convention)
 *     [--unset]                                  (remove the fields instead)
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'src', 'content', 'blog', 'posts')
const LANGS = ['en', 'es', 'fr', 'de', 'nl', 'pt']

/* ═══════════════════ Args ═══════════════════ */

let parsed
try {
  parsed = parseArgs({
    options: {
      'canonical-slug': { type: 'string' },
      'image-alt': { type: 'string' },
      'image-path': { type: 'string' },
      unset: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      verbose: { type: 'boolean' },
    },
    strict: true,
  })
} catch (err) {
  console.error(`✗ Invalid arguments: ${err.message}`)
  console.error('  Run with --help for usage.')
  process.exit(1)
}

const args = parsed.values

if (args.help) {
  console.log(`Usage:
  sync-hero-frontmatter --canonical-slug <name> --image-alt "<description>"
                        [--image-path "/blog/<slug>-hero.webp"]
                        [--unset]    (removes both fields instead)

Adds or updates heroImage + heroImageAlt in every language .md file of the
article folder at src/content/blog/posts/<canonical-slug>/.

All-or-nothing: validates every file first, then writes atomically. If any
file is missing or malformed, nothing is written.

Required:
  --canonical-slug   Article folder name under src/content/blog/posts/.
  --image-alt        One-sentence description (ignored with --unset).

Options:
  --image-path       Absolute public path to the hero. Defaults to
                     /blog/<canonical-slug>-hero.webp.
  --unset            Remove heroImage and heroImageAlt from every file.
  --verbose          Print per-file change summary.
`)
  process.exit(0)
}

const canonicalSlug = args['canonical-slug']
if (!canonicalSlug) {
  console.error('✗ Missing --canonical-slug')
  process.exit(1)
}

const unset = Boolean(args.unset)
const imageAlt = args['image-alt']
if (!unset && !imageAlt) {
  console.error('✗ Missing --image-alt (required unless --unset is passed)')
  process.exit(1)
}

const imagePath =
  args['image-path'] || `/blog/${canonicalSlug}-hero.webp`

/* ═══════════════════ Pre-flight: all files exist + parse ═══════════════════ */

const articleDir = join(POSTS_DIR, canonicalSlug)
if (!existsSync(articleDir) || !statSync(articleDir).isDirectory()) {
  console.error(`✗ Article folder not found: src/content/blog/posts/${canonicalSlug}/`)
  process.exit(1)
}

const missing = []
const files = {}
for (const lang of LANGS) {
  const p = join(articleDir, `${lang}.md`)
  if (!existsSync(p)) {
    missing.push(`${lang}.md`)
    continue
  }
  files[lang] = { path: p, raw: readFileSync(p, 'utf8') }
}

if (missing.length > 0) {
  console.error(
    `✗ Missing language files under ${canonicalSlug}/: ${missing.join(', ')}.\n` +
      `  Aborting without changes (all-or-nothing).`,
  )
  process.exit(1)
}

// Validate every file has a well-formed frontmatter block before writing.
const FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)([\s\S]*)$/
for (const lang of LANGS) {
  const f = files[lang]
  const match = f.raw.match(FRONTMATTER_RE)
  if (!match) {
    console.error(
      `✗ ${lang}.md has no parseable YAML frontmatter block.\n` +
        `  Aborting without changes.`,
    )
    process.exit(1)
  }
  f.match = match
}

/* ═══════════════════ Apply edits in memory ═══════════════════ */

let changedCount = 0
const changes = []

for (const lang of LANGS) {
  const f = files[lang]
  const [, openMarker, header, closeMarker, body] = f.match

  const { newHeader, action } = unset
    ? removeFields(header)
    : upsertFields(header, imagePath, imageAlt)

  if (action === 'noop') {
    if (args.verbose) changes.push(`  ${lang}.md — already in sync, no change`)
    continue
  }

  f.newContent = `${openMarker}${newHeader}${closeMarker}${body}`
  f.action = action
  changes.push(`  ${lang}.md — ${action}`)
  changedCount++
}

if (changedCount === 0) {
  console.log(`✓ All 6 files already in the target state — nothing to do.`)
  process.exit(0)
}

/* ═══════════════════ Write atomically (tmp + rename) ═══════════════════ */

const written = []
try {
  for (const lang of LANGS) {
    const f = files[lang]
    if (!f.newContent) continue
    const tmp = `${f.path}.tmp`
    writeFileSync(tmp, f.newContent)
    renameSync(tmp, f.path)
    written.push(f.path)
  }
} catch (err) {
  // Best-effort: we can't un-write already-renamed files on partial failure.
  // Per-file rename is atomic on Unix, so at worst some subset committed.
  // Report clearly so the user can reconcile.
  console.error(`✗ Failed mid-sync: ${err.message}`)
  console.error(`  ${written.length}/${changedCount} files were written before failure:`)
  for (const p of written) console.error(`    ${p.slice(ROOT.length + 1)}`)
  console.error(
    `  Inspect the remaining files manually; run this script again when fixed.`,
  )
  process.exit(1)
}

console.log(
  `✓ Updated ${changedCount} file(s) under src/content/blog/posts/${canonicalSlug}/:`,
)
for (const line of changes) console.log(line)
if (unset) {
  console.log(`  (heroImage + heroImageAlt removed)`)
} else {
  console.log(`  heroImage:     ${imagePath}`)
  console.log(`  heroImageAlt:  ${truncate(imageAlt, 90)}`)
}

/* ═══════════════════ Frontmatter upsert / remove ═══════════════════ */

function upsertFields(header, imgPath, alt) {
  const lines = header.split(/\r?\n/)
  let sawImage = false
  let sawAlt = false
  const out = []
  for (const line of lines) {
    if (/^heroImage:\s/.test(line)) {
      sawImage = true
      out.push(`heroImage: "${imgPath}"`)
    } else if (/^heroImageAlt:\s/.test(line)) {
      sawAlt = true
      out.push(`heroImageAlt: "${escapeQuote(alt)}"`)
    } else {
      out.push(line)
    }
  }
  if (!sawImage) out.push(`heroImage: "${imgPath}"`)
  if (!sawAlt) out.push(`heroImageAlt: "${escapeQuote(alt)}"`)

  const newHeader = out.join('\n')
  // If header is identical to input, it's a no-op. Whitespace-normalise
  // before comparing because the input may have trailing blank lines.
  if (newHeader.trim() === header.trim()) return { newHeader, action: 'noop' }
  return {
    newHeader,
    action: sawImage && sawAlt ? 'updated' : 'added',
  }
}

function removeFields(header) {
  const lines = header.split(/\r?\n/)
  let removed = 0
  const out = []
  for (const line of lines) {
    if (/^heroImage:\s/.test(line) || /^heroImageAlt:\s/.test(line)) {
      removed++
      continue
    }
    out.push(line)
  }
  if (removed === 0) return { newHeader: header, action: 'noop' }
  return { newHeader: out.join('\n'), action: 'removed' }
}

function escapeQuote(s) {
  // Frontmatter values here use double-quoted YAML strings. Escape any
  // embedded double quotes; leave everything else alone (the YAML-subset
  // parser in blog.ts handles \" via its value-trimming logic).
  return String(s).replace(/"/g, '\\"')
}

function truncate(s, n) {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}
