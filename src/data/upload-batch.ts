/**
 * Upload N files in parallel with automatic cleanup on partial failure.
 *
 * **Why this exists.** `Promise.all` fails fast. If upload #2 of 3 rejects,
 * blob #1 is already in Firebase Storage but no Firestore record references
 * it — it becomes an orphan. Users don't notice, but the household storage
 * quota (computed client-side from attachment metadata) drifts away from
 * the actual Storage bytes, and the user's 50 MB cap silently shrinks over
 * time by exactly the orphaned amount.
 *
 * **What it does.** Runs uploads with `Promise.allSettled`, collects the
 * fulfilled results, and if any rejected: calls `cleanup` with the fulfilled
 * ones (best-effort — cleanup errors don't mask the original upload error)
 * before re-throwing the first upload failure.
 *
 * **What it doesn't do.** Within-item partial failures (e.g. main file
 * uploaded but thumbnail rejected) must be handled by the `uploadOne`
 * function itself — each per-item task must be atomic. See
 * `firebase-attachment-store.ts` for the delete helpers that make this
 * easy: a single `deleteAttachment(houseId, id, name)` call removes both
 * main + thumb blobs.
 */
export async function uploadBatchWithRollback<T, R>(
  items: readonly T[],
  uploadOne: (item: T) => Promise<R>,
  cleanup: (uploaded: R[]) => Promise<void>,
): Promise<R[]> {
  const settled = await Promise.allSettled(items.map((item) => uploadOne(item)))
  // Promise.allSettled unwraps the promise type to Awaited<R>; the predicate
  // must match that, not the raw R, under strict TS settings.
  const fulfilled = settled
    .filter((r): r is PromiseFulfilledResult<Awaited<R>> => r.status === 'fulfilled')
    .map((r) => r.value)
  const firstFailure = settled.find(
    (r) => r.status === 'rejected',
  ) as PromiseRejectedResult | undefined
  if (firstFailure) {
    // Best-effort: swallow cleanup errors so the caller sees the real upload
    // failure reason, not a secondary "couldn't clean up" message.
    await cleanup(fulfilled).catch(() => {})
    throw firstFailure.reason
  }
  return fulfilled
}
