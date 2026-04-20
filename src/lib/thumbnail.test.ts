import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFile } from '@/test-utils/files'

// Mock browser APIs: createImageBitmap + canvas
beforeEach(() => {
  vi.restoreAllMocks()

  // Mock createImageBitmap — returns a fake ImageBitmap with dimensions
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    close: vi.fn(),
  }))

  // Mock document.createElement for canvas
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (cb: BlobCallback) => cb(new Blob(['thumb-data'], { type: 'image/jpeg' })),
      } as unknown as HTMLCanvasElement
    }
    return origCreate(tag, options)
  })
})

import { generateThumbnail } from './thumbnail'

// ── Tests ──

describe('generateThumbnail', () => {
  it('returns null for non-image MIME types', async () => {
    expect(await generateThumbnail(makeFile('doc.pdf', 'application/pdf'))).toBeNull()
    expect(await generateThumbnail(makeFile('sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).toBeNull()
    expect(await generateThumbnail(makeFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBeNull()
  })

  it('returns null for HEIC/HEIF (Canvas cannot decode)', async () => {
    expect(await generateThumbnail(makeFile('photo.heic', 'image/heic'))).toBeNull()
    expect(await generateThumbnail(makeFile('photo.heif', 'image/heif'))).toBeNull()
  })

  it('returns a Blob for JPEG images', async () => {
    const blob = await generateThumbnail(makeFile('photo.jpg', 'image/jpeg'))
    expect(blob).toBeInstanceOf(Blob)
    expect(blob!.type).toBe('image/jpeg')
  })

  it('returns a Blob for PNG images', async () => {
    const blob = await generateThumbnail(makeFile('screenshot.png', 'image/png'))
    expect(blob).toBeInstanceOf(Blob)
  })

  it('returns a Blob for WebP images', async () => {
    const blob = await generateThumbnail(makeFile('image.webp', 'image/webp'))
    expect(blob).toBeInstanceOf(Blob)
  })

  it('returns a Blob for GIF images', async () => {
    const blob = await generateThumbnail(makeFile('animation.gif', 'image/gif'))
    expect(blob).toBeInstanceOf(Blob)
  })

  it('accepts custom maxSize and quality parameters', async () => {
    const blob = await generateThumbnail(makeFile('photo.jpg', 'image/jpeg'), 64, 0.5)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('closes the ImageBitmap after use', async () => {
    const closeFn = vi.fn()
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 400, height: 300, close: closeFn,
    } as unknown as ImageBitmap)

    await generateThumbnail(makeFile('photo.jpg', 'image/jpeg'))
    expect(closeFn).toHaveBeenCalledOnce()
  })

  // Regression: without resize options, the decoder materializes the full
  // bitmap in RGBA (~190 MB for a 48 MP file). The resize options tell the
  // decoder to downsample during decode, which is the only way to bound
  // peak memory on mobile for 25 MB-class camera photos.
  it('requests decoder-side resize at target size (mobile memory guard)', async () => {
    await generateThumbnail(makeFile('huge.jpg', 'image/jpeg'), 160)
    expect(createImageBitmap).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        resizeWidth: 160,
        resizeHeight: 160,
        resizeQuality: 'high',
      }),
    )
  })

  it('returns null and closes bitmap when dimensions are zero', async () => {
    const closeFn = vi.fn()
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 0, height: 0, close: closeFn,
    } as unknown as ImageBitmap)

    const blob = await generateThumbnail(makeFile('empty.png', 'image/png'))
    expect(blob).toBeNull()
    expect(closeFn).toHaveBeenCalledOnce()
  })

  it('returns null when createImageBitmap rejects (corrupt file)', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('Invalid image'))
    const blob = await generateThumbnail(makeFile('broken.jpg', 'image/jpeg'))
    expect(blob).toBeNull()
  })

  // ── Aspect ratio edge cases ──

  it('handles portrait images (height > width)', async () => {
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 400, height: 800, close: vi.fn(),
    } as unknown as ImageBitmap)

    const blob = await generateThumbnail(makeFile('portrait.jpg', 'image/jpeg'))
    expect(blob).toBeInstanceOf(Blob)
  })

  it('handles square images (width === height)', async () => {
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 500, height: 500, close: vi.fn(),
    } as unknown as ImageBitmap)

    const blob = await generateThumbnail(makeFile('square.jpg', 'image/jpeg'))
    expect(blob).toBeInstanceOf(Blob)
  })

  it('does not upscale images smaller than maxSize', async () => {
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 50, height: 30, close: vi.fn(),
    } as unknown as ImageBitmap)

    const blob = await generateThumbnail(makeFile('tiny.jpg', 'image/jpeg'))
    expect(blob).toBeInstanceOf(Blob)
  })

  // ── Canvas edge cases ──

  it('returns null and closes bitmap when getContext returns null', async () => {
    const closeFn = vi.fn()
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 400, height: 300, close: closeFn,
    } as unknown as ImageBitmap)

    // Override canvas mock to return null context
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => null,
          toBlob: vi.fn(),
        } as unknown as HTMLCanvasElement
      }
      return origCreate(tag, options)
    })

    const blob = await generateThumbnail(makeFile('photo.jpg', 'image/jpeg'))
    expect(blob).toBeNull()
    expect(closeFn).toHaveBeenCalledOnce()
  })

  it('returns null when toBlob callback receives null', async () => {
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 400, height: 300, close: vi.fn(),
    } as unknown as ImageBitmap)

    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (cb: BlobCallback) => cb(null), // toBlob returns null
        } as unknown as HTMLCanvasElement
      }
      return origCreate(tag, options)
    })

    const blob = await generateThumbnail(makeFile('photo.jpg', 'image/jpeg'))
    expect(blob).toBeNull()
  })

  // ── Type guard edge cases ──

  it('returns null for SVG (not in thumbnailable types)', async () => {
    expect(await generateThumbnail(makeFile('icon.svg', 'image/svg+xml'))).toBeNull()
  })

  it('returns null for BMP (not in thumbnailable types)', async () => {
    expect(await generateThumbnail(makeFile('image.bmp', 'image/bmp'))).toBeNull()
  })

  it('does not call createImageBitmap for non-thumbnailable types', async () => {
    await generateThumbnail(makeFile('doc.pdf', 'application/pdf'))
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
})
