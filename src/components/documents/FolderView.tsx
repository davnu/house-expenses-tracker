import { useState, useMemo, useEffect } from 'react'
import { ArrowLeft, Pencil, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DocumentCard } from './DocumentCard'
import { DocumentDropZone } from './DocumentDropZone'
import { MoveDocumentDialog } from './MoveDocumentDialog'
import { RenameFolderDialog } from './RenameFolderDialog'
import { FolderBar } from './FolderBar'
import { AttachmentViewer } from '@/components/expenses/AttachmentViewer'
import { useDocuments } from '@/context/DocumentContext'
import { friendlyError } from '@/lib/utils'
import type { DocFolder, HouseDocument } from '@/types/document'
import type { Attachment } from '@/types/expense'

interface FolderViewProps {
  folder: DocFolder
  onBack: () => void
  onNavigate: (folder: DocFolder) => void
}

export function FolderView({ folder, onBack, onNavigate }: FolderViewProps) {
  const { folders, documents, pendingDocumentIds, totalStorageUsed, uploadDocuments, renameDocument, updateDocumentNotes, deleteFolder, moveDocument } = useDocuments()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showDropZone, setShowDropZone] = useState(false)
  const [renamingDoc, setRenamingDoc] = useState<HouseDocument | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [movingDoc, setMovingDoc] = useState<HouseDocument | null>(null)
  const [editingFolder, setEditingFolder] = useState(false)
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false)
  const [deletingFolder, setDeletingFolder] = useState(false)

  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  // Reset all transient state when switching folders
  useEffect(() => {
    setUploading(false)
    setError('')
    setShowDropZone(false)
    setRenamingDoc(null)
    setRenameValue('')
    setMovingDoc(null)
    setEditingFolder(false)
    setConfirmDeleteFolder(false)
    setDeletingFolder(false)
    setViewerOpen(false)
    setViewerIndex(0)
  }, [folder.id])

  const folderDocs = useMemo(
    () => documents
      .filter((d) => d.folderId === folder.id)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [documents, folder.id]
  )

  const imageAttachments = useMemo(
    () => folderDocs
      .filter((d) => d.type.startsWith('image/') && d.url)
      .map((d): Attachment => ({ id: d.id, name: d.name, type: d.type, size: d.size, url: d.url })),
    [folderDocs]
  )

  const handleFilesSelected = async (files: File[]) => {
    setUploading(true)
    setError('')
    try {
      await uploadDocuments(folder.id, files)
      setShowDropZone(false)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setUploading(false)
    }
  }

  const handleRenameSubmit = async () => {
    if (!renamingDoc || !renameValue.trim()) return
    try {
      await renameDocument(renamingDoc.id, renameValue.trim())
      setRenamingDoc(null)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  const handleDeleteFolder = async () => {
    if (!confirmDeleteFolder) {
      setConfirmDeleteFolder(true)
      return
    }
    setDeletingFolder(true)
    try {
      await deleteFolder(folder.id)
      onBack()
    } catch (err) {
      setError(friendlyError(err))
      setDeletingFolder(false)
      setConfirmDeleteFolder(false)
    }
  }

  const handlePreview = (doc: HouseDocument) => {
    const idx = imageAttachments.findIndex((a) => a.id === doc.id)
    if (idx >= 0) {
      setViewerIndex(idx)
      setViewerOpen(true)
    }
  }

  const handleFolderNavigate = (folderId: string) => {
    const target = folders.find((f) => f.id === folderId)
    if (target) onNavigate(target)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{folder.icon}</span>
            <h2 className="text-lg font-semibold truncate">{folder.name}</h2>
            <span className="text-sm text-muted-foreground shrink-0">
              {folderDocs.length} file{folderDocs.length !== 1 ? 's' : ''}
            </span>
          </div>
          {folder.description && (
            <p className="text-xs text-muted-foreground mt-0.5 ml-8">{folder.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingFolder(true)} title="Edit folder">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${confirmDeleteFolder ? 'text-destructive' : ''}`}
            onClick={handleDeleteFolder}
            disabled={deletingFolder}
            title={confirmDeleteFolder ? 'Click again to confirm' : 'Delete folder'}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {confirmDeleteFolder && (
        <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
          Delete "{folder.name}" and all {folderDocs.length} document{folderDocs.length !== 1 ? 's' : ''} inside?{' '}
          <button className="font-medium underline cursor-pointer" onClick={handleDeleteFolder} disabled={deletingFolder}>
            {deletingFolder ? 'Deleting...' : 'Yes, delete'}
          </button>{' '}
          <button className="text-muted-foreground cursor-pointer" onClick={() => setConfirmDeleteFolder(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* Folder navigation bar */}
      {folders.length > 1 && (
        <FolderBar
          folders={folders}
          currentFolderId={folder.id}
          onNavigate={handleFolderNavigate}
          onMoveDocument={moveDocument}
        />
      )}

      {/* Upload area */}
      {showDropZone || folderDocs.length === 0 ? (
        <DocumentDropZone
          onFilesSelected={handleFilesSelected}
          totalStorageUsed={totalStorageUsed}
          disabled={uploading}
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowDropZone(true)} disabled={uploading}>
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Uploading...' : 'Upload Files'}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Rename inline */}
      {renamingDoc && (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-accent/30">
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenamingDoc(null) }}
            autoFocus
            className="flex-1 h-8 text-sm"
          />
          <Button size="sm" variant="default" onClick={handleRenameSubmit} className="h-8">Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setRenamingDoc(null)} className="h-8">Cancel</Button>
        </div>
      )}

      {/* Document list */}
      {folderDocs.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">Drop files above or browse to get started</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {folderDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              isPending={pendingDocumentIds.has(doc.id)}
              onRename={() => { setRenamingDoc(doc); setRenameValue(doc.name) }}
              onMove={() => setMovingDoc(doc)}
              onPreview={() => handlePreview(doc)}
              onNotesChange={(notes) => updateDocumentNotes(doc.id, notes)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <RenameFolderDialog folder={editingFolder ? folder : null} open={editingFolder} onOpenChange={setEditingFolder} />
      <MoveDocumentDialog document={movingDoc} open={!!movingDoc} onOpenChange={(open) => { if (!open) setMovingDoc(null) }} />
      <AttachmentViewer attachments={imageAttachments} initialIndex={viewerIndex} open={viewerOpen} onOpenChange={setViewerOpen} />
    </div>
  )
}
