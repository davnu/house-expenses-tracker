import { describe, it, expect } from 'vitest'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import de from './de.json'
import nl from './nl.json'
import pt from './pt.json'

/**
 * Mirrors billing-parity: catches the "I added a blog UI string in en.json and
 * forgot to translate it" class of bug at CI time instead of surfacing a raw
 * translation key to visitors on the Spanish blog.
 */

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

const enBlogKeys = flattenKeys(
  (en as Record<string, unknown>).blog as Record<string, unknown>,
  'blog',
).sort()

function blogKeysFor(locale: Record<string, unknown>): string[] {
  return flattenKeys(locale.blog as Record<string, unknown>, 'blog').sort()
}

const localesUnderTest: Array<[string, Record<string, unknown>]> = [
  ['es', es as Record<string, unknown>],
  ['fr', fr as Record<string, unknown>],
  ['de', de as Record<string, unknown>],
  ['nl', nl as Record<string, unknown>],
  ['pt', pt as Record<string, unknown>],
]

describe('locale parity — blog namespace', () => {
  for (const [code, locale] of localesUnderTest) {
    it(`${code}.json has every blog.* key that en.json has`, () => {
      const keys = blogKeysFor(locale)
      const missing = enBlogKeys.filter((k) => !keys.includes(k))
      expect(missing).toEqual([])
    })

    it(`${code}.json does not define blog.* keys that en.json is missing (no stale translations)`, () => {
      const keys = blogKeysFor(locale)
      const extra = keys.filter((k) => !enBlogKeys.includes(k))
      expect(extra).toEqual([])
    })

    it(`${code}.json blog values are non-empty strings`, () => {
      const walk = (o: unknown, path: string): void => {
        if (typeof o === 'string') {
          expect(o.length, `${code}.json → ${path}`).toBeGreaterThan(0)
          return
        }
        if (o && typeof o === 'object') {
          for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`)
        }
      }
      walk((locale as Record<string, unknown>).blog, 'blog')
    })
  }

  it('en.json blog namespace has the expected canonical sections', () => {
    const expected = ['blog.index', 'blog.article', 'blog.categories']
    for (const prefix of expected) {
      const hasAny = enBlogKeys.some((k) => k.startsWith(prefix + '.'))
      expect(hasAny, `en.json missing keys under ${prefix}`).toBe(true)
    }
  })

  it(`en.json landing.nav.blog exists (used for header + footer links)`, () => {
    const enObj = en as unknown as Record<string, Record<string, Record<string, string>>>
    expect(typeof enObj.landing?.nav?.blog).toBe('string')
    expect(enObj.landing.nav.blog.length).toBeGreaterThan(0)
  })

  for (const [code, locale] of localesUnderTest) {
    it(`${code}.json landing.nav.blog exists`, () => {
      const obj = locale as unknown as Record<string, Record<string, Record<string, string>>>
      expect(typeof obj.landing?.nav?.blog).toBe('string')
      expect(obj.landing.nav.blog.length).toBeGreaterThan(0)
    })
  }
})
