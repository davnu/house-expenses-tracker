import { describe, it, expect } from 'vitest'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import de from './de.json'
import nl from './nl.json'
import pt from './pt.json'

/**
 * Catch the "I added a new billing.* key in en.json and forgot to translate it"
 * class of bug at CI time rather than at runtime when users see the raw key.
 *
 * Enforces that every nested key under `billing.*` in en.json exists in the
 * five other locales. Values can differ (they should — they're translations!)
 * but the key paths must match exactly.
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

const enBillingKeys = flattenKeys(
  (en as Record<string, unknown>).billing as Record<string, unknown>,
  'billing',
).sort()

function billingKeysFor(locale: Record<string, unknown>): string[] {
  return flattenKeys(locale.billing as Record<string, unknown>, 'billing').sort()
}

const localesUnderTest: Array<[string, Record<string, unknown>]> = [
  ['es', es as Record<string, unknown>],
  ['fr', fr as Record<string, unknown>],
  ['de', de as Record<string, unknown>],
  ['nl', nl as Record<string, unknown>],
  ['pt', pt as Record<string, unknown>],
]

describe('locale parity — billing namespace', () => {
  for (const [code, locale] of localesUnderTest) {
    it(`${code}.json has every billing.* key that en.json has`, () => {
      const keys = billingKeysFor(locale)
      const missing = enBillingKeys.filter((k) => !keys.includes(k))
      expect(missing).toEqual([])
    })

    it(`${code}.json does not define billing.* keys that en.json is missing (no stale translations)`, () => {
      const keys = billingKeysFor(locale)
      const extra = keys.filter((k) => !enBillingKeys.includes(k))
      expect(extra).toEqual([])
    })

    it(`${code}.json billing values are non-empty strings`, () => {
      // A missing-value regression (empty string) would render as whitespace in the UI.
      // Walk every leaf and assert it's a non-empty string.
      const walk = (o: unknown, path: string): void => {
        if (typeof o === 'string') {
          expect(o.length, `${code}.json → ${path}`).toBeGreaterThan(0)
          return
        }
        if (o && typeof o === 'object') {
          for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`)
        }
      }
      walk((locale as Record<string, unknown>).billing, 'billing')
    })
  }

  it('en.json has the canonical set of billing keys covering all gates + products', () => {
    // Fast smoke: if this list ever mismatches, it's a signal that a real gate
    // or product was added/removed — update this list and translations accordingly.
    const expected = [
      'billing.gate.invite',
      'billing.gate.advancedMortgage',
      'billing.gate.budget',
      'billing.gate.export',
      'billing.gate.print',
      'billing.gate.whatIf',
      'billing.gate.storage',
      'billing.gate.generic',
      'billing.product.additionalHouse',
    ]
    for (const prefix of expected) {
      const hasAny = enBillingKeys.some((k) => k.startsWith(prefix + '.'))
      expect(hasAny, `en.json missing keys under ${prefix}`).toBe(true)
    }
  })
})
