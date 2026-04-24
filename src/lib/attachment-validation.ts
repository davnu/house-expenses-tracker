import type { TFunction } from 'i18next'
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE, MAX_FILES_PER_EXPENSE } from './constants'
import { formatFileSize } from './utils'

export type AttachmentRejection =
  | { code: 'unsupportedType'; name: string }
  | { code: 'exceedsLimit'; name: string; maxBytes: number }
  | { code: 'maxFilesPerExpense'; max: number }
  | { code: 'householdStorageLimit'; maxBytes: number }

export type AttachmentValidationOptions =
  | (AttachmentValidationBase & {
      /** When true, skip household-quota enforcement entirely. Household params become optional.
       *  Use this when the caller cannot see the cross-feature total (e.g. ExpenseContext sits above
       *  DocumentContext in the provider tree, so it only knows its own bytes — household-quota
       *  enforcement must happen at the UI layer via `useStorageQuota()` which has full visibility,
       *  with the server-side Cloud Function as the authoritative backstop). */
      skipHouseholdQuota: true
      householdStorageUsed?: number
      maxHouseholdBytes?: number
    })
  | (AttachmentValidationBase & {
      skipHouseholdQuota?: false
      /** Bytes currently used across the household (expenses + documents combined). */
      householdStorageUsed: number
      /**
       * Household-wide storage quota in bytes. REQUIRED unless `skipHouseholdQuota: true`.
       * Derive from the tier's limits via `maxBytesForLimits(useEntitlement().limits)` — or use
       * `useStorageQuota()` which wraps the whole thing. Passed explicitly (rather than read from
       * a constant) so Pro houses aren't silently capped at the free-tier default. An earlier
       * version defaulted this to 50 MB; that default bit a paying Pro customer at ~43.9 MB used.
       * Don't bring it back.
       */
      maxHouseholdBytes: number
    })

interface AttachmentValidationBase {
  /** Files already staged client-side (e.g. pending create form). Used for duplicate detection and quota accumulation. */
  stagedFiles?: readonly File[]
  /** Count of attachments already persisted on the target expense. */
  existingCount?: number
  /**
   * Per-expense max file count. `undefined` (the default when using
   * {@link validateDocumentFiles}) disables the count check entirely — use for
   * document flows that don't cap per-folder.
   */
  maxFiles?: number
  /** Per-file max size in bytes. Override for tests. */
  maxFileBytes?: number
  /** If false, duplicates are accepted. Default true. */
  dedupe?: boolean
}

export interface AttachmentValidationResult {
  accepted: File[]
  /** First rejection encountered. Callers can translate via {@link rejectionMessage}. */
  rejection: AttachmentRejection | null
}

/**
 * Validate attachment uploads against file type, size, count, duplication, and household quota.
 *
 * Designed as the single source of truth shared by every upload entry point
 * (expense create, add-to-existing-expense, documents). Pure and framework-free
 * so it can be exercised in unit tests without DOM or i18n setup.
 */
export function validateAttachmentFiles(
  incoming: Iterable<File>,
  opts: AttachmentValidationOptions,
): AttachmentValidationResult {
  const {
    stagedFiles = [],
    existingCount = 0,
    maxFiles,
    maxFileBytes = MAX_FILE_SIZE,
    dedupe = true,
    skipHouseholdQuota = false,
  } = opts
  const householdStorageUsed = skipHouseholdQuota ? 0 : opts.householdStorageUsed
  const maxHouseholdBytes = skipHouseholdQuota ? Number.POSITIVE_INFINITY : opts.maxHouseholdBytes

  // Runtime guard: household-quota mode must carry a valid cap. TypeScript's
  // discriminated union enforces this at compile time, but a JS/`as any`
  // caller could still slip past — a missing cap would silently accept any
  // size because every comparison against `undefined`/`NaN` returns false.
  // That's the exact shape of the 50 MB regression, but worse (unlimited
  // instead of undersized). Fail loud unless the caller explicitly opted out.
  if (!skipHouseholdQuota && (!Number.isFinite(maxHouseholdBytes) || (maxHouseholdBytes as number) < 0)) {
    throw new TypeError('validateAttachmentFiles: maxHouseholdBytes must be a non-negative finite number (or pass skipHouseholdQuota: true)')
  }

  const accepted: File[] = []
  let rejection: AttachmentRejection | null = null
  // Bytes already committed toward the quota in this session: server-side
  // attachments are counted in householdStorageUsed, so we seed pendingSize
  // with just the client-staged files (e.g. the pending new-expense form).
  let pendingSize = stagedFiles.reduce((s, f) => s + f.size, 0)
  const stagedTotal = existingCount + stagedFiles.length

  for (const file of incoming) {
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      rejection = { code: 'unsupportedType', name: file.name }
      continue
    }
    // `>=` not `>`: storage.rules uses strict `<` (request.resource.size <
    // 25 * 1024 * 1024), so a file of EXACTLY MAX_FILE_SIZE passes the
    // client but is rejected by the server with a misleading 403. Align here
    // so the user sees the specific "exceeds 25 MB" message instead.
    if (file.size >= maxFileBytes) {
      rejection = { code: 'exceedsLimit', name: file.name, maxBytes: maxFileBytes }
      continue
    }
    if (dedupe && stagedFiles.some((f) => f.name === file.name && f.size === file.size)) {
      continue
    }
    if (maxFiles !== undefined && stagedTotal + accepted.length >= maxFiles) {
      rejection = { code: 'maxFilesPerExpense', max: maxFiles }
      break
    }
    if (!skipHouseholdQuota && (householdStorageUsed as number) + pendingSize + file.size > (maxHouseholdBytes as number)) {
      rejection = { code: 'householdStorageLimit', maxBytes: maxHouseholdBytes as number }
      break
    }
    accepted.push(file)
    pendingSize += file.size
  }

  return { accepted, rejection }
}

/**
 * Expense-flow wrapper: caps at {@link MAX_FILES_PER_EXPENSE} and dedupes by
 * default. Prefer this over calling {@link validateAttachmentFiles} directly
 * in expense code paths so the cap is applied consistently without a
 * magic-number literal at every call site.
 */
export function validateExpenseAttachments(
  incoming: Iterable<File>,
  opts: Omit<AttachmentValidationOptions, 'maxFiles'>,
): AttachmentValidationResult {
  // Cast preserves the caller's discriminant (`skipHouseholdQuota`) through
  // the spread. TypeScript widens literal-union members to `boolean` across
  // `{ ...opts }`, which no longer matches either branch of the discriminated
  // union — the cast restores the tag without changing runtime behavior.
  return validateAttachmentFiles(
    incoming,
    { ...opts, maxFiles: MAX_FILES_PER_EXPENSE } as AttachmentValidationOptions,
  )
}

/**
 * Document-flow wrapper: no per-folder file cap, no dedupe (uploads of a
 * file with the same name + size are intentionally allowed — the user may
 * be re-uploading a revision).
 */
export function validateDocumentFiles(
  incoming: Iterable<File>,
  opts: Omit<AttachmentValidationOptions, 'maxFiles' | 'dedupe'>,
): AttachmentValidationResult {
  return validateAttachmentFiles(
    incoming,
    { ...opts, dedupe: false } as AttachmentValidationOptions,
  )
}

/**
 * One source of truth for rejection → i18n key. Exported so a test can
 * assert every locale file contains every key (so renaming an entry in
 * en.json without updating the other locales breaks CI rather than
 * silently falling back to the key string at runtime).
 */
export const REJECTION_MESSAGE_KEYS = {
  unsupportedType: 'files.unsupportedType',
  exceedsLimit: 'files.exceedsLimit',
  maxFilesPerExpense: 'files.maxFilesPerExpense',
  householdStorageLimit: 'files.householdStorageLimit',
} as const satisfies Record<AttachmentRejection['code'], string>

/** Translate a rejection reason into the user-facing string via i18next. */
export function rejectionMessage(t: TFunction, reason: AttachmentRejection): string {
  switch (reason.code) {
    case 'unsupportedType':
      return t(REJECTION_MESSAGE_KEYS.unsupportedType, { name: reason.name })
    case 'exceedsLimit':
      return t(REJECTION_MESSAGE_KEYS.exceedsLimit, { name: reason.name })
    case 'maxFilesPerExpense':
      return t(REJECTION_MESSAGE_KEYS.maxFilesPerExpense, { max: reason.max })
    case 'householdStorageLimit':
      return t(REJECTION_MESSAGE_KEYS.householdStorageLimit, {
        size: formatFileSize(reason.maxBytes, 0),
      })
  }
}

/**
 * Error subclass so context-layer throws can be distinguished from generic
 * Firebase/network failures and translated with the same reason catalog.
 */
export class AttachmentValidationError extends Error {
  readonly reason: AttachmentRejection
  constructor(reason: AttachmentRejection) {
    super(debugMessage(reason))
    // Explicit assignment rather than a `public readonly` parameter property:
    // tsconfig enables `erasableSyntaxOnly`, which forbids parameter
    // properties because they require emitted runtime code.
    this.name = 'AttachmentValidationError'
    this.reason = reason
  }
}

function debugMessage(reason: AttachmentRejection): string {
  switch (reason.code) {
    case 'unsupportedType':
      return `Unsupported file type: ${reason.name}`
    case 'exceedsLimit':
      return `"${reason.name}" exceeds ${formatFileSize(reason.maxBytes, 0)} limit`
    case 'maxFilesPerExpense':
      return `Maximum ${reason.max} files per expense`
    case 'householdStorageLimit':
      return `Household storage limit reached (${formatFileSize(reason.maxBytes, 0)})`
  }
}
