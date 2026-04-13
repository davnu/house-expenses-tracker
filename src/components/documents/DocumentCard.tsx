import { useState, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Trash2, MoreVertical, Pencil, FolderInput, Loader2, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDocuments } from '@/context/DocumentContext'
import { useHousehold } from '@/context/HouseholdContext'
import { cn, getDateLocale } from '@/lib/utils'
import { getFileTypeInfo, isImageType } from '@/lib/file-type-info'
import { formatDistanceToNow, differenceInDays, format } from 'date-fns'
import type { HouseDocument } from '@/types/document'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSmartDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    const days = differenceInDays(new Date(), date)
    // Recent uploads: "2 hours ago", "yesterday"
    // Older documents: exact date (more useful for financial records)
    return days < 7
      ? formatDistanceToNow(date, { addSuffix: true })
      : format(date, 'MMM d, yyyy', { locale: getDateLocale() })
  } catch {
    return ''
  }
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
  const { t } = useTranslation()
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

  const typeInfo = getFileTypeInfo(document.type)
  const Icon = typeInfo.icon
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
        'group relative flex items-center gap-3 p-3 rounded-xl border bg-card transition-all',
        isPending ? 'opacity-60' : 'hover:bg-accent/50 hover:shadow-sm cursor-pointer'
      )}
      onClick={handleOpen}
    >
      {/* Thumbnail or color-coded icon */}
      <div className={cn(
        'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden transition-colors',
        isPending ? 'bg-muted' : typeInfo.bgColor
      )}>
        {isPending ? (
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        ) : document.thumbnailUrl ? (
          <img src={document.thumbnailUrl} alt="" className="h-11 w-11 object-cover rounded-xl" />
        ) : (
          <Icon className={cn('h-5 w-5', typeInfo.iconColor)} />
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{document.name}</p>
          {/* Extension badge — hidden when thumbnail provides visual context */}
          {typeInfo.label && !document.thumbnailUrl && (
            <span className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 leading-none',
              typeInfo.bgColor, typeInfo.iconColor
            )}>
              {typeInfo.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className="text-xs text-muted-foreground">
            {formatSize(document.size)}
            {uploaderName && <> &middot; {uploaderName}</>}
            {document.uploadedAt && (
              <> &middot; {formatSmartDate(document.uploadedAt)}</>
            )}
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
              placeholder={t('documents.addNote')}
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
              title={t('documents.download')}
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
                title={t('documents.more')}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(false) }} />
              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border bg-card shadow-lg py-1">
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
                    {t('documents.rename')}
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
                    {document.notes ? t('documents.editNote') : t('documents.addNoteAction')}
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
                    {t('documents.moveTo')}
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
                  {deleting ? t('common.deleting') : confirmDelete ? t('documents.confirmDelete') : t('common.delete')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
