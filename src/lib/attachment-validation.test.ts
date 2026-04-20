import { describe, it, expect } from 'vitest'
import {
  validateAttachmentFiles,
  validateExpenseAttachments,
  validateDocumentFiles,
  AttachmentValidationError,
  rejectionMessage,
} from './attachment-validation'
import { MAX_FILE_SIZE, MAX_FILES_PER_EXPENSE, MAX_HOUSEHOLD_STORAGE } from './constants'
import { makeFile } from '@/test-utils/files'

describe('validateAttachmentFiles', () => {
  it('accepts a supported file under the size limit', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('a.png', 'image/png', 1024)],
      { householdStorageUsed: 0 },
    )
    expect(accepted).toHaveLength(1)
    expect(rejection).toBeNull()
  })

  it('rejects unsupported file types but keeps processing other files', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [
        makeFile('virus.exe', 'application/x-msdownload'),
        makeFile('ok.png', 'image/png'),
      ],
      { householdStorageUsed: 0 },
    )
    expect(accepted.map((f) => f.name)).toEqual(['ok.png'])
    expect(rejection).toEqual({ code: 'unsupportedType', name: 'virus.exe' })
  })

  it('rejects files exceeding MAX_FILE_SIZE — the exact bug that 46 MB uploads hit', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('huge.png', 'image/png', MAX_FILE_SIZE + 1)],
      { householdStorageUsed: 0 },
    )
    expect(accepted).toHaveLength(0)
    expect(rejection).toEqual({
      code: 'exceedsLimit',
      name: 'huge.png',
      maxBytes: MAX_FILE_SIZE,
    })
  })

  it('rejects a file exactly at MAX_FILE_SIZE — matches server-side strict `<` rule', () => {
    // storage.rules uses `request.resource.size < 25 * 1024 * 1024`, so a
    // file of exactly 25 MB would pass client but fail server with 403.
    // The client must match to surface a specific "exceeds 25 MB" message
    // instead of the misleading generic "you don't have permission" error.
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('edge.png', 'image/png', MAX_FILE_SIZE)],
      { householdStorageUsed: 0 },
    )
    expect(accepted).toHaveLength(0)
    expect(rejection?.code).toBe('exceedsLimit')
  })

  it('accepts a file one byte under MAX_FILE_SIZE', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('just-under.png', 'image/png', MAX_FILE_SIZE - 1)],
      { householdStorageUsed: 0 },
    )
    expect(accepted).toHaveLength(1)
    expect(rejection).toBeNull()
  })

  it('accepts a zero-byte file (allowed by both client and server rule)', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('empty.pdf', 'application/pdf', 0)],
      { householdStorageUsed: 0 },
    )
    expect(accepted).toHaveLength(1)
    expect(rejection).toBeNull()
  })

  it('stops adding once MAX_FILES_PER_EXPENSE is reached (counts existingCount)', () => {
    const input = Array.from({ length: 3 }, (_, i) => makeFile(`f${i}.png`, 'image/png'))
    // Uses validateExpenseAttachments so the cap comes from the wrapper,
    // not a literal maxFiles option — matches how real call sites invoke it.
    const { accepted, rejection } = validateExpenseAttachments(input, {
      householdStorageUsed: 0,
      existingCount: MAX_FILES_PER_EXPENSE - 1, // 9 → 1 slot left
    })
    expect(accepted).toHaveLength(1)
    expect(rejection).toEqual({ code: 'maxFilesPerExpense', max: MAX_FILES_PER_EXPENSE })
  })

  it('enforces household storage quota with running accumulator', () => {
    const remaining = 500
    const { accepted, rejection } = validateAttachmentFiles(
      [
        makeFile('a.png', 'image/png', 300),
        makeFile('b.png', 'image/png', 300), // 600 > 500 remaining
      ],
      { householdStorageUsed: MAX_HOUSEHOLD_STORAGE - remaining },
    )
    expect(accepted).toHaveLength(1)
    expect(accepted[0].name).toBe('a.png')
    expect(rejection?.code).toBe('householdStorageLimit')
  })

  it('counts stagedFiles bytes toward the quota (preserves legacy FileDropZone math)', () => {
    const staged = [makeFile('staged.png', 'image/png', 400)]
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('new.png', 'image/png', 200)],
      {
        householdStorageUsed: MAX_HOUSEHOLD_STORAGE - 500, // 500 remaining
        stagedFiles: staged, // 400 already reserved
      },
    )
    // 400 staged + 200 new = 600 > 500 remaining
    expect(accepted).toHaveLength(0)
    expect(rejection?.code).toBe('householdStorageLimit')
  })

  it('dedupes against stagedFiles by name+size', () => {
    const staged = [makeFile('receipt.pdf', 'application/pdf', 5000)]
    const { accepted } = validateAttachmentFiles(
      [makeFile('receipt.pdf', 'application/pdf', 5000)],
      { householdStorageUsed: 0, stagedFiles: staged },
    )
    expect(accepted).toHaveLength(0)
  })

  it('does not dedupe when opt-out is set (document flow)', () => {
    const staged = [makeFile('receipt.pdf', 'application/pdf', 5000)]
    const { accepted } = validateAttachmentFiles(
      [makeFile('receipt.pdf', 'application/pdf', 5000)],
      { householdStorageUsed: 0, stagedFiles: staged, dedupe: false },
    )
    expect(accepted).toHaveLength(1)
  })

  // ── Household quota boundaries ────────────────────

  it('accepts files that fill household quota to EXACTLY MAX_HOUSEHOLD_STORAGE', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('fit.pdf', 'application/pdf', 500)],
      { householdStorageUsed: MAX_HOUSEHOLD_STORAGE - 500 },
    )
    expect(accepted).toHaveLength(1)
    expect(rejection).toBeNull()
  })

  it('rejects files that push one byte past MAX_HOUSEHOLD_STORAGE', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('spill.pdf', 'application/pdf', 501)],
      { householdStorageUsed: MAX_HOUSEHOLD_STORAGE - 500 },
    )
    expect(accepted).toHaveLength(0)
    expect(rejection?.code).toBe('householdStorageLimit')
  })

  it('accepts upload when household is already at quota minus zero', () => {
    // No headroom, zero-byte upload — still fits (MAX - 0 = MAX, not > MAX)
    const { accepted } = validateAttachmentFiles(
      [makeFile('zero.pdf', 'application/pdf', 0)],
      { householdStorageUsed: MAX_HOUSEHOLD_STORAGE },
    )
    expect(accepted).toHaveLength(1)
  })

  it('rejects ANY non-zero upload when quota is fully consumed', () => {
    const { rejection } = validateAttachmentFiles(
      [makeFile('tiny.pdf', 'application/pdf', 1)],
      { householdStorageUsed: MAX_HOUSEHOLD_STORAGE },
    )
    expect(rejection?.code).toBe('householdStorageLimit')
  })

  // ── Count limit boundaries ────────────────────

  it('rejects all new files when existingCount already equals MAX_FILES_PER_EXPENSE', () => {
    const { accepted, rejection } = validateExpenseAttachments(
      [makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png')],
      { householdStorageUsed: 0, existingCount: MAX_FILES_PER_EXPENSE },
    )
    expect(accepted).toHaveLength(0)
    expect(rejection?.code).toBe('maxFilesPerExpense')
  })

  it('accepts up to (MAX_FILES_PER_EXPENSE - existingCount) files then rejects the rest', () => {
    const input = Array.from({ length: 5 }, (_, i) => makeFile(`f${i}.png`, 'image/png'))
    const { accepted, rejection } = validateExpenseAttachments(input, {
      householdStorageUsed: 0,
      existingCount: 7, // 10 - 7 = 3 slots left
    })
    expect(accepted).toHaveLength(3)
    expect(rejection?.code).toBe('maxFilesPerExpense')
  })

  it('omitting maxFiles disables the count check entirely (documents flow)', () => {
    const input = Array.from({ length: 50 }, (_, i) => makeFile(`f${i}.pdf`, 'application/pdf'))
    const { accepted, rejection } = validateAttachmentFiles(input, {
      householdStorageUsed: 0,
      // maxFiles intentionally omitted — documents have no per-folder cap.
    })
    expect(accepted).toHaveLength(50)
    expect(rejection).toBeNull()
  })

  // ── MIME type edge cases ──────────────────────

  it('rejects files with empty MIME type (browser could not detect)', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile('mystery.dat', '', 100)],
      { householdStorageUsed: 0 },
    )
    expect(accepted).toHaveLength(0)
    expect(rejection?.code).toBe('unsupportedType')
  })

  it('rejects application/octet-stream (common fallback MIME)', () => {
    // This is the specific MIME browsers use when they cannot identify a file
    // — the second most likely cause of the user's 403 behind oversized files.
    const { rejection } = validateAttachmentFiles(
      [makeFile('weird.png', 'application/octet-stream', 100)],
      { householdStorageUsed: 0 },
    )
    expect(rejection?.code).toBe('unsupportedType')
  })

  it('rejects MIME type with different casing (server regex is case-sensitive)', () => {
    // Browsers and jsdom both normalize File.type to lowercase on construction,
    // so we forcibly override .type here to simulate a non-standard source
    // (custom upload code, a different runtime). storage.rules regex is
    // case-sensitive — if the client ever sent "Image/PNG" we'd get a silent
    // 403, so the client must reject too.
    const f = makeFile('photo.png', 'image/png', 100)
    Object.defineProperty(f, 'type', { value: 'Image/PNG' })
    const { rejection } = validateAttachmentFiles([f], { householdStorageUsed: 0 })
    expect(rejection?.code).toBe('unsupportedType')
  })

  it.each([
    ['image/png', 'p.png'],
    ['image/jpeg', 'p.jpg'],
    ['image/webp', 'p.webp'],
    ['image/gif', 'p.gif'],
    ['image/heic', 'p.heic'],
    ['image/heif', 'p.heif'],
    ['application/pdf', 'doc.pdf'],
    ['application/msword', 'doc.doc'],
    ['application/vnd.ms-excel', 'sheet.xls'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc.docx'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet.xlsx'],
  ])('accepts canonical MIME type %s (must stay in sync with storage.rules regex)', (mime, name) => {
    const { accepted, rejection } = validateAttachmentFiles(
      [makeFile(name, mime, 100)],
      { householdStorageUsed: 0 },
    )
    expect(accepted).toHaveLength(1)
    expect(rejection).toBeNull()
  })

  // ── Input/iteration edge cases ────────────────

  it('handles empty input list without error', () => {
    const { accepted, rejection } = validateAttachmentFiles([], { householdStorageUsed: 0 })
    expect(accepted).toEqual([])
    expect(rejection).toBeNull()
  })

  it('reports the most recent rejection when multiple violations are present', () => {
    // Mix: unsupported (skip+continue), oversized (skip+continue), then count limit (break).
    // Last rejection wins, which is fine UX — user sees "at least one of these
    // issues stopped the batch" and can resolve iteratively.
    const { accepted, rejection } = validateExpenseAttachments(
      [
        makeFile('exe.bin', 'application/x-msdownload', 100),
        makeFile('big.png', 'image/png', MAX_FILE_SIZE + 1),
        makeFile('ok.png', 'image/png', 100),
      ],
      { householdStorageUsed: 0, existingCount: MAX_FILES_PER_EXPENSE }, // no slots left
    )
    expect(accepted).toEqual([])
    expect(rejection?.code).toBe('maxFilesPerExpense')
  })

  it('separates rejection from accepted — can mix good and bad', () => {
    const { accepted, rejection } = validateAttachmentFiles(
      [
        makeFile('a.png', 'image/png', 1000),
        makeFile('virus.exe', 'application/x-msdownload', 1000),
        makeFile('b.pdf', 'application/pdf', 1000),
      ],
      { householdStorageUsed: 0 },
    )
    expect(accepted.map((f) => f.name)).toEqual(['a.png', 'b.pdf'])
    expect(rejection?.code).toBe('unsupportedType')
  })

  // ── Staged files interaction ──────────────────

  it('stagedFiles contribute to count AND quota, not just dedupe', () => {
    // 9 staged + existingCount=1 → already at MAX_FILES_PER_EXPENSE (=10).
    const staged = Array.from({ length: 9 }, (_, i) => makeFile(`s${i}.png`, 'image/png', 100))
    const { accepted, rejection } = validateExpenseAttachments(
      [makeFile('new.png', 'image/png', 100)],
      { householdStorageUsed: 0, existingCount: 1, stagedFiles: staged },
    )
    expect(accepted).toHaveLength(0)
    expect(rejection?.code).toBe('maxFilesPerExpense')
  })
})

// ── Wrappers: verify the intent-revealing variants behave correctly ──

describe('validateExpenseAttachments wrapper', () => {
  it('applies MAX_FILES_PER_EXPENSE cap without needing an explicit maxFiles arg', () => {
    const input = Array.from({ length: MAX_FILES_PER_EXPENSE + 3 }, (_, i) =>
      makeFile(`f${i}.png`, 'image/png'),
    )
    const { accepted, rejection } = validateExpenseAttachments(input, { householdStorageUsed: 0 })
    expect(accepted).toHaveLength(MAX_FILES_PER_EXPENSE)
    expect(rejection?.code).toBe('maxFilesPerExpense')
  })

  it('dedupes by default (matches FileDropZone behavior)', () => {
    const staged = [makeFile('r.pdf', 'application/pdf', 1000)]
    const { accepted } = validateExpenseAttachments(
      [makeFile('r.pdf', 'application/pdf', 1000)],
      { householdStorageUsed: 0, stagedFiles: staged },
    )
    expect(accepted).toHaveLength(0)
  })
})

describe('validateDocumentFiles wrapper', () => {
  it('does NOT enforce a file count cap', () => {
    const input = Array.from({ length: 100 }, (_, i) => makeFile(`d${i}.pdf`, 'application/pdf'))
    const { accepted, rejection } = validateDocumentFiles(input, { householdStorageUsed: 0 })
    expect(accepted).toHaveLength(100)
    expect(rejection).toBeNull()
  })

  it('does NOT dedupe by name+size (revisions are allowed)', () => {
    const staged = [makeFile('r.pdf', 'application/pdf', 1000)]
    const { accepted } = validateDocumentFiles(
      [makeFile('r.pdf', 'application/pdf', 1000)],
      { householdStorageUsed: 0, stagedFiles: staged },
    )
    expect(accepted).toHaveLength(1)
  })

  it('still enforces per-file size and household quota (shared invariants)', () => {
    const oversized = makeFile('big.pdf', 'application/pdf', MAX_FILE_SIZE)
    const { rejection } = validateDocumentFiles([oversized], { householdStorageUsed: 0 })
    expect(rejection?.code).toBe('exceedsLimit')
  })
})

describe('AttachmentValidationError', () => {
  it('carries a structured reason and a readable debug message', () => {
    const err = new AttachmentValidationError({
      code: 'exceedsLimit',
      name: 'big.png',
      maxBytes: MAX_FILE_SIZE,
    })
    expect(err.reason.code).toBe('exceedsLimit')
    expect(err.message).toContain('big.png')
    expect(err.message).toContain('25 MB')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('rejectionMessage', () => {
  // Use a stub t() that returns the key + interpolated params so we don't
  // depend on the full i18n setup in this unit test.
  const fakeT = ((key: string, params?: Record<string, unknown>) => {
    if (!params) return key
    return `${key}:${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')}`
  }) as unknown as Parameters<typeof rejectionMessage>[0]

  it('renders exceedsLimit with the file name', () => {
    expect(
      rejectionMessage(fakeT, { code: 'exceedsLimit', name: 'big.png', maxBytes: MAX_FILE_SIZE }),
    ).toContain('big.png')
  })

  it('renders householdStorageLimit with the formatted size', () => {
    expect(
      rejectionMessage(fakeT, { code: 'householdStorageLimit', maxBytes: MAX_HOUSEHOLD_STORAGE }),
    ).toContain('50 MB')
  })
})
