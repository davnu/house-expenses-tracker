import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DocumentDropZone } from './DocumentDropZone'
import { useDocuments } from '@/context/DocumentContext'
import { friendlyError, cn } from '@/lib/utils'

interface QuickUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialFolderId?: string
}

export function QuickUploadDialog({ open, onOpenChange, initialFolderId }: QuickUploadDialogProps) {
  const { t } = useTranslation()
  const { folders, uploadDocuments } = useDocuments()
  const [files, setFiles] = useState<File[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const sortedFolders = [...folders].sort((a, b) => a.order - b.order)

  // Only reset when dialog opens — don't react to folder list changes while open
  useEffect(() => {
    if (!open) return
    setFiles([])
    setError('')
    setUploading(false)
    const defaultFolder = initialFolderId ?? folders.sort((a, b) => b.order - a.order)[0]?.id ?? null
    setSelectedFolderId(defaultFolder)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles])
    setError('')
  }

  const handleUpload = async () => {
    if (!selectedFolderId || files.length === 0) return
    if (!folders.some((f) => f.id === selectedFolderId)) {
      setError(t('documents.folderDeleted'))
      setSelectedFolderId(null)
      return
    }
    setUploading(true)
    setError('')

    try {
      await uploadDocuments(selectedFolderId, files)
      onOpenChange(false)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setUploading(false)
    }
  }

  const selectedFolder = folders.find((f) => f.id === selectedFolderId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('documents.uploadDocuments')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File selection */}
          <DocumentDropZone
            onFilesSelected={handleFilesSelected}
            disabled={uploading}
          />

          {/* Selected files preview */}
          {files.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {t('documents.filesSelected', { count: files.length })}
            </div>
          )}

          {/* Folder picker */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('documents.saveToFolder')}</p>
            <div className="flex flex-wrap gap-1.5">
              {sortedFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer',
                    selectedFolderId === folder.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => setSelectedFolderId(folder.id)}
                >
                  <span>{folder.icon}</span>
                  <span>{folder.name}</span>
                </button>
              ))}
            </div>
            {selectedFolder?.description && (
              <p className="text-xs text-muted-foreground">{selectedFolder.description}</p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFolderId || files.length === 0 || uploading}
            >
              {uploading ? t('common.uploading') : t('documents.uploadTo', { folder: selectedFolder?.name ?? 'folder' })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
