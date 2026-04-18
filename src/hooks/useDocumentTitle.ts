import { useLayoutEffect } from 'react'

/**
 * Sets document.title before paint. useLayoutEffect runs before useAnalytics'
 * useEffect, so the pageview we send to Umami picks up the fresh title.
 */
export function useDocumentTitle(title: string): void {
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    if (document.title === title) return
    document.title = title
  }, [title])
}
