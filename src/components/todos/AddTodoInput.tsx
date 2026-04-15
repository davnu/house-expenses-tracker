import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTodos } from '@/context/TodoContext'

export function AddTodoInput() {
  const { t } = useTranslation()
  const { addTodo } = useTodos()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const title = value.trim()
    if (!title) return
    setError(null)
    try {
      await addTodo(title)
      setValue('')
    } catch {
      setError(t('todos.failedToAdd'))
    }
  }

  return (
    <div className="relative">
      <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleSubmit()
          }
        }}
        placeholder={t('todos.addPlaceholder')}
        className="w-full pl-8 pr-3 py-2 text-sm bg-transparent border-b border-dashed border-border placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none transition-colors"
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}
