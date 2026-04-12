import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDocuments } from '@/context/DocumentContext'
import { friendlyError } from '@/lib/utils'
import type { DocFolder } from '@/types/document'

const FOLDER_ICONS = ['📁', '📋', '🏦', '🛡️', '🔍', '🔨', '📦', '🏠', '💰', '📄', '🔑', '⚡']

interface RenameFolderDialogProps {
  folder: DocFolder | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RenameFolderDialog({ folder, open, onOpenChange }: RenameFolderDialogProps) {
  const { updateFolder } = useDocuments()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('📁')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (folder && open) {
      setName(folder.name)
      setDescription(folder.description ?? '')
      setIcon(folder.icon)
      setError('')
      setSaving(false)
    }
  }, [folder, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!folder) return
    const trimmed = name.trim()
    if (!trimmed) return

    setSaving(true)
    setError('')

    try {
      await updateFolder(folder.id, { name: trimmed, icon, description: description.trim() || undefined })
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
          <DialogTitle>Edit Folder</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-folder">Name</Label>
            <Input
              id="rename-folder"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-folder-desc">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="edit-folder-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What goes in this folder?"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
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
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
