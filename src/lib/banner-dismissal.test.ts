import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  isBannerDismissed,
  dismissBanner,
  __resetBannerStorage,
} from './banner-dismissal'

const STORAGE_KEY = 'billing:banner-dismissed:v1'
const LEGACY_KEY_PREFIX = 'billing:banner-dismissed:'

beforeEach(() => {
  __resetBannerStorage()
})

afterEach(() => {
  __resetBannerStorage()
})

describe('banner-dismissal — happy path', () => {
  it('undefined/null houseId is a safe no-op', () => {
    expect(isBannerDismissed(undefined)).toBe(false)
    expect(isBannerDismissed(null)).toBe(false)
    expect(() => dismissBanner(undefined)).not.toThrow()
    expect(() => dismissBanner(null)).not.toThrow()
  })

  it('a fresh house is not dismissed', () => {
    expect(isBannerDismissed('h1')).toBe(false)
  })

  it('dismissing marks the house as dismissed', () => {
    dismissBanner('h1')
    expect(isBannerDismissed('h1')).toBe(true)
  })

  it('dismissal is scoped per-house — other houses stay un-dismissed', () => {
    dismissBanner('h1')
    expect(isBannerDismissed('h1')).toBe(true)
    expect(isBannerDismissed('h2')).toBe(false)
  })

  it('stores data in a single JSON-serialised key (not one key per house — prevents unbounded growth)', () => {
    dismissBanner('h1')
    dismissBanner('h2')
    dismissBanner('h3')
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string) as Record<string, string>
    expect(Object.keys(parsed).sort()).toEqual(['h1', 'h2', 'h3'])
    // Each entry is an ISO timestamp
    for (const iso of Object.values(parsed)) {
      expect(Date.parse(iso)).not.toBeNaN()
    }
  })
})

describe('banner-dismissal — pruning', () => {
  it('prunes entries older than 90 days on read', () => {
    const longAgo = new Date(Date.now() - 91 * 86_400_000).toISOString()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ h_ancient: longAgo, h_fresh: new Date().toISOString() })
    )
    // Read triggers prune
    expect(isBannerDismissed('h_fresh')).toBe(true)
    expect(isBannerDismissed('h_ancient')).toBe(false)
    // The key is physically removed from storage
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as Record<string, string>
    expect(raw['h_ancient']).toBeUndefined()
  })

  it('keeps entries within the 90-day window', () => {
    const recent = new Date(Date.now() - 60 * 86_400_000).toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ h_recent: recent }))
    expect(isBannerDismissed('h_recent')).toBe(true)
  })
})

describe('banner-dismissal — legacy-key migration', () => {
  it('migrates the old `billing:banner-dismissed:{houseId}=1` format into the new map', () => {
    localStorage.setItem(`${LEGACY_KEY_PREFIX}old_h1`, '1')
    localStorage.setItem(`${LEGACY_KEY_PREFIX}old_h2`, '1')

    // First read triggers migration
    expect(isBannerDismissed('old_h1')).toBe(true)
    expect(isBannerDismissed('old_h2')).toBe(true)

    // Legacy keys have been cleaned up
    expect(localStorage.getItem(`${LEGACY_KEY_PREFIX}old_h1`)).toBeNull()
    expect(localStorage.getItem(`${LEGACY_KEY_PREFIX}old_h2`)).toBeNull()

    // And the new key holds them
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as Record<string, string>
    expect(parsed.old_h1).toBeDefined()
    expect(parsed.old_h2).toBeDefined()
  })

  it('does not clobber a newer dismissal when a legacy key also exists for the same house', () => {
    const fresh = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ h1: fresh }))
    localStorage.setItem(`${LEGACY_KEY_PREFIX}h1`, '1')

    expect(isBannerDismissed('h1')).toBe(true)
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as Record<string, string>
    // The existing (newer) timestamp is preserved
    expect(parsed.h1).toBe(fresh)
  })
})

describe('banner-dismissal — defensive reads', () => {
  it('returns false when localStorage has a malformed JSON value (no crash)', () => {
    localStorage.setItem(STORAGE_KEY, '{not: valid json}')
    expect(isBannerDismissed('h1')).toBe(false)
    // dismissBanner recovers cleanly too
    dismissBanner('h1')
    expect(isBannerDismissed('h1')).toBe(true)
  })

  it('silently survives localStorage quota-exceeded (private-mode Safari, etc.)', () => {
    const origSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = vi.fn(() => {
      throw new DOMException('QuotaExceededError')
    })
    try {
      // Must not throw
      expect(() => dismissBanner('h1')).not.toThrow()
    } finally {
      Storage.prototype.setItem = origSetItem
    }
  })
})
