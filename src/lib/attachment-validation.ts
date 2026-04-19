import type { TFunction } from 'i18next'
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE, MAX_FILES_PER_EXPENSE, MAX_HOUSEHOLD_STORAGE } from './constants'

export type AttachmentRejection =
  | { code: 'unsupportedType'; name: string }
  | { code: 'exceedsLimit'; name: string; maxBytes: number }
  | { code: 'maxFilesPerExpense'; max: number }
  | { code: 'householdStorageLimit'; maxBytes: number }

export interface AttachmentValidationOptions {
  /** Files already staged client-side (e.g. pending create form). Used for duplicate detection and quota accumulation. */
  stagedFiles?: readonly File[]
  /** Count of attachments already persisted on the target expense. */
  existingCount?: number
  /** Bytes currently used across the household (all expenses). */
  householdStorageUsed: number
  /** Per-expense max file count. Override for document flows. */
  maxFiles?: number
  /** Household-wide storage quota in bytes. Override for tests. */
  maxHouseholdBytes?: number
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
    householdStorageUsed,
    maxFiles = MAX_FILES_PER_EXPENSE,
    maxHouseholdBytes = MAX_HOUSEHOLD_STORAGE,
    maxFileBytes = MAX_FILE_SIZE,
    dedupe = true,
  } = opts

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
    // 10 * 1024 * 1024), so a file of EXACTLY MAX_FILE_SIZE passes the
    // client but is rejected by the server with a misleading 403. Align here
    // so the user sees the specific "exceeds 10 MB" message instead.
    if (file.size >= maxFileBytes) {
      rejection = { code: 'exceedsLimit', name: file.name, maxBytes: maxFileBytes }
      continue
    }
    if (dedupe && stagedFiles.some((f) => f.name === file.name && f.size === file.size)) {
      continue
    }
    if (stagedTotal + accepted.length >= maxFiles) {
      rejection = { code: 'maxFilesPerExpense', max: maxFiles }
      break
    }
    if (householdStorageUsed + pendingSize + file.size > maxHouseholdBytes) {
      rejection = { code: 'householdStorageLimit', maxBytes: maxHouseholdBytes }
      break
    }
    accepted.push(file)
    pendingSize += file.size
  }

  return { accepted, rejection }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

/** Translate a rejection reason into the user-facing string via i18next. */
export function rejectionMessage(t: TFunction, reason: AttachmentRejection): string {
  switch (reason.code) {
    case 'unsupportedType':
      return t('files.unsupportedType', { name: reason.name })
    case 'exceedsLimit':
      return t('files.exceedsLimit', { name: reason.name })
    case 'maxFilesPerExpense':
      return t('files.maxFilesPerExpense', { max: reason.max })
    case 'householdStorageLimit':
      return t('files.householdStorageLimit', { size: formatSize(reason.maxBytes) })
  }
}

/**
 * Error subclass so context-layer throws can be distinguished from generic
 * Firebase/network failures and translated with the same reason catalog.
 */
export class AttachmentValidationError extends Error {
  constructor(public readonly reason: AttachmentRejection) {
    super(debugMessage(reason))
    this.name = 'AttachmentValidationError'
  }
}

function debugMessage(reason: AttachmentRejection): string {
  switch (reason.code) {
    case 'unsupportedType':
      return `Unsupported file type: ${reason.name}`
    case 'exceedsLimit':
      return `"${reason.name}" exceeds ${formatSize(reason.maxBytes)} limit`
    case 'maxFilesPerExpense':
      return `Maximum ${reason.max} files per expense`
    case 'householdStorageLimit':
      return `Household storage limit reached (${formatSize(reason.maxBytes)})`
  }
}
