import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDocuments } from '@/context/DocumentContext'
import { friendlyError } from '@/lib/utils'

const FOLDER_ICONS = ['📁', '📋', '🏦', '🛡️', '🔍', '🔨', '📦', '🏠', '💰', '📄', '🔑', '⚡']

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateFolderDialog({ open, onOpenChange }: CreateFolderDialogProps) {
  const { t } = useTranslation()
  const { addFolder } = useDocuments()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('📁')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setIcon('📁')
      setError('')
      setSaving(false)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setSaving(true)
    setError('')

    try {
      await addFolder(trimmed, icon, description.trim() || undefined)
      onOpenChange(false)
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
          <DialogTitle>{t('documents.newFolder')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">{t('documents.folderName')}</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('documents.folderNamePlaceholder')}
              autoFocus
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="folder-desc">{t('documents.descriptionOptional')}</Label>
            <Input
              id="folder-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('documents.descriptionPlaceholder')}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('documents.icon')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {FOLDER_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`h-9 w-9 rounded-lg text-lg flex items-center justify-center transition-colors cursor-pointer ${
                    icon === emoji
                      ? 'bg-primary/15 ring-2 ring-primary'
                      : 'bg-muted hover:bg-accent'
                  }`}
                  onClick={() => setIcon(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? t('common.creating') : t('documents.createFolder')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
