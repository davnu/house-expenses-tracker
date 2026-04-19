/**
 * Shared test helpers for constructing mock File objects.
 *
 * Centralised so the "override .size without allocating 46 MB of memory"
 * trick lives in exactly one place. Every attachment test file imports
 * these instead of redefining local copies.
 */

/**
 * Create a File with real bytes. Use when the size is small (< ~1 MB) and
 * you care about content. For large files, prefer {@link sizedFile}.
 */
export function makeFile(name: string, type: string, size = 1024): File {
  return new File([new ArrayBuffer(size)], name, { type })
}

/**
 * Create a File that *reports* `size` bytes without actually allocating
 * them. Essential for quota-boundary tests — allocating 46 MB of zero-bytes
 * per test would OOM the Vitest worker.
 *
 * Uses `Object.defineProperty` because `File.size` is a read-only getter
 * in browsers and jsdom; overriding it directly would throw.
 */
export function sizedFile(name: string, type: string, size: number): File {
  const f = new File([''], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}
