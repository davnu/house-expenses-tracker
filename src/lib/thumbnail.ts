/**
 * Client-side thumbnail generation using createImageBitmap + Canvas.
 *
 * Generates a small JPEG thumbnail from a File blob at upload time,
 * so document cards and attachment pills can display a ~3-8 KB image
 * instead of downloading the full multi-MB original from Firebase Storage.
 *
 * Uses createImageBitmap (not HTMLImageElement) for decoding because it:
 * - Decodes off the main thread — no UI freeze on large images
 * - Doesn't require URL.createObjectURL / revokeObjectURL
 * - Handles memory more efficiently than HTMLImageElement
 */

/** Image MIME types the browser Canvas can natively decode. */
const THUMBNAILABLE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/**
 * Generate a JPEG thumbnail from an image File.
 *
 * @param file      The source image file
 * @param maxSize   Longest-side pixel limit (default 160 — covers 44px cards at 3× retina + headroom)
 * @param quality   JPEG quality 0-1 (default 0.75 — good balance of size vs clarity)
 * @returns         A JPEG Blob (~3-8 KB), or `null` if the file isn't a thumbnailable image
 *
 * Never throws — returns `null` on any failure (corrupt file, unsupported format, etc.)
 */
export async function generateThumbnail(
  file: File,
  maxSize = 160,
  quality = 0.75,
): Promise<Blob | null> {
  if (!THUMBNAILABLE_TYPES.has(file.type)) return null

  try {
    // Decode off the main thread via createImageBitmap
    const bitmap = await createImageBitmap(file)

    const { width, height } = bitmap
    if (width === 0 || height === 0) {
      bitmap.close()
      return null
    }

    // Calculate scaled dimensions preserving aspect ratio
    let targetW: number
    let targetH: number
    if (width >= height) {
      targetW = Math.min(width, maxSize)
      targetH = Math.round((height / width) * targetW)
    } else {
      targetH = Math.min(height, maxSize)
      targetW = Math.round((width / height) * targetH)
    }

    // Draw onto canvas and export as JPEG
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close() // Free memory immediately

    return await canvasToBlob(canvas, 'image/jpeg', quality)
  } catch {
    return null
  }
}

/** Promise wrapper around canvas.toBlob. */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}
