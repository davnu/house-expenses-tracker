import { describe, it, expect, vi } from 'vitest'
import { uploadBatchWithRollback } from './upload-batch'

describe('uploadBatchWithRollback', () => {
  it('resolves with all uploaded results when every item succeeds', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const result = await uploadBatchWithRollback(
      [1, 2, 3],
      async (n) => `item-${n}`,
      cleanup,
    )
    expect(result).toEqual(['item-1', 'item-2', 'item-3'])
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('calls cleanup with the fulfilled results and rethrows when any item fails', async () => {
    // Item 2 fails; items 1 and 3 already succeeded and must be cleaned up
    // so Firebase Storage doesn't retain the orphan blobs.
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const upload = vi.fn(async (n: number) => {
      if (n === 2) throw new Error('upload 2 failed')
      return `item-${n}`
    })

    await expect(
      uploadBatchWithRollback([1, 2, 3], upload, cleanup),
    ).rejects.toThrow('upload 2 failed')

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith(['item-1', 'item-3'])
  })

  it('rethrows the FIRST failure even when multiple items fail', async () => {
    // "First" by original order, not completion order. Predictable for
    // users who expect "first bad item" in the surface-level error message.
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const upload = vi.fn(async (n: number) => {
      if (n === 1) throw new Error('item 1 failed')
      if (n === 3) throw new Error('item 3 failed')
      return `item-${n}`
    })

    await expect(
      uploadBatchWithRollback([1, 2, 3], upload, cleanup),
    ).rejects.toThrow('item 1 failed')

    expect(cleanup).toHaveBeenCalledWith(['item-2'])
  })

  it('does NOT mask the original upload error when cleanup itself fails', async () => {
    // The whole point is surfacing the useful message ("exceeds 10 MB") to
    // the user. A secondary "couldn't clean up orphan" would drown it out.
    const cleanup = vi.fn().mockRejectedValue(new Error('storage unreachable'))
    const upload = vi.fn(async (n: number) => {
      if (n === 2) throw new Error('upload 2 failed')
      return `item-${n}`
    })

    await expect(
      uploadBatchWithRollback([1, 2, 3], upload, cleanup),
    ).rejects.toThrow('upload 2 failed')

    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('handles an empty items list (no uploads, no cleanup)', async () => {
    const cleanup = vi.fn()
    const upload = vi.fn()
    const result = await uploadBatchWithRollback([], upload, cleanup)
    expect(result).toEqual([])
    expect(upload).not.toHaveBeenCalled()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('cleanup is called even when ALL items fail (empty array passed)', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const upload = vi.fn(async () => { throw new Error('always fails') })

    await expect(
      uploadBatchWithRollback([1, 2], upload, cleanup),
    ).rejects.toThrow('always fails')

    // No successes to clean up — cleanup is still invoked with [] so the
    // caller could (for example) release a global spinner regardless.
    expect(cleanup).toHaveBeenCalledWith([])
  })
})
