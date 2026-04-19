import { useState, useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, ChevronLeft, ChevronRight, X, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Attachment } from '@/types/expense'

interface AttachmentViewerProps {
  attachments: Attachment[] // only images
  initialIndex?: number
  /** Called when the user dismisses the viewer (Escape, X, backdrop tap). */
  onClose: () => void
}

const SWIPE_THRESHOLD_PX = 50
const DOUBLE_TAP_MS = 280
const ZOOMED_SCALE = 2.5
const SPINNER_DELAY_MS = 250

/**
 * Full-screen image viewer. Designed to be mounted only while open — the
 * parent renders `{open && <AttachmentViewer .../>}` so internal state
 * (current index, zoom, loaded flag) gets a fresh start on every open and
 * we never need an effect to sync props with state.
 */
export function AttachmentViewer({ attachments, initialIndex = 0, onClose }: AttachmentViewerProps) {
  const { t } = useTranslation()

  // Clamp in the initializer: if attachments is empty we bottom out at 0,
  // which is fine — we bail out to onClose below.
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(attachments.length - 1, 0))
  )

  const attachment = attachments[currentIndex]
  const hasMultiple = attachments.length > 1
  const currentUrl = attachment?.url

  // Transient per-image state. Reset via the React "storing information from
  // previous renders" pattern (https://react.dev/reference/react/useState):
  // compare a tracked key against the current URL *during render* and call
  // setState to schedule a re-render. React aborts the in-flight render and
  // replays with the fresh state — no effect needed, no setState-in-effect.
  const [trackedUrl, setTrackedUrl] = useState<string | undefined>(currentUrl)
  const [fullLoaded, setFullLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  if (trackedUrl !== currentUrl) {
    setTrackedUrl(currentUrl)
    setFullLoaded(false)
    setLoadError(false)
    setShowSpinner(false)
    setZoomed(false)
    setPan({ x: 0, y: 0 })
  }

  // ── Guard against the array shrinking while the viewer is open (another
  // member deletes an image mid-session). Clamp or close as appropriate.
  // The current-url reset above handles everything else.
  if (attachments.length === 0) {
    // Defer to effect: calling onClose during render would violate the rules
    // of render (cannot update parent state synchronously). The empty-state
    // render returns null below.
  } else if (currentIndex >= attachments.length) {
    setCurrentIndex(attachments.length - 1)
  }

  useEffect(() => {
    if (attachments.length === 0) onClose()
  }, [attachments.length, onClose])

  // ── Preload the current image (and run the delayed-spinner timer).
  // Keyed on the URL string only, so realtime Firestore updates that
  // re-memoize `attachments` with the same contents are invisible here.
  useEffect(() => {
    if (!currentUrl) return
    const spinnerTimer = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      window.clearTimeout(spinnerTimer)
      setFullLoaded(true)
      setShowSpinner(false)
    }
    img.onerror = () => {
      window.clearTimeout(spinnerTimer)
      setLoadError(true)
      setShowSpinner(false)
    }
    img.src = currentUrl

    return () => {
      window.clearTimeout(spinnerTimer)
      img.onload = null
      img.onerror = null
    }
  }, [currentUrl])

  // ── Neighbour preloading — keyed on URL strings so array-ref changes
  // that don't actually change neighbour URLs are no-ops (no spurious
  // network requests, no state churn). Fire-and-forget.
  const nextUrl = hasMultiple
    ? attachments[(currentIndex + 1) % attachments.length]?.url
    : undefined
  const prevUrl = hasMultiple
    ? attachments[(currentIndex - 1 + attachments.length) % attachments.length]?.url
    : undefined
  useEffect(() => {
    for (const url of [nextUrl, prevUrl]) {
      if (url && url !== currentUrl) {
        const p = new Image()
        p.decoding = 'async'
        p.src = url
      }
    }
  }, [nextUrl, prevUrl, currentUrl])

  // ── Navigation ──
  const prev = useCallback(() => {
    if (!hasMultiple) return
    setCurrentIndex((i) => (i > 0 ? i - 1 : attachments.length - 1))
  }, [attachments.length, hasMultiple])

  const next = useCallback(() => {
    if (!hasMultiple) return
    setCurrentIndex((i) => (i < attachments.length - 1 ? i + 1 : 0))
  }, [attachments.length, hasMultiple])

  const download = useCallback(() => {
    if (!attachment?.url) return
    const a = document.createElement('a')
    a.href = attachment.url
    a.download = attachment.name
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }, [attachment])

  // ── Keyboard ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasMultiple) prev()
      if (e.key === 'ArrowRight' && hasMultiple) next()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, prev, next, hasMultiple])

  // ── Swipe / tap / pan on the image area ──
  //
  // We use PointerEvents (the modern unified API covering touch, mouse,
  // pen). A single gesture is tracked: dx/dy travel determines swipe vs.
  // pan vs. tap; dt since last tap determines double-tap zoom toggle.
  const gestureRef = useRef<{
    startX: number
    startY: number
    startPanX: number
    startPanY: number
    pointerId: number
    moved: boolean
  } | null>(null)
  const lastTapRef = useRef(0)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Only primary pointer — ignore multi-touch (let the browser handle pinch)
    if (!e.isPrimary) return
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      pointerId: e.pointerId,
      moved: false,
    }
    if (zoomed) setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (!g || e.pointerId !== g.pointerId) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.moved && Math.hypot(dx, dy) > 6) g.moved = true

    if (zoomed) {
      setPan({ x: g.startPanX + dx, y: g.startPanY + dy })
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (!g || e.pointerId !== g.pointerId) { gestureRef.current = null; setDragging(false); return }
    gestureRef.current = null
    setDragging(false)

    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY

    // Tap (no meaningful movement)
    if (!g.moved) {
      const now = Date.now()
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        // Double tap: toggle zoom
        lastTapRef.current = 0
        setZoomed((z) => !z)
        setPan({ x: 0, y: 0 })
      } else {
        lastTapRef.current = now
      }
      return
    }

    // While zoomed, drag is panning — don't swipe-navigate
    if (zoomed) return

    // Horizontal swipe — threshold guards against accidental flicks
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next()
      else prev()
    }
  }

  // ── Backdrop close: clicking the dark area closes the viewer. Using
  // target===currentTarget ensures we only close when the click lands on
  // the backdrop itself, not bubbled from the image or a button.
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!attachment?.url) return null

  const showingThumb = !fullLoaded && !loadError && !!attachment.thumbnailUrl
  const displaySrc = showingThumb ? attachment.thumbnailUrl : attachment.url

  const imageStyle = zoomed
    ? {
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${ZOOMED_SCALE})`,
        transition: dragging ? 'none' : 'transform 180ms ease-out',
      }
    : { transform: 'translate(0, 0) scale(1)', transition: 'transform 180ms ease-out' }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col select-none"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      data-testid="attachment-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white/90 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm truncate flex-1 mr-2">{attachment.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={download}
            className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label={t('documents.download')}
            title={t('documents.download')}
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image area — backdrop click closes */}
      <div
        className="flex-1 flex items-center justify-center relative min-h-0"
        data-testid="viewer-backdrop"
        onClick={onBackdropClick}
      >
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-2 sm:left-4 p-2 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors cursor-pointer z-10 backdrop-blur"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Gesture surface: receives pointer events for swipe / tap / pan.
            touch-action:none lets us fully own single-touch gestures while
            still letting two-finger pinch fall through to the browser. */}
        <div
          className="relative flex items-center justify-center max-w-[92vw] max-h-[82vh]"
          style={{ touchAction: zoomed ? 'none' : 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { gestureRef.current = null; setDragging(false) }}
          data-testid="viewer-image-surface"
        >
          {loadError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-white/80" data-testid="viewer-error">
              <AlertCircle className="h-10 w-10 text-white/60" />
              <p className="text-sm text-center max-w-xs">{t('viewer.loadFailed')}</p>
              <button
                type="button"
                onClick={download}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors cursor-pointer"
              >
                <Download className="h-4 w-4" />
                {t('viewer.downloadInstead')}
              </button>
            </div>
          ) : (
            <img
              key={attachment.id}
              src={displaySrc}
              alt={attachment.name}
              decoding="async"
              // @ts-expect-error — fetchPriority is a valid React 19 prop; older @types/react may not type it
              fetchpriority="high"
              draggable={false}
              data-testid="attachment-viewer-image"
              data-loaded={fullLoaded ? 'true' : 'false'}
              data-zoomed={zoomed ? 'true' : 'false'}
              style={imageStyle}
              className={cn(
                'max-w-[92vw] max-h-[82vh] object-contain transition-[filter] duration-300',
                showingThumb && 'blur-xl',
                zoomed ? 'cursor-grab' : 'cursor-zoom-in',
              )}
            />
          )}

          {/* Delayed spinner — only appears if load takes > SPINNER_DELAY_MS */}
          {showSpinner && !fullLoaded && !loadError && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              data-testid="viewer-spinner"
              aria-hidden="true"
            >
              <Loader2 className="h-8 w-8 text-white/80 animate-spin drop-shadow" />
            </div>
          )}
        </div>

        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-2 sm:right-4 p-2 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors cursor-pointer z-10 backdrop-blur"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Counter */}
      {hasMultiple && (
        <div
          className="flex items-center justify-center py-3 text-white/80 text-xs font-medium shrink-0 tabular-nums"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="px-2.5 py-1 rounded-full bg-white/10">
            {currentIndex + 1} / {attachments.length}
          </span>
        </div>
      )}
    </div>
  )
}
