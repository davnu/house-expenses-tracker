import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Sticky 2-pixel progress bar pinned to the very top of the viewport. Sits
 * above the header (`z-[60]`) so it stays visible even when the auto-hide
 * header slides away — readers always see their progress while scrolling.
 *
 * Progress is measured against the article element (not
 * `window.scrollY / document.height`) so the sticky-header offset and the
 * related-articles section at the bottom don't skew the percentage.
 */
export function ReadingProgress({ articleRef }: { articleRef: RefObject<HTMLElement | null> }) {
  const { t } = useTranslation()
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    function update() {
      const el = articleRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewportH = window.innerHeight
      const total = rect.height - viewportH
      if (total <= 0) {
        setProgress(rect.bottom < viewportH ? 100 : 0)
        return
      }
      const scrolled = Math.min(Math.max(-rect.top, 0), total)
      setProgress((scrolled / total) * 100)
    }

    function onScroll() {
      if (raf.current !== null) return
      raf.current = requestAnimationFrame(() => {
        raf.current = null
        update()
      })
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [articleRef])

  const rounded = Math.round(progress)

  return (
    <div
      role="progressbar"
      aria-label={t('blog.article.readingProgress')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
      aria-valuetext={`${rounded}%`}
      className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-transparent pointer-events-none"
    >
      <div
        className="h-full bg-brand transition-[width] duration-75 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
