import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { useHousehold } from '@/context/HouseholdContext'
import { getDueStatus, type DueStatus } from '@/lib/todo-utils'
import { format, formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/utils'
import type { Todo } from '@/types/todo'

interface TodoItemProps {
  todo: Todo
  onToggle: () => void
  onClick: () => void
  isPending?: boolean
  isDraggable?: boolean
}

function DueDateBadge({ dueDate }: { dueDate: string }) {
  const { t } = useTranslation()
  const status = getDueStatus(dueDate)
  const label = status === 'due_today'
    ? t('todos.dueToday')
    : format(new Date(dueDate), 'MMM d', { locale: getDateLocale() })

  const variantMap: Record<DueStatus, { variant: 'destructive' | 'secondary' | 'outline'; className?: string }> = {
    overdue: { variant: 'destructive' },
    due_today: { variant: 'outline', className: 'border-amber-300 bg-amber-50 text-amber-800' },
    due_soon: { variant: 'outline' },
    upcoming: { variant: 'secondary' },
    none: { variant: 'secondary' },
  }

  const { variant, className } = variantMap[status]

  return (
    <Badge variant={variant} className={`text-[10px] px-1.5 py-0 shrink-0 ${className ?? ''}`}>
      {label}
    </Badge>
  )
}

// Sparkle particles that burst from checkbox on completion
function CelebrationBurst() {
  const particles = [
    { x: -12, y: -14, delay: 0 },
    { x: 14, y: -10, delay: 30 },
    { x: -8, y: 12, delay: 60 },
    { x: 12, y: 8, delay: 20 },
    { x: -14, y: 2, delay: 50 },
    { x: 6, y: -16, delay: 40 },
  ]

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Expanding ring */}
      <div
        className="absolute inset-0 rounded-full border-2 border-primary/40"
        style={{ animation: 'todo-celebrate-ring 400ms ease-out forwards' }}
      />
      {/* Sparkle dots */}
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-primary"
          style={{
            animation: `todo-sparkle 350ms ease-out ${p.delay}ms forwards`,
            transform: `translate(${p.x}px, ${p.y}px) scale(1)`,
          }}
        />
      ))}
    </div>
  )
}

function TodoCheckbox({ checked, onToggle, celebrating }: { checked: boolean; onToggle: () => void; celebrating: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="relative shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-full"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="block">
        <circle
          cx="10"
          cy="10"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={checked ? 'text-primary' : 'text-border group-hover/item:text-muted-foreground transition-colors'}
        />
        {checked && (
          <circle
            cx="10"
            cy="10"
            r="9"
            fill="currentColor"
            className="text-primary"
            style={{ animation: 'todo-check-fill 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards', transformOrigin: 'center' }}
          />
        )}
        {checked && (
          <polyline
            points="6 10.5 9 13.5 14 7"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 24,
              strokeDashoffset: 24,
              animation: 'todo-checkmark-draw 150ms ease-out 80ms forwards',
            }}
          />
        )}
      </svg>
      {celebrating && <CelebrationBurst />}
    </button>
  )
}

function CompletionInfo({ todo }: { todo: Todo }) {
  const { t } = useTranslation()
  const { members, getMemberName, getMemberColor } = useHousehold()
  const isMultiMember = members.length > 1

  if (!todo.completed || !todo.completedAt) return null

  const timeAgo = formatDistanceToNow(new Date(todo.completedAt), { addSuffix: true, locale: getDateLocale() })

  return (
    <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
      {isMultiMember && todo.completedBy && (
        <>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: getMemberColor(todo.completedBy) }}
          />
          <span>{t('todos.completedBy', { name: getMemberName(todo.completedBy) })}</span>
          <span>·</span>
        </>
      )}
      <span>{timeAgo}</span>
    </span>
  )
}

export function TodoItem({ todo, onToggle, onClick, isPending, isDraggable }: TodoItemProps) {
  const { members, getMemberColor, getMemberName } = useHousehold()
  const isMultiMember = members.length > 1
  const [celebrating, setCelebrating] = useState(false)
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => { if (celebrateTimer.current) clearTimeout(celebrateTimer.current) }
  }, [])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: todo.id,
    disabled: !isDraggable,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isPending ? 0.6 : 1,
    ...(isPending ? {} : { animation: 'fade-in 0.2s ease-out' }),
  }

  const handleToggle = () => {
    if (!todo.completed) {
      setCelebrating(true)
      try { navigator.vibrate?.(8) } catch { /* unsupported */ }
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current)
      celebrateTimer.current = setTimeout(() => setCelebrating(false), 500)
    }
    onToggle()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={`group/item flex items-center gap-2 py-2 rounded-md px-1 -mx-1 hover:bg-accent/50 transition-colors cursor-pointer ${isDragging ? 'z-10 shadow-md bg-card' : ''}`}
    >
      {/* Drag handle — only for incomplete, draggable items */}
      {isDraggable ? (
        <button
          type="button"
          className="shrink-0 cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover/item:opacity-40 focus-visible:opacity-40 transition-opacity p-0.5 -ml-1"
          aria-label="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ) : (
        <div className="w-0" />
      )}

      <TodoCheckbox checked={todo.completed} onToggle={handleToggle} celebrating={celebrating} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm truncate transition-all duration-150 ${
              todo.completed ? 'line-through text-muted-foreground/60' : 'text-foreground'
            }`}
          >
            {todo.title}
          </span>

          {todo.dueDate && !todo.completed && (
            <DueDateBadge dueDate={todo.dueDate} />
          )}

          {isMultiMember && todo.assignedTo && !todo.completed && (
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: getMemberColor(todo.assignedTo) }}
              title={getMemberName(todo.assignedTo)}
            />
          )}
        </div>

        {/* Completion info — only in completed section */}
        {todo.completed && !isPending && (
          <CompletionInfo todo={todo} />
        )}
      </div>
    </div>
  )
}
