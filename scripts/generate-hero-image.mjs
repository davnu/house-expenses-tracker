#!/usr/bin/env node
/**
 * generate-hero-image.mjs
 *
 * Calls Gemini 3 Pro Image ("Nano Banana Pro") via the official
 * `@google/genai` SDK to produce a hero image, then chains into
 * `generate-hero-variants.mjs` (center-crop 16:9, resize to 1600×900,
 * emit WebP + 800w/1200w variants) and optionally
 * `sync-hero-frontmatter.mjs` (atomically add heroImage/heroImageAlt
 * to every language markdown under the article folder).
 *
 * Why the SDK, not raw fetch:
 *   - API evolution insulation. Google has changed the request schema
 *     twice in the last year (imageConfig moved; responseModalities added).
 *     The SDK ships aligned with the current API; raw fetch would break.
 *   - Structured errors. SDK throws typed exceptions; fetch hands you
 *     opaque 400s. Diagnostics stay readable.
 *   - Future streaming, auto quota backoff, etc. without rewriting.
 *
 * Why the API, not the consumer app:
 *   - No visible watermark. Consumer outputs carry a ✦ corner mark; API
 *     outputs carry only the invisible SynthID provenance signal.
 *   - Reproducibility (same prompt → consistent style).
 *   - Automation — /new-article can run end-to-end.
 *
 * Cost: ~$0.035 per 2K 16:9 image at published Gemini 3 Pro Image rates
 * (Dec 2025). Logged per run to `.hero-generations.log` for the ledger.
 *
 * Usage (simple):
 *   npm run generate-hero -- --slug foo-hero --prompt-file /tmp/prompt.txt
 *
 * Usage (A/B primary + fallback, interactive pick):
 *   npm run generate-hero -- --slug foo-hero \
 *     --prompt-file /tmp/primary.txt \
 *     --fallback-prompt-file /tmp/fallback.txt \
 *     --with-fallback
 *
 * Usage (end-to-end, updates all 6 markdown frontmatters too):
 *   npm run generate-hero -- --slug foo-hero \
 *     --prompt-file /tmp/prompt.txt \
 *     --canonical-slug foo \
 *     --update-frontmatter \
 *     --image-alt "One-sentence description for a11y"
 *
 * Required env: GEMINI_API_KEY (in .env — loaded by --env-file-if-exists).
 * Optional env: GEMINI_IMAGE_MODEL (override; default gemini-3-pro-image-preview).
 */

import { GoogleGenAI } from '@google/genai'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
  unlinkSync,
  statSync,
  renameSync,
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BLOG_DIR = join(ROOT, 'public', 'blog')
const LEDGER = join(ROOT, '.hero-generations.log')

/**
 * Terminal-level error handler — intercepts unhandled promise rejections
 * (including those from top-level await failures) and prints our own
 * formatted output instead of Node's default stack-trace + JSON dump.
 * Errors created via `makeActionableError()` render as a clean header +
 * bulleted next steps; other errors fall back to a one-line summary.
 */
process.on('unhandledRejection', (err) => {
  if (err?.actionable) {
    console.error(err.message)
  } else if (err instanceof Error) {
    console.error(`✗ ${err.message.split('\n')[0]}`)
    if (process.env.DEBUG) console.error(err.stack)
    else console.error('  Set DEBUG=1 to see the full stack trace.')
  } else {
    console.error(err)
  }
  process.exit(1)
})

/* ═══════════════════ Args ═══════════════════ */

let parsed
try {
  parsed = parseArgs({
    options: {
      slug: { type: 'string' },
      prompt: { type: 'string' },
      'prompt-file': { type: 'string' },
      'fallback-prompt': { type: 'string' },
      'fallback-prompt-file': { type: 'string' },
      'with-fallback': { type: 'boolean' },
      aspect: { type: 'string', default: '16:9' },
      resolution: { type: 'string', default: '2K' },
      'skip-process': { type: 'boolean' },
      'update-frontmatter': { type: 'boolean' },
      'canonical-slug': { type: 'string' },
      'image-alt': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      'dry-run': { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  })
} catch (err) {
  console.error(`✗ Invalid arguments: ${err.message}`)
  console.error('  Run with --help for usage.')
  process.exit(1)
}

const args = parsed.values

if (args.help) {
  printHelp()
  process.exit(0)
}

if (!args.slug) {
  console.error('✗ Missing required --slug')
  console.error('  Run with --help for usage.')
  process.exit(1)
}

const slug = args.slug.replace(/\.(png|jpg|jpeg|webp)$/i, '')

// Prompt: file takes precedence over inline. This avoids shell-quoting
// breakage on prompts that contain em-dashes, curly quotes, or straight
// quotes — which every editorial-photography prompt does.
const primaryPrompt = resolvePrompt(args.prompt, args['prompt-file'])
if (!primaryPrompt) {
  console.error('✗ Missing prompt. Pass --prompt "..." or --prompt-file <path>.')
  process.exit(1)
}

const fallbackPrompt =
  args['with-fallback']
    ? resolvePrompt(args['fallback-prompt'], args['fallback-prompt-file'])
    : null

if (args['with-fallback'] && !fallbackPrompt) {
  console.error('✗ --with-fallback requires --fallback-prompt or --fallback-prompt-file.')
  process.exit(1)
}

if (args['update-frontmatter'] && !args['canonical-slug']) {
  console.error('✗ --update-frontmatter requires --canonical-slug <article folder name>.')
  process.exit(1)
}

if (args['update-frontmatter'] && !args['image-alt']) {
  console.error('✗ --update-frontmatter requires --image-alt "<description>".')
  process.exit(1)
}

const aspect = args.aspect
const resolution = args.resolution

/* ═══════════════════ Env + SDK ═══════════════════ */

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey || apiKey === 'your-key-here') {
  console.error('✗ GEMINI_API_KEY is not set.')
  console.error('')
  console.error('   Add it to .env (gitignored):')
  console.error('     GEMINI_API_KEY=<key from https://aistudio.google.com/apikey>')
  process.exit(1)
}

const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview'

if (model.includes('-preview')) {
  console.warn(
    `⚠ Using a preview model (${model}). When Google GAs this model, the ID will change.\n` +
      `  Override with GEMINI_IMAGE_MODEL in .env when that happens.`,
  )
}

if (args['dry-run']) {
  console.log('--dry-run: would call Gemini with:')
  console.log(`  model      = ${model}`)
  console.log(`  slug       = ${slug}`)
  console.log(`  aspect     = ${aspect}`)
  console.log(`  resolution = ${resolution}`)
  console.log(`  prompt     = ${truncate(primaryPrompt, 120)}`)
  if (fallbackPrompt) {
    console.log(`  fallback   = ${truncate(fallbackPrompt, 120)}`)
  }
  console.log('No API call made.')
  process.exit(0)
}

const ai = new GoogleGenAI({ apiKey })

/* ═══════════════════ Generate ═══════════════════ */

console.log(`Calling ${model}`)
console.log(`  slug       = ${slug}`)
console.log(`  aspect     = ${aspect}`)
console.log(`  resolution = ${resolution}`)
if (args['with-fallback']) console.log(`  mode       = A/B (primary + fallback)`)

mkdirSync(BLOG_DIR, { recursive: true })

const primary = await generateWithRetries(primaryPrompt, 'primary')
const fallback = fallbackPrompt ? await generateWithRetries(fallbackPrompt, 'fallback') : null

/* ═══════════════════ Save + user pick ═══════════════════ */

let finalPath
if (fallback) {
  const primaryPath = join(BLOG_DIR, `${slug}.primary.${primary.ext}`)
  const fallbackPath = join(BLOG_DIR, `${slug}.fallback.${fallback.ext}`)
  writeFileSync(primaryPath, primary.buffer)
  writeFileSync(fallbackPath, fallback.buffer)
  console.log('')
  console.log(`  ✓ primary saved:  ${relativize(primaryPath)} (${sizeKB(primary.buffer)} KB)`)
  console.log(`  ✓ fallback saved: ${relativize(fallbackPath)} (${sizeKB(fallback.buffer)} KB)`)
  console.log('')
  console.log('Open both in Finder/Preview and pick one:')
  console.log(`  open ${relativize(primaryPath)} ${relativize(fallbackPath)}`)

  const pick = await promptChoice('Which one do you want to keep?', ['p', 'f', 'abort'], {
    p: 'primary',
    f: 'fallback',
    abort: 'abort (keeps neither, exits)',
  })

  if (pick === 'abort') {
    console.log('Aborted. Both files left in public/blog/ for inspection.')
    process.exit(0)
  }

  const winner = pick === 'p' ? primaryPath : fallbackPath
  const winnerExt = pick === 'p' ? primary.ext : fallback.ext
  const loser = pick === 'p' ? fallbackPath : primaryPath

  finalPath = join(BLOG_DIR, `${slug}.${winnerExt}`)
  renameSync(winner, finalPath)
  unlinkSync(loser)
  console.log(`✓ kept ${pick === 'p' ? 'primary' : 'fallback'} → ${relativize(finalPath)}`)
} else {
  finalPath = join(BLOG_DIR, `${slug}.${primary.ext}`)
  writeFileSync(finalPath, primary.buffer)
  console.log(`✓ saved ${relativize(finalPath)} (${sizeKB(primary.buffer)} KB ${primary.ext.toUpperCase()})`)
}

logLedger({
  slug,
  model,
  aspect,
  resolution,
  mode: fallback ? 'a_b' : 'single',
  kept: fallback ? (finalPath.includes('primary') ? 'primary' : 'fallback') : 'single',
  raw_bytes: statSync(finalPath).size,
  duration_s_primary: Number(primary.elapsed),
  duration_s_fallback: fallback ? Number(fallback.elapsed) : null,
  cost_usd_est: estimateCost(resolution, fallback ? 2 : 1),
})

/* ═══════════════════ Post-processing chain ═══════════════════ */

if (args['skip-process']) {
  console.log('(Skipped post-processing. Run `npm run process-heroes` when ready.)')
  process.exit(0)
}

console.log('')
console.log('Processing: center-crop 16:9 → 1600×900 WebP + 800w/1200w variants…')
const processResult = spawnSync(
  'node',
  [join(__dirname, 'generate-hero-variants.mjs')],
  { stdio: 'inherit' },
)
if (processResult.status !== 0) {
  console.error(`✗ Hero processing failed (exit code ${processResult.status ?? 'unknown'}).`)
  console.error(`  Raw API output remains at ${relativize(finalPath)}`)
  process.exit(processResult.status ?? 1)
}

/* ═══════════════════ Atomic frontmatter update ═══════════════════ */

if (args['update-frontmatter']) {
  console.log('')
  console.log('Syncing heroImage + heroImageAlt to all language files…')
  const syncResult = spawnSync(
    'node',
    [
      join(__dirname, 'sync-hero-frontmatter.mjs'),
      '--canonical-slug',
      args['canonical-slug'],
      '--image-alt',
      args['image-alt'],
    ],
    { stdio: 'inherit' },
  )
  if (syncResult.status !== 0) {
    console.error(`✗ Frontmatter sync failed (exit ${syncResult.status ?? 'unknown'}).`)
    process.exit(syncResult.status ?? 1)
  }
}

/* ═══════════════════ Helpers ═══════════════════ */

async function generateWithRetries(prompt, label) {
  const startTime = Date.now()
  const maxRetries = 3
  let lastError

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const spinner = startSpinner(`  [${label}] generating (attempt ${attempt}/${maxRetries})`)
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: aspect, imageSize: resolution },
        },
      })
      spinner.stop(' done')

      const parts = response?.candidates?.[0]?.content?.parts
      if (!Array.isArray(parts)) {
        throw new Error(
          `unexpected response shape — no candidates[0].content.parts array. ` +
            `Raw: ${JSON.stringify(response).slice(0, 400)}`,
        )
      }

      const imagePart = parts.find((p) => p.inlineData)
      if (!imagePart) {
        const block = response.promptFeedback?.blockReason
        if (block) {
          throw new Error(
            `prompt blocked by Gemini safety filter (${block}). ` +
              `Revise the prompt — usually a negative-constraint clause collides with content policy.`,
          )
        }
        throw new Error(
          `no image in response. Parts: ${JSON.stringify(parts).slice(0, 400)}`,
        )
      }

      const { mimeType, data } = imagePart.inlineData
      if (!data) {
        throw new Error(`inlineData present but empty. mimeType=${mimeType}`)
      }

      const buffer = Buffer.from(data, 'base64')
      const ext = mimeType?.includes('webp') ? 'webp' : mimeType?.includes('jpeg') ? 'jpg' : 'png'
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      return { buffer, ext, mimeType, elapsed }
    } catch (err) {
      spinner.stop('')
      lastError = err
      const code = Number(err?.status ?? err?.statusCode ?? err?.code)
      const detail = parseApiError(err)

      // Free-tier quota on a paid-only model: quota is 0 and no amount of
      // waiting helps. Fail fast with an actionable message instead of
      // dumping the raw JSON blob.
      if (code === 429 && detail?.isFreeTierLimit) {
        throw makeActionableError(
          `Gemini 3 Pro Image requires a billing-enabled Google Cloud project. ` +
            `Your API key is on the free tier, which has quota 0 for this model.`,
          [
            'Open https://aistudio.google.com/apikey and find the project tied to this key.',
            'In Google Cloud Console → Billing, enable billing on that project. New accounts get $300 in free credits.',
            'Rerun this command. Gemini 3 Pro Image is ~$0.035 per 2K image.',
            '(For watermark-tolerant testing on the free tier, set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image in .env — different imageConfig semantics, adds a visible ✦ mark, but free quota > 0.)',
          ],
        )
      }

      const transient = [408, 429, 500, 502, 503, 504].includes(code)
      if (!transient || attempt >= maxRetries) {
        throw err
      }

      // Honor the server's retryDelay when present (capped at 30s to avoid
      // a surprise multi-minute wait), otherwise fall back to exponential
      // backoff with jitter. Prior behaviour ignored Google's explicit
      // retry hint and could retry sooner than the server wanted.
      const serverHint = detail?.retryDelaySeconds
      const expBackoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 16000)
      const baseMs = serverHint ? Math.min(serverHint * 1000, 30000) : expBackoffMs
      const waitMs = baseMs + Math.random() * 500
      const reason = serverHint ? `server asked for ${serverHint}s` : `exp backoff`
      console.warn(
        `  [${label}] got ${code}, retrying in ${Math.round(waitMs / 1000)}s (${reason}, attempt ${attempt + 1}/${maxRetries})…`,
      )
      await sleep(waitMs)
    }
  }

  throw lastError
}

/**
 * Parse a `@google/genai` ApiError (or any error whose message holds JSON)
 * into the bits we actually care about for retry / diagnostics:
 *   - whether it's a free-tier quota (limit: 0) — never worth retrying
 *   - the server's suggested retryDelay in seconds, if any
 *   - a one-line human-readable message without the wall of JSON
 *
 * Returns null when the error isn't parseable — callers fall back to the
 * raw error in that case.
 */
function parseApiError(err) {
  const msg = err?.message
  if (typeof msg !== 'string') return null
  const match = msg.match(/\{[\s\S]*\}$/)
  if (!match) return null
  let parsed
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }
  const errObj = parsed?.error ?? parsed
  if (!errObj) return null

  const details = errObj.details ?? []
  const quotaFailure = details.find(
    (d) => d?.['@type']?.includes('QuotaFailure') || Array.isArray(d?.violations),
  )
  const isFreeTierLimit = Array.isArray(quotaFailure?.violations)
    ? quotaFailure.violations.some(
        (v) =>
          v?.quotaMetric?.includes('free_tier') ||
          v?.quotaId?.includes('FreeTier') ||
          v?.quotaDimensions?.tier === 'free',
      )
    : false

  const retryInfo = details.find((d) => d?.['@type']?.includes('RetryInfo'))
  const retryDelayRaw = retryInfo?.retryDelay
  const retryDelaySeconds = typeof retryDelayRaw === 'string'
    ? Number(retryDelayRaw.replace(/s$/, '')) || null
    : null

  return {
    status: errObj.status,
    code: errObj.code,
    shortMessage: (errObj.message || '').split('\n')[0],
    isFreeTierLimit,
    retryDelaySeconds,
  }
}

/**
 * Build an Error whose `.toString()` reads like a well-formatted terminal
 * message instead of a stack trace or a JSON dump. The top-level catch
 * prints only `.message`, so the user sees the actionable bullets first.
 */
function makeActionableError(summary, bullets) {
  const body = ['', `✗ ${summary}`, '', 'What to do:', ...bullets.map((b) => `  • ${b}`), ''].join('\n')
  const e = new Error(body)
  e.actionable = true
  return e
}

function resolvePrompt(inline, file) {
  if (file) {
    const path = file
    if (!existsSync(path)) {
      console.error(`✗ --prompt-file not found: ${path}`)
      process.exit(1)
    }
    return readFileSync(path, 'utf8').trim()
  }
  if (typeof inline === 'string' && inline.trim().length > 0) return inline.trim()
  return null
}

function startSpinner(label) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  const started = Date.now()
  const interval = setInterval(() => {
    const secs = ((Date.now() - started) / 1000).toFixed(0)
    process.stderr.write(`\r${frames[i++ % frames.length]} ${label} (${secs}s)`)
  }, 120)
  return {
    stop(finalMsg = '') {
      clearInterval(interval)
      const secs = ((Date.now() - started) / 1000).toFixed(1)
      process.stderr.write(`\r${' '.repeat(100)}\r`)
      if (finalMsg) console.log(`✓ ${label}${finalMsg} (${secs}s)`)
    },
  }
}

async function promptChoice(question, validKeys, labels) {
  if (!process.stdin.isTTY) {
    console.error(
      `✗ A/B pick requires an interactive terminal; stdin is not a TTY.\n` +
        `  Both files were saved. Rename the winner manually:\n` +
        `    mv public/blog/${slug}.primary.<ext> public/blog/${slug}.<ext>\n` +
        `  Then: npm run process-heroes`,
    )
    process.exit(1)
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  console.log('')
  for (const key of validKeys) console.log(`  ${key}) ${labels[key] ?? key}`)
  while (true) {
    const answer = (await rl.question(`\n${question} [${validKeys.join('/')}] `)).trim().toLowerCase()
    if (validKeys.includes(answer)) {
      rl.close()
      return answer
    }
    console.log(`  (invalid, pick one of: ${validKeys.join(', ')})`)
  }
}

/**
 * Per-image cost estimate at Gemini 3 Pro Image rates (as of late 2025).
 * Resolution-aware — the last ledger row being wrong cost me 0.022 USD to
 * discover. These numbers move; treat them as indicative, not authoritative.
 */
function estimateCost(resolution, imageCount) {
  const perImage = {
    '1K': 0.013,
    '2K': 0.035,
    '4K': 0.1,
  }[String(resolution).toUpperCase()] ?? 0.035
  return Number((perImage * imageCount).toFixed(4))
}

function logLedger(entry) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
    appendFileSync(LEDGER, line)
  } catch {
    // Ledger is nice-to-have, never fail the run over it.
  }
}

function relativize(abs) {
  return abs.startsWith(ROOT + '/') ? abs.slice(ROOT.length + 1) : abs
}

function sizeKB(buf) {
  return Math.round(buf.length / 1024)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function truncate(s, n) {
  if (!s) return ''
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + '…'
}

function printHelp() {
  console.log(`Usage:
  npm run generate-hero -- --slug <slug-hero> --prompt-file <path> [options]

Required (one of):
  --slug <name>               Output filename stem, conventionally <canonicalSlug>-hero.
  --prompt <text>             Prompt text inline. Fragile with quotes — prefer --prompt-file.
  --prompt-file <path>        Read prompt from a file. Handles em-dashes and quotes correctly.

A/B comparison (both needed):
  --with-fallback             Also generate a second image from the fallback prompt.
  --fallback-prompt <text>    Fallback prompt inline.
  --fallback-prompt-file <p>  Fallback prompt from a file.

Options:
  --aspect <ratio>            Default 16:9. One of:
                                1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9
  --resolution <size>         Default 2K. One of: 1K, 2K, 4K.
  --skip-process              Don't auto-run generate-hero-variants.mjs.
  --update-frontmatter        After processing, run sync-hero-frontmatter.mjs
                              to add heroImage + heroImageAlt to all 6 .md files.
                              Requires:
                                --canonical-slug <folder>   article folder name
                                --image-alt "<description>"  accessibility description
  --dry-run                   Validate args + env without calling the API.
  --help, -h                  This message.

Environment:
  GEMINI_API_KEY         Required. Add to .env (gitignored).
  GEMINI_IMAGE_MODEL     Optional override. Default gemini-3-pro-image-preview.

Costs ~$0.035 per 2K image; ~$0.07 in A/B mode (both generated). Logged to
.hero-generations.log for the running ledger.
`)
}
