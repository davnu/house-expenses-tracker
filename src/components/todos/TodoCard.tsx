import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ListChecks } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { Card, CardContent } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress-ring'
import { useTodos } from '@/context/TodoContext'
import { getTodoProgress } from '@/lib/todo-utils'
import { AddTodoInput } from './AddTodoInput'
import { TodoItem } from './TodoItem'
import { EditTodoDialog } from './EditTodoDialog'
import type { Todo } from '@/types/todo'

const COLLAPSE_KEY = 'casatab:todo-collapsed'
const RECENTLY_COMPLETED_DELAY = 600

export function TodoCard() {
  const { t } = useTranslation()
  const { todos, loading, pendingTodoIds, toggleTodo, reorderTodos } = useTodos()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === 'true')
  const [showCompleted, setShowCompleted] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<Set<string>>(new Set())
  const completionTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSE_KEY, String(next))
  }

  const handleToggle = useCallback((todo: Todo) => {
    if (!todo.completed) {
      setRecentlyCompletedIds((prev) => new Set([...prev, todo.id]))
      const timer = setTimeout(() => {
        completionTimers.current.delete(timer)
        setRecentlyCompletedIds((prev) => {
          const next = new Set(prev)
          next.delete(todo.id)
          return next
        })
      }, RECENTLY_COMPLETED_DELAY)
      completionTimers.current.add(timer)
    }
    toggleTodo(todo.id)
  }, [toggleTodo])

  useEffect(() => {
    const timers = completionTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  const { incomplete, completed } = useMemo(() => {
    const inc: Todo[] = []
    const comp: Todo[] = []
    for (const todo of todos) {
      if (!todo.completed || recentlyCompletedIds.has(todo.id)) {
        inc.push(todo)
      } else {
        comp.push(todo)
      }
    }
    return { incomplete: inc, completed: comp }
  }, [todos, recentlyCompletedIds])

  const incompleteIds = useMemo(() => incomplete.map((t) => t.id), [incomplete])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      reorderTodos(active.id as string, over.id as string)
    }
  }, [reorderTodos])

  const progress = useMemo(() => getTodoProgress(todos), [todos])
  const hasAnyTodos = todos.length > 0
  const progressColor = progress.percent === 100 ? '#22c55e' : undefined

  if (loading) return null

  return (
    <>
      <Card className="print:hidden overflow-hidden">
        {/* Collapsed: compact clickable row. Expanded: full card. */}
        <button
          type="button"
          onClick={handleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('todos.expand') : t('todos.collapse')}
          className="flex items-center gap-3 w-full px-5 py-3.5 text-left cursor-pointer hover:bg-accent/40 transition-colors"
        >
          <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground">{t('todos.title')}</span>

          {hasAnyTodos && (
            <ProgressRing size={24} strokeWidth={2.5} percent={progress.percent} color={progressColor}>
              <span className="text-[8px] font-semibold text-muted-foreground">
                {t('todos.progress', { completed: progress.completed, total: progress.total })}
              </span>
            </ProgressRing>
          )}

          <ChevronRight className={`ml-auto h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${!collapsed ? 'rotate-90' : ''}`} />
        </button>

        {/* Expandable content */}
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}
        >
          <div className="overflow-hidden">
            <CardContent className="pt-0">
              <div className="space-y-1">
                <AddTodoInput />

                {hasAnyTodos && (
                  <>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext items={incompleteIds} strategy={verticalListSortingStrategy}>
                        <div className="mt-2 space-y-0.5">
                          {incomplete.map((todo) => (
                            <TodoItem
                              key={todo.id}
                              todo={todo}
                              onToggle={() => handleToggle(todo)}
                              onClick={() => setEditingTodo(todo)}
                              isPending={pendingTodoIds.has(todo.id)}
                              isDraggable={!todo.completed && !pendingTodoIds.has(todo.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {completed.length > 0 && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setShowCompleted(!showCompleted)}
                          aria-expanded={showCompleted}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          {showCompleted
                            ? t('todos.hideCompleted')
                            : t('todos.showCompleted', { count: completed.length })}
                        </button>

                        {showCompleted && (
                          <div className="mt-1 space-y-0.5">
                            {completed.map((todo) => (
                              <TodoItem
                                key={todo.id}
                                todo={todo}
                                onToggle={() => toggleTodo(todo.id)}
                                onClick={() => setEditingTodo(todo)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </div>
        </div>
      </Card>

      <EditTodoDialog todo={editingTodo} onOpenChange={(open) => { if (!open) setEditingTodo(null) }} />
    </>
  )
}
