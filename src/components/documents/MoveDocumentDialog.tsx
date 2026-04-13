import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDocuments } from '@/context/DocumentContext'
import { friendlyError } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { HouseDocument } from '@/types/document'

interface MoveDocumentDialogProps {
  document: HouseDocument | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MoveDocumentDialog({ document, open, onOpenChange }: MoveDocumentDialogProps) {
  const { t } = useTranslation()
  const { folders, moveDocument } = useDocuments()
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const otherFolders = folders
    .filter((f) => f.id !== document?.folderId)
    .sort((a, b) => a.order - b.order)

  const handleMove = async () => {
    if (!document || !selectedFolderId) return

    setSaving(true)
    setError('')

    try {
      await moveDocument(document.id, selectedFolderId)
      onOpenChange(false)
      setSelectedFolderId(null)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('documents.moveDocument', { name: document?.name })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('documents.selectDestination')}</p>

          <div className="space-y-1">
            {otherFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors cursor-pointer',
                  selectedFolderId === folder.id
                    ? 'bg-primary/10 ring-1 ring-primary text-primary font-medium'
                    : 'hover:bg-accent'
                )}
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <span className="text-lg">{folder.icon}</span>
                <span>{folder.name}</span>
              </button>
            ))}
          </div>

          {otherFolders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">{t('documents.noOtherFolders')}</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleMove} disabled={!selectedFolderId || saving}>
              {saving ? t('common.moving') : t('documents.move')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
