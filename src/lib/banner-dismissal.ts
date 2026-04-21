/**
 * Banner-dismissal storage, refactored from one key per house
 * (`billing:banner-dismissed:{houseId}` — accumulated unboundedly across long
 * user sessions joining/leaving many houses) into a single serialised map with
 * automatic pruning of stale entries.
 *
 * Shape in localStorage:
 *   key   = "billing:banner-dismissed:v1"
 *   value = JSON { [houseId: string]: isoTimestamp: string }
 *
 * Entries older than MAX_AGE_DAYS are pruned on every read. If the user comes
 * back to a house years later and opens it again, a stale dismissal won't
 * suppress the banner forever.
 */

const STORAGE_KEY = 'billing:banner-dismissed:v1'
const LEGACY_KEY_PREFIX = 'billing:banner-dismissed:'
const MAX_AGE_DAYS = 90
const MS_PER_DAY = 86_400_000

type DismissalMap = Record<string, string>

function readRaw(): DismissalMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    // Runtime-validate: drop non-string entries so we can't crash on a stale shape.
    const clean: DismissalMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') clean[k] = v
    }
    return clean
  } catch {
    return {}
  }
}

function prune(map: DismissalMap, now = Date.now()): DismissalMap {
  const cutoff = now - MAX_AGE_DAYS * MS_PER_DAY
  const pruned: DismissalMap = {}
  for (const [houseId, iso] of Object.entries(map)) {
    const t = Date.parse(iso)
    if (Number.isFinite(t) && t >= cutoff) pruned[houseId] = iso
  }
  return pruned
}

function write(map: DismissalMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage quota / private mode — dismissal is a nice-to-have, silent fail.
  }
}

/**
 * One-time migration from the legacy per-key format. Invoked on first read.
 * Safe to call repeatedly — sweeps all `billing:banner-dismissed:{id}` keys
 * (excluding the new v1 key) into the consolidated map and deletes them.
 */
function migrateLegacyKeys(into: DismissalMap): DismissalMap {
  let mutated = false
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(LEGACY_KEY_PREFIX)) continue
      if (k === STORAGE_KEY) continue // skip the new key itself
      const houseId = k.slice(LEGACY_KEY_PREFIX.length)
      if (houseId && localStorage.getItem(k) === '1' && !into[houseId]) {
        // We don't know when they dismissed — use "now" so it ages out normally.
        into[houseId] = new Date().toISOString()
        mutated = true
      }
    }
    // Second pass: drop the legacy keys
    const legacyKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LEGACY_KEY_PREFIX) && k !== STORAGE_KEY) legacyKeys.push(k)
    }
    for (const k of legacyKeys) localStorage.removeItem(k)
    if (legacyKeys.length > 0) mutated = true
  } catch {
    // Ignore storage access failures
  }
  return mutated ? into : into
}

export function isBannerDismissed(houseId: string | undefined | null): boolean {
  if (!houseId) return false
  let map = readRaw()
  map = migrateLegacyKeys(map)
  map = prune(map)
  // Persist the pruned + migrated shape so a read also fixes the store.
  write(map)
  return Boolean(map[houseId])
}

export function dismissBanner(houseId: string | undefined | null): void {
  if (!houseId) return
  const map = prune(readRaw())
  map[houseId] = new Date().toISOString()
  write(map)
}

/** Exposed for tests — resets everything billing-banner related. */
export function __resetBannerStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    const legacyKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LEGACY_KEY_PREFIX)) legacyKeys.push(k)
    }
    for (const k of legacyKeys) localStorage.removeItem(k)
  } catch {
    /* noop */
  }
}
