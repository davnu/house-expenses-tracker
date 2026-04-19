import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { AttachmentViewer } from './AttachmentViewer'
import type { Attachment } from '@/types/expense'

// ── Fake Image so tests can drive preload lifecycle events deterministically ──
type FakeImgRef = {
  src: string
  onload: (() => void) | null
  onerror: (() => void) | null
  decoding: string
}
let preloads: FakeImgRef[] = []

class FakeImage {
  constructor() {
    const ref: FakeImgRef = { src: '', onload: null, onerror: null, decoding: '' }
    preloads.push(ref)
    Object.defineProperty(this, 'src', { get: () => ref.src, set: (v: string) => { ref.src = v } })
    Object.defineProperty(this, 'onload', { get: () => ref.onload, set: (v) => { ref.onload = v as null | (() => void) } })
    Object.defineProperty(this, 'onerror', { get: () => ref.onerror, set: (v) => { ref.onerror = v as null | (() => void) } })
    Object.defineProperty(this, 'decoding', { get: () => ref.decoding, set: (v: string) => { ref.decoding = v } })
  }
  src!: string
  onload!: (() => void) | null
  onerror!: (() => void) | null
  decoding!: string
}

/** Resolve the preload record for a given URL (the most recently created). */
function preloadFor(url: string): FakeImgRef {
  for (let i = preloads.length - 1; i >= 0; i--) {
    if (preloads[i].src === url) return preloads[i]
  }
  throw new Error(`No preload created for ${url}. Created: ${preloads.map(p => p.src).join(', ')}`)
}

const IMAGES: Attachment[] = [
  { id: 'a', name: 'a.jpg', type: 'image/jpeg', size: 100, url: 'https://img/a.jpg', thumbnailUrl: 'https://img/a-thumb.jpg' },
  { id: 'b', name: 'b.jpg', type: 'image/jpeg', size: 100, url: 'https://img/b.jpg', thumbnailUrl: 'https://img/b-thumb.jpg' },
  { id: 'c', name: 'c.jpg', type: 'image/jpeg', size: 100, url: 'https://img/c.jpg' }, // no thumbnail
]

/** Mirrors real call-site pattern: parent conditionally renders the viewer. */
function Harness({
  attachments = IMAGES,
  initialIndex = 0,
}: {
  attachments?: Attachment[]
  initialIndex?: number
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(initialIndex)
  const [atts, setAtts] = useState(attachments)
  return (
    <div>
      {atts.map((a, i) => (
        <button key={a.id} onClick={() => { setIndex(i); setOpen(true) }}>
          open-{a.id}
        </button>
      ))}
      <button onClick={() => setAtts([...atts])}>remap</button>
      <button onClick={() => setAtts(atts.slice(0, 1))}>shrink</button>
      {open && (
        <AttachmentViewer
          attachments={atts}
          initialIndex={index}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function clickChevron(direction: 'next' | 'prev') {
  const cls = direction === 'next' ? '.lucide-chevron-right' : '.lucide-chevron-left'
  const btn = screen.getAllByRole('button').find((b) => b.querySelector(cls))
  if (!btn) throw new Error(`No ${direction} chevron`)
  fireEvent.click(btn)
}

function fireSwipe(surface: Element, dx: number) {
  fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(surface, { pointerId: 1, clientX: 100 + dx, clientY: 100 })
  fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100 + dx, clientY: 100 })
}

describe('AttachmentViewer', () => {
  beforeEach(() => {
    preloads = []
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  // ── Reopen correctness (the original reported bug) ──

  it('reopens at the requested image even when initialIndex is unchanged and user navigated internally', () => {
    render(<Harness />)

    fireEvent.click(screen.getByText('open-a'))
    expect(screen.getByText('1 / 3')).toBeTruthy()

    clickChevron('next')
    expect(screen.getByText('2 / 3')).toBeTruthy()

    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    fireEvent.click(screen.getByText('open-a'))
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })

  it('reopens correctly at a non-zero initialIndex', () => {
    render(<Harness />)

    fireEvent.click(screen.getByText('open-b'))
    clickChevron('next')
    expect(screen.getByText('3 / 3')).toBeTruthy()

    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    fireEvent.click(screen.getByText('open-b'))
    expect(screen.getByText('2 / 3')).toBeTruthy()
  })

  // ── Placeholder / load state ──

  it('shows a blurred thumbnail placeholder and removes the blur when the full image loads', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    const before = screen.getByTestId('attachment-viewer-image') as HTMLImageElement
    expect(before.getAttribute('src')).toBe('https://img/a-thumb.jpg')
    expect(before.className).toContain('blur-xl')
    expect(before.dataset.loaded).toBe('false')

    act(() => { preloadFor('https://img/a.jpg').onload?.() })

    const after = screen.getByTestId('attachment-viewer-image') as HTMLImageElement
    expect(after.getAttribute('src')).toBe('https://img/a.jpg')
    expect(after.className).not.toContain('blur-xl')
    expect(after.dataset.loaded).toBe('true')
  })

  it('skips the placeholder when no thumbnailUrl is available', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-c'))

    const img = screen.getByTestId('attachment-viewer-image') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://img/c.jpg')
    expect(img.className).not.toContain('blur-xl')
  })

  it('renders the error fallback when the full image fails to load', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    act(() => { preloadFor('https://img/a.jpg').onerror?.() })

    expect(screen.getByTestId('viewer-error')).toBeTruthy()
    expect(screen.queryByTestId('attachment-viewer-image')).toBeNull()
    // The Download-instead button should be reachable
    expect(screen.getByText(/Download instead/i)).toBeTruthy()
  })

  it('does NOT reset the loaded state when a realtime update re-memoizes attachments with the same contents', () => {
    // Regression guard for the bug I shipped in the first pass: depending on
    // the full `attachments` array caused the effect to re-fire on every
    // parent re-render, flashing the blur back on.
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    act(() => { preloadFor('https://img/a.jpg').onload?.() })
    expect((screen.getByTestId('attachment-viewer-image') as HTMLImageElement).dataset.loaded).toBe('true')

    const preloadsBefore = preloads.length

    // Parent re-renders with a new array reference (same content). Matches
    // DocumentsPage's useMemo re-firing on Firestore realtime updates.
    fireEvent.click(screen.getByText('remap'))

    const img = screen.getByTestId('attachment-viewer-image') as HTMLImageElement
    expect(img.dataset.loaded).toBe('true')
    expect(img.className).not.toContain('blur-xl')
    // No additional preloads fired for the current URL — array-ref churn is absorbed
    expect(preloads.length).toBe(preloadsBefore)
  })

  // ── Neighbour preload ──

  it('preloads next/prev on open so navigation feels instant', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    const urls = preloads.map((p) => p.src)
    expect(urls).toContain('https://img/a.jpg')
    expect(urls).toContain('https://img/b.jpg')
    expect(urls).toContain('https://img/c.jpg')
  })

  it('does not preload neighbours for a single-image viewer', () => {
    render(<Harness attachments={[IMAGES[0]]} />)
    fireEvent.click(screen.getByText('open-a'))

    const urls = preloads.map((p) => p.src)
    expect(urls).toEqual(['https://img/a.jpg'])
  })

  // ── Race: delayed onload from a previous image must not affect the new one ──

  it('ignores stale preload onload callbacks after the user has navigated', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    const aPreload = preloadFor('https://img/a.jpg')
    clickChevron('next')

    // A's onload arrives late — must be a no-op now that we're on B
    act(() => { aPreload.onload?.() })

    const img = screen.getByTestId('attachment-viewer-image') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://img/b-thumb.jpg')
    expect(img.dataset.loaded).toBe('false')
  })

  // ── Swipe gesture ──

  it('swiping left navigates to the next image, swiping right to the previous', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    const surface = screen.getByTestId('viewer-image-surface')
    fireSwipe(surface, -80)
    expect(screen.getByText('2 / 3')).toBeTruthy()

    fireSwipe(surface, 80)
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })

  it('ignores short swipes below the threshold', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    const surface = screen.getByTestId('viewer-image-surface')
    fireSwipe(surface, -20) // below 50px threshold
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })

  it('does not swipe-navigate when the motion is mostly vertical', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    const surface = screen.getByTestId('viewer-image-surface')
    fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 90, clientY: 200 }) // mostly vertical
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 90, clientY: 200 })

    expect(screen.getByText('1 / 3')).toBeTruthy()
  })

  // ── Tap backdrop ──

  it('clicking the backdrop closes the viewer', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    const backdrop = screen.getByTestId('viewer-backdrop')
    fireEvent.click(backdrop)
    expect(screen.queryByTestId('attachment-viewer')).toBeNull()
  })

  it('clicking the image itself does NOT close the viewer', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    const img = screen.getByTestId('attachment-viewer-image')
    fireEvent.click(img)
    expect(screen.getByTestId('attachment-viewer')).toBeTruthy()
  })

  // ── Double-tap zoom ──

  it('double-tapping the image toggles zoom on and off', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))
    const surface = screen.getByTestId('viewer-image-surface')

    const tap = () => {
      fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 })
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    }

    tap(); tap()
    expect((screen.getByTestId('attachment-viewer-image') as HTMLImageElement).dataset.zoomed).toBe('true')

    tap(); tap()
    expect((screen.getByTestId('attachment-viewer-image') as HTMLImageElement).dataset.zoomed).toBe('false')
  })

  it('disables swipe-to-navigate while zoomed (drag becomes pan)', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))
    const surface = screen.getByTestId('viewer-image-surface')

    // Double tap to zoom
    fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    expect((screen.getByTestId('attachment-viewer-image') as HTMLImageElement).dataset.zoomed).toBe('true')

    // A large horizontal drag should pan, not navigate
    fireSwipe(surface, -200)
    expect(screen.getByText('1 / 3')).toBeTruthy() // still on first image
  })

  // ── Attachments array shrinks under us ──

  it('clamps or closes when the attachments array shrinks below the current index', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-b')) // index 1
    expect(screen.getByText('2 / 3')).toBeTruthy()

    // Another user deletes 2 of 3 images — array shrinks to 1
    fireEvent.click(screen.getByText('shrink'))

    // Viewer should clamp to last valid index (0) and keep working
    const img = screen.getByTestId('attachment-viewer-image') as HTMLImageElement
    expect(img.alt).toBe('a.jpg')
  })

  // ── Keyboard still works ──

  it('Arrow keys navigate and wrap around', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))

    act(() => { fireEvent.keyDown(document, { key: 'ArrowRight' }) })
    expect(screen.getByText('2 / 3')).toBeTruthy()

    act(() => { fireEvent.keyDown(document, { key: 'ArrowLeft' }) })
    act(() => { fireEvent.keyDown(document, { key: 'ArrowLeft' }) })
    expect(screen.getByText('3 / 3')).toBeTruthy()
  })

  it('Escape calls onClose', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open-a'))
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByTestId('attachment-viewer')).toBeNull()
  })

  // ── Loading spinner ──

  it('shows a delayed spinner if the image takes longer than the threshold to load', () => {
    vi.useFakeTimers()
    try {
      render(<Harness />)
      fireEvent.click(screen.getByText('open-a'))
      expect(screen.queryByTestId('viewer-spinner')).toBeNull()

      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByTestId('viewer-spinner')).toBeTruthy()

      act(() => { preloadFor('https://img/a.jpg').onload?.() })
      expect(screen.queryByTestId('viewer-spinner')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not show the spinner if the image loads before the delay threshold', () => {
    vi.useFakeTimers()
    try {
      render(<Harness />)
      fireEvent.click(screen.getByText('open-a'))

      // Finish loading quickly, before the 250ms threshold
      act(() => { preloadFor('https://img/a.jpg').onload?.() })
      act(() => { vi.advanceTimersByTime(500) })

      expect(screen.queryByTestId('viewer-spinner')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  // ── Housekeeping ──

  it('clamps an out-of-bounds initialIndex to the last valid image', () => {
    render(<AttachmentViewer attachments={IMAGES} initialIndex={99} onClose={() => {}} />)
    const img = screen.getByTestId('attachment-viewer-image') as HTMLImageElement
    expect(img.alt).toBe('c.jpg')
  })

  it('calls onClose when the attachments array is empty', () => {
    const onClose = vi.fn()
    render(<AttachmentViewer attachments={[]} initialIndex={0} onClose={onClose} />)
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByTestId('attachment-viewer-image')).toBeNull()
  })

  it('hides chevrons for single-image viewers and arrow keys are no-ops', () => {
    render(<Harness attachments={[IMAGES[0]]} />)
    fireEvent.click(screen.getByText('open-a'))

    const chevrons = screen.queryAllByRole('button').filter((b) =>
      b.querySelector('.lucide-chevron-left') || b.querySelector('.lucide-chevron-right')
    )
    expect(chevrons).toHaveLength(0)

    act(() => { fireEvent.keyDown(document, { key: 'ArrowRight' }) })
    expect(screen.getByTestId('attachment-viewer-image')).toBeTruthy()
  })
})
