import { useState, useEffect, useCallback } from 'react'
import { Download, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Attachment } from '@/types/expense'

interface AttachmentViewerProps {
  attachments: Attachment[] // only images
  initialIndex?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AttachmentViewer({ attachments, initialIndex = 0, open, onOpenChange }: AttachmentViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  const attachment = attachments[currentIndex]
  const hasMultiple = attachments.length > 1

  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : attachments.length - 1))
  }, [attachments.length])

  const next = useCallback(() => {
    setCurrentIndex((i) => (i < attachments.length - 1 ? i + 1 : 0))
  }, [attachments.length])

  const download = useCallback(() => {
    if (!attachment?.url) return
    const a = document.createElement('a')
    a.href = attachment.url
    a.download = attachment.name
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }, [attachment])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft' && hasMultiple) prev()
      if (e.key === 'ArrowRight' && hasMultiple) next()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, close, prev, next, hasMultiple])

  if (!open || !attachment?.url) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 text-white/80">
        <span className="text-sm truncate">{attachment.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={download}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={close}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center relative min-h-0 px-2 sm:px-14">
        {hasMultiple && (
          <button
            onClick={prev}
            className="absolute left-2 p-2 rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-black/60 transition-colors cursor-pointer z-10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-w-[90vw] max-h-[85vh] object-contain"
        />

        {hasMultiple && (
          <button
            onClick={next}
            className="absolute right-2 p-2 rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-black/60 transition-colors cursor-pointer z-10"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Counter */}
      {hasMultiple && (
        <div className="flex items-center justify-center py-3 text-white/50 text-sm">
          {currentIndex + 1} / {attachments.length}
        </div>
      )}
    </div>
  )
}
