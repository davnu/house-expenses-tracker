import { useCallback, useMemo } from 'react'
import { useDocuments } from '@/context/DocumentContext'
import { useEntitlement } from '@/hooks/use-entitlement'
import { maxBytesForLimits } from '@/lib/entitlement-limits'
import { MAX_FILES_PER_EXPENSE } from '@/lib/constants'
import { validateAttachmentFiles, type AttachmentValidationOptions, type AttachmentValidationResult } from '@/lib/attachment-validation'

export interface StorageQuota {
  /** Bytes currently consumed across expenses + documents (includes optimistic pending). */
  bytesUsed: number
  /** Bytes remaining under the tier cap. May be 0; never negative. */
  bytesRemaining: number
  /** Tier cap in bytes. */
  maxBytes: number
  /** Tier cap in megabytes (for display copy). */
  limitMB: number
  /** True while entitlement is still loading — UI should render skeleton / block uploads. */
  isLoading: boolean
  /** True when the house is on Pro. */
  isPro: boolean
  /**
   * Validate a batch against the tier's cap using the currently-known `bytesUsed`.
   * Thin wrapper around {@link validateAttachmentFiles} that fills in the two
   * fields every caller must otherwise remember (`householdStorageUsed`,
   * `maxHouseholdBytes`). Pass any other options you need (stagedFiles,
   * existingCount, maxFiles, dedupe).
   */
  validate: (
    files: Iterable<File>,
    opts?: Omit<AttachmentValidationOptions, 'householdStorageUsed' | 'maxHouseholdBytes'>,
  ) => AttachmentValidationResult
  /**
   * Expense-flow wrapper: applies `MAX_FILES_PER_EXPENSE` automatically so
   * the literal doesn't live at every call site. Kills a DRY regression that
   * crept in when FileDropZone + ExpenseList started calling `validate()`
   * directly and each had to remember to pass `maxFiles: MAX_FILES_PER_EXPENSE`.
   */
  validateExpenseAttachment: (
    files: Iterable<File>,
    opts?: Omit<AttachmentValidationOptions, 'householdStorageUsed' | 'maxHouseholdBytes' | 'maxFiles'>,
  ) => AttachmentValidationResult
}

/**
 * Single source of truth for storage-quota state across the app.
 *
 * Consolidates: current bytes used (expenses + documents), the tier's cap,
 * loading state, and the file-batch validator — so UI consumers don't each
 * hand-roll `limits.maxStorageMB * 1024 * 1024` and pass the wrong thing to
 * the validator. A prior bug capped Pro users at 50 MB because three
 * separate call sites independently forgot to pass `maxHouseholdBytes`.
 *
 * Must be called inside both `EntitlementProvider` and `DocumentProvider`
 * (the latter owns the combined expense+document byte count).
 */
export function useStorageQuota(): StorageQuota {
  const { totalStorageUsed } = useDocuments()
  const { limits, isPro, isLoading } = useEntitlement()
  const maxBytes = maxBytesForLimits(limits)
  const bytesRemaining = Math.max(0, maxBytes - totalStorageUsed)

  const validate = useCallback<StorageQuota['validate']>(
    (files, opts = {}) =>
      validateAttachmentFiles(files, {
        ...opts,
        householdStorageUsed: totalStorageUsed,
        maxHouseholdBytes: maxBytes,
      }),
    [totalStorageUsed, maxBytes],
  )

  const validateExpenseAttachment = useCallback<StorageQuota['validateExpenseAttachment']>(
    (files, opts = {}) =>
      validateAttachmentFiles(files, {
        ...opts,
        maxFiles: MAX_FILES_PER_EXPENSE,
        householdStorageUsed: totalStorageUsed,
        maxHouseholdBytes: maxBytes,
      }),
    [totalStorageUsed, maxBytes],
  )

  return useMemo(
    () => ({
      bytesUsed: totalStorageUsed,
      bytesRemaining,
      maxBytes,
      limitMB: limits.maxStorageMB,
      isLoading,
      isPro,
      validate,
      validateExpenseAttachment,
    }),
    [totalStorageUsed, bytesRemaining, maxBytes, limits.maxStorageMB, isLoading, isPro, validate, validateExpenseAttachment],
  )
}
