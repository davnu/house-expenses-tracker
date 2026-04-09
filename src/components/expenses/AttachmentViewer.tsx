import { useState, useEffect } from 'react'
import { Download, FileText, FileSpreadsheet, Image, ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Attachment } from '@/types/expense'

function fileIcon(type: string) {
  if (type.startsWith('image/')) return Image
  if (type.includes('spreadsheet') || type.includes('excel')) return FileSpreadsheet
  return FileText
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPreviewable(type: string) {
  return type.startsWith('image/') || type === 'application/pdf'
}

interface AttachmentViewerProps {
  attachments: Attachment[]
  initialIndex?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AttachmentViewer({ attachments, initialIndex = 0, open, onOpenChange }: AttachmentViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  const attachment = attachments[currentIndex]

  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  const download = () => {
    if (!attachment?.url) return
    const a = document.createElement('a')
    a.href = attachment.url
    a.download = attachment.name
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  const prev = () => setCurrentIndex((i) => (i > 0 ? i - 1 : attachments.length - 1))
  const next = () => setCurrentIndex((i) => (i < attachments.length - 1 ? i + 1 : 0))

  if (!attachment) return null

  const Icon = fileIcon(attachment.type)
  const canPreview = isPreviewable(attachment.type) && attachment.url

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onClose={() => onOpenChange(false)}
        className="max-w-2xl max-h-[90vh] flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{attachment.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatSize(attachment.size)}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Preview area */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-muted rounded-lg overflow-hidden relative">
          {canPreview ? (
            attachment.type.startsWith('image/') ? (
              <img
                src={attachment.url}
                alt={attachment.name}
                className="max-w-full max-h-[60vh] object-contain"
              />
            ) : (
              <iframe
                src={attachment.url}
                title={attachment.name}
                className="w-full h-[60vh] border-0"
              />
            )
          ) : (
            <div className="text-center py-16 space-y-3">
              <Icon className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Preview not available for this file type
              </p>
              <Button onClick={download} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download to view
              </Button>
            </div>
          )}
        </div>

        {/* Footer with navigation and download */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1">
            {attachments.length > 1 && (
              <>
                <Button size="icon" variant="ghost" onClick={prev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {currentIndex + 1} / {attachments.length}
                </span>
                <Button size="icon" variant="ghost" onClick={next}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          <Button onClick={download} size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
