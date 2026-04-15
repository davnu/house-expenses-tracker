import { isBefore, isToday, addDays, startOfDay } from 'date-fns'
import type { Todo } from '@/types/todo'

export type DueStatus = 'overdue' | 'due_today' | 'due_soon' | 'upcoming' | 'none'

export function getDueStatus(dueDate?: string): DueStatus {
  if (!dueDate) return 'none'
  const due = startOfDay(new Date(dueDate))
  const today = startOfDay(new Date())
  if (isBefore(due, today)) return 'overdue'
  if (isToday(due)) return 'due_today'
  if (isBefore(due, addDays(today, 3))) return 'due_soon'
  return 'upcoming'
}

export function sortTodos(todos: Todo[]): Todo[] {
  const incomplete = todos.filter((t) => !t.completed)
  const completed = todos.filter((t) => t.completed)

  incomplete.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.createdAt.localeCompare(b.createdAt)
  })

  completed.sort((a, b) => {
    const aAt = a.completedAt ?? a.updatedAt
    const bAt = b.completedAt ?? b.updatedAt
    return bAt.localeCompare(aAt) // most recently completed first
  })

  return [...incomplete, ...completed]
}

export function getTodoProgress(todos: Todo[]): { completed: number; total: number; percent: number } {
  const total = todos.length
  const completed = todos.filter((t) => t.completed).length
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) }
}
