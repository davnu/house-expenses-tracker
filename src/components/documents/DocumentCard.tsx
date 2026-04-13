import { useState, useEffect, type ReactNode } from 'react'
import { FileText, Image, FileSpreadsheet, Download, Trash2, MoreVertical, Pencil, FolderInput, Loader2, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDocuments } from '@/context/DocumentContext'
import { useHousehold } from '@/context/HouseholdContext'
import { cn } from '@/lib/utils'
import type { HouseDocument } from '@/types/document'

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

function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

interface DocumentCardProps {
  document: HouseDocument
  isPending: boolean
  readOnly?: boolean
  onRename?: () => void
  onMove?: () => void
  onPreview: () => void
  onNotesChange?: (notes: string) => void
  folderBadge?: ReactNode
}

export function DocumentCard({ document, isPending, readOnly, onRename, onMove, onPreview, onNotesChange, folderBadge }: DocumentCardProps) {
  const { deleteDocument } = useDocuments()
  const { getMemberName } = useHousehold()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState(document.notes ?? '')

  // Sync notes with external changes (real-time updates from other tabs)
  useEffect(() => {
    if (!editingNotes) setNotesValue(document.notes ?? '')
  }, [document.notes, editingNotes])

  const Icon = fileIcon(document.type)
  const uploaderName = getMemberName(document.uploadedBy)

  const handleOpen = () => {
    if (isPending || !document.url || menuOpen || editingNotes) return
    if (isImageType(document.type)) {
      onPreview()
    } else if (document.type === 'application/pdf') {
      window.open(document.url, '_blank', 'noopener,noreferrer')
    } else {
      const a = window.document.createElement('a')
      a.href = document.url
      a.download = document.name
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
    }
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!document.url) return
    const a = window.document.createElement('a')
    a.href = document.url
    a.download = document.name
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    setMenuOpen(false)
    try {
      await deleteDocument(document.id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleNotesSave = () => {
    const trimmed = notesValue.trim()
    onNotesChange?.(trimmed)
    setEditingNotes(false)
  }

  const handleNotesCancel = () => {
    setNotesValue(document.notes ?? '')
    setEditingNotes(false)
  }

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors',
        isPending ? 'opacity-60' : 'hover:bg-accent/50 cursor-pointer'
      )}
      onClick={handleOpen}
    >
      {/* Thumbnail or icon */}
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {isPending ? (
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        ) : isImageType(document.type) && document.url ? (
          <img src={document.url} alt="" className="h-10 w-10 object-cover rounded-lg" />
        ) : (
          <Icon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{document.name}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {formatSize(document.size)}
            {uploaderName && <> &middot; {uploaderName}</>}
          </span>
          {folderBadge}
        </div>

        {/* Notes display / edit (not shown in readOnly mode) */}
        {!readOnly && editingNotes ? (
          <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
            <input
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNotesSave()
                if (e.key === 'Escape') handleNotesCancel()
              }}
              onBlur={handleNotesSave}
              autoFocus
              placeholder="Add a note..."
              className="text-xs bg-transparent border-b border-input focus:border-primary outline-none w-full py-0.5"
              maxLength={200}
            />
          </div>
        ) : !readOnly && document.notes ? (
          <p
            className="text-xs text-muted-foreground/70 truncate mt-0.5 hover:text-foreground cursor-text italic"
            onClick={(e) => {
              e.stopPropagation()
              setNotesValue(document.notes ?? '')
              setEditingNotes(true)
            }}
          >
            {document.notes}
          </p>
        ) : null}
      </div>

      {/* Actions */}
      {!isPending && (
        <div className="relative shrink-0">
          <div className={cn(
            'flex items-center gap-0.5',
            menuOpen ? '' : 'sm:opacity-0 sm:group-hover:opacity-100 transition-opacity'
          )}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDownload}
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen(!menuOpen)
                }}
                title="More"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(false) }} />
              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border bg-card shadow-lg py-1">
                {onRename && (
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      onRename()
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                )}
                {onNotesChange && (
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      setNotesValue(document.notes ?? '')
                      setEditingNotes(true)
                    }}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    {document.notes ? 'Edit note' : 'Add note'}
                  </button>
                )}
                {onMove && (
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      onMove()
                    }}
                  >
                    <FolderInput className="h-3.5 w-3.5" />
                    Move to...
                  </button>
                )}
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors cursor-pointer',
                    confirmDelete
                      ? 'text-destructive bg-destructive/10 font-medium'
                      : 'text-destructive hover:bg-destructive/5'
                  )}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? 'Deleting...' : confirmDelete ? 'Confirm delete' : 'Delete'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
