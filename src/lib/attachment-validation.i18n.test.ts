import { describe, it, expect } from 'vitest'
import { REJECTION_MESSAGE_KEYS, type AttachmentRejection } from './attachment-validation'

import en from '@/locales/en.json'
import es from '@/locales/es.json'
import fr from '@/locales/fr.json'
import de from '@/locales/de.json'
import nl from '@/locales/nl.json'
import pt from '@/locales/pt.json'

/**
 * Lookup a dot-path like "files.unsupportedType" in a parsed JSON object.
 * Returns undefined when the path is missing — the test asserts presence.
 */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

const LOCALES = { en, es, fr, de, nl, pt } as const
const CODES: AttachmentRejection['code'][] = [
  'unsupportedType',
  'exceedsLimit',
  'maxFilesPerExpense',
  'householdStorageLimit',
]

describe('attachment rejection i18n keys', () => {
  // Belt-and-suspenders: if a key is ever renamed in one locale but not the
  // others (or removed entirely), this suite fails at build time instead of
  // the user seeing the raw key string (e.g. "files.exceedsLimit") rendered
  // in their UI.

  for (const [localeName, locale] of Object.entries(LOCALES)) {
    for (const code of CODES) {
      const key = REJECTION_MESSAGE_KEYS[code]
      it(`${localeName}: ${key} (for code "${code}") resolves to a non-empty string`, () => {
        const value = getByPath(locale, key)
        expect(
          value,
          `Missing i18n entry: ${localeName}.json needs "${key}" for rejection code "${code}"`,
        ).toBeTypeOf('string')
        expect(value as string).not.toBe('')
      })
    }
  }

  it('REJECTION_MESSAGE_KEYS has an entry for every rejection code (exhaustiveness)', () => {
    // `satisfies Record<AttachmentRejection['code'], string>` on the const
    // gives us compile-time exhaustiveness, but this runtime check makes the
    // intent visible and catches any accidental regression if the `satisfies`
    // clause is dropped in a future refactor.
    for (const code of CODES) {
      expect(REJECTION_MESSAGE_KEYS[code]).toBeTypeOf('string')
    }
  })

  // The rejectionMessage() switch passes specific params ({name}, {max},
  // {size}). If ANY locale — not just en.json — has a placeholder that
  // rejectionMessage doesn't supply, the UI renders "{{limit}}" literally in
  // that language. Must walk every locale; translators edit Spanish/French
  // files directly and can introduce placeholders that pass review because
  // English looks fine.
  const expectedPlaceholders: Record<AttachmentRejection['code'], string[]> = {
    unsupportedType: ['name'],
    exceedsLimit: ['name'],
    maxFilesPerExpense: ['max'],
    householdStorageLimit: ['size'],
  }

  for (const [localeName, locale] of Object.entries(LOCALES)) {
    for (const code of CODES) {
      const key = REJECTION_MESSAGE_KEYS[code]
      it(`${localeName}: ${key} only uses placeholders that rejectionMessage() passes`, () => {
        const template = getByPath(locale, key)
        // Key-presence is asserted in the loop above; if it's missing here
        // we skip so this test's failure message stays focused on placeholders.
        if (typeof template !== 'string') return
        const placeholders = [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
        const allowed = expectedPlaceholders[code]
        for (const p of placeholders) {
          expect(
            allowed,
            `${localeName}.json "${key}" uses {{${p}}} but rejectionMessage() doesn't pass it — users will see "{{${p}}}" literal in their UI`,
          ).toContain(p)
        }
      })
    }
  }
})
