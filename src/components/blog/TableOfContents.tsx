import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { Heading } from '@/lib/blog'
import { ChevronDown } from 'lucide-react'

interface TableOfContentsProps {
  headings: Heading[]
}

/**
 * Desktop: sticky sidebar at top:5rem (below fixed header + progress bar).
 * Mobile: inline collapsible accordion above the article body.
 *
 * Uses native <a href="#id"> (not React Router <Link>) so the browser's
 * built-in anchor scrolling runs — combined with `scroll-margin-top: 5rem`
 * on .prose h2/h3 (in index.css), targets land cleanly below the header.
 */
export function TableOfContents({ headings }: TableOfContentsProps) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (headings.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        // Prefer the topmost heading currently in the "reading zone".
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        setActiveId(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    )
    for (const { id } of headings) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 2) return null

  return (
    <>
      {/* Mobile (inline accordion) */}
      <div className="lg:hidden mb-6 rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold cursor-pointer"
          aria-expanded={mobileOpen}
        >
          {t('blog.article.tableOfContents')}
          <ChevronDown className={cn('h-4 w-4 transition-transform', mobileOpen && 'rotate-180')} />
        </button>
        {mobileOpen && (
          <nav className="px-4 pb-4">
            <ul className="space-y-2 text-sm">
              {headings.map((h) => (
                <li key={h.id} className={cn('leading-snug', h.level === 3 && 'pl-4')}>
                  <a
                    href={`#${h.id}`}
                    onClick={() => setMobileOpen(false)}
                    className="text-muted-foreground hover:text-brand transition-colors"
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {/* Desktop (sticky sidebar) */}
      <aside className="hidden lg:block sticky top-24 self-start">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t('blog.article.tableOfContents')}
        </p>
        <nav>
          <ul className="space-y-2 text-sm border-l border-border/60">
            {headings.map((h) => {
              const isActive = activeId === h.id
              return (
                <li key={h.id} className={cn(h.level === 3 && 'pl-4')}>
                  <a
                    href={`#${h.id}`}
                    className={cn(
                      '-ml-px block border-l-2 pl-3 py-1 leading-snug transition-colors',
                      isActive
                        ? 'border-brand text-brand font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {h.text}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}
