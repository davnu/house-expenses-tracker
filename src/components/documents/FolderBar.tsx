import { useState, useCallback, type DragEvent } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import type { DocFolder } from '@/types/document'

interface FolderBarProps {
  folders: DocFolder[]
  currentFolderId: string
  onNavigate: (folderId: string) => void
  onMoveDocument?: (docId: string, targetFolderId: string) => void
}

export function FolderBar({ folders, currentFolderId, onNavigate, onMoveDocument }: FolderBarProps) {
  const isMobile = useIsMobile()
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const sortedFolders = [...folders].sort((a, b) => a.order - b.order)

  const handleDragOver = useCallback((e: DragEvent, folderId: string) => {
    if (!e.dataTransfer.types.includes('application/x-document-id')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetId(folderId)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    const related = e.relatedTarget
    const current = e.currentTarget
    if (related instanceof Node && current.contains(related)) return
    setDropTargetId(null)
  }, [])

  const handleDrop = useCallback(async (e: DragEvent, targetFolderId: string) => {
    e.preventDefault()
    setDropTargetId(null)
    const docId = e.dataTransfer.getData('application/x-document-id')
    if (!docId || !onMoveDocument) return
    try {
      await onMoveDocument(docId, targetFolderId)
    } catch {
      // Rolled back by context
    }
  }, [onMoveDocument])

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
      {sortedFolders.map((folder) => {
        const isCurrent = folder.id === currentFolderId
        const isTarget = dropTargetId === folder.id
        return (
          <button
            key={folder.id}
            type="button"
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer',
              isCurrent
                ? 'bg-primary text-primary-foreground'
                : isTarget
                  ? 'bg-primary/15 ring-2 ring-primary scale-105'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            onClick={() => { if (!isCurrent) onNavigate(folder.id) }}
            onDragOver={!isMobile && !isCurrent ? (e) => handleDragOver(e, folder.id) : undefined}
            onDragLeave={!isMobile ? handleDragLeave : undefined}
            onDrop={!isMobile && !isCurrent ? (e) => handleDrop(e, folder.id) : undefined}
          >
            <span>{folder.icon}</span>
            <span>{folder.name}</span>
          </button>
        )
      })}
    </div>
  )
}
