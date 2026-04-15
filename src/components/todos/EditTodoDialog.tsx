import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useHousehold } from '@/context/HouseholdContext'
import { useTodos } from '@/context/TodoContext'
import type { Todo } from '@/types/todo'

interface EditTodoDialogProps {
  todo: Todo | null
  onOpenChange: (open: boolean) => void
}

export function EditTodoDialog({ todo, onOpenChange }: EditTodoDialogProps) {
  const { t } = useTranslation()
  const { members } = useHousehold()
  const { updateTodo, deleteTodo } = useTodos()
  const isMultiMember = members.length > 1

  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync form state when a different todo is selected
  useEffect(() => {
    if (todo) {
      setTitle(todo.title)
      setDueDate(todo.dueDate ?? '')
      setAssignedTo(todo.assignedTo ?? '')
      setConfirmDelete(false)
      setError(null)
      setSaving(false)
    }
  }, [todo])

  const handleSave = async () => {
    if (!todo || !title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateTodo(todo.id, {
        title: title.trim(),
        dueDate: dueDate || undefined,
        assignedTo: assignedTo || undefined,
      })
      onOpenChange(false)
    } catch {
      setError(t('todos.failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!todo) return
    setSaving(true)
    try {
      await deleteTodo(todo.id)
      onOpenChange(false)
    } catch {
      setError(t('todos.failedToDelete'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!todo} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('todos.editTask')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="todo-title">{t('todos.taskName')}</Label>
            <Input
              id="todo-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="todo-due-date">{t('todos.dueDate')}</Label>
            <Input
              id="todo-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {isMultiMember && (
            <div className="space-y-2">
              <Label htmlFor="todo-assignee">{t('todos.assignee')}</Label>
              <Select
                id="todo-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">{t('todos.unassigned')}</option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>{m.displayName}</option>
                ))}
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            {!confirmDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                {t('todos.deleteTask')}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-destructive">{t('todos.deleteConfirm')}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {t('common.yes')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={saving}
                >
                  {t('common.no')}
                </Button>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
