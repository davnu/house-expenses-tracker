import { describe, it, expect, vi, afterEach } from 'vitest'
import { getDueStatus, sortTodos, getTodoProgress } from './todo-utils'
import type { Todo } from '@/types/todo'

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: crypto.randomUUID(),
    title: 'Test task',
    completed: false,
    sortOrder: 0,
    createdBy: 'user1',
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
    ...overrides,
  }
}

describe('getDueStatus', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "none" when no due date', () => {
    expect(getDueStatus()).toBe('none')
    expect(getDueStatus(undefined)).toBe('none')
  })

  it('returns "overdue" for past dates', () => {
    vi.useFakeTimers({ now: new Date('2026-04-15') })
    expect(getDueStatus('2026-04-14')).toBe('overdue')
    expect(getDueStatus('2026-01-01')).toBe('overdue')
  })

  it('returns "due_today" for today', () => {
    vi.useFakeTimers({ now: new Date('2026-04-15') })
    expect(getDueStatus('2026-04-15')).toBe('due_today')
  })

  it('returns "due_soon" for next 1-2 days', () => {
    vi.useFakeTimers({ now: new Date('2026-04-15') })
    expect(getDueStatus('2026-04-16')).toBe('due_soon')
    expect(getDueStatus('2026-04-17')).toBe('due_soon')
  })

  it('returns "upcoming" for dates 3+ days away', () => {
    vi.useFakeTimers({ now: new Date('2026-04-15') })
    expect(getDueStatus('2026-04-18')).toBe('upcoming')
    expect(getDueStatus('2026-12-31')).toBe('upcoming')
  })
})

describe('sortTodos', () => {
  it('puts incomplete before completed', () => {
    const todos = [
      makeTodo({ id: 'done', completed: true, completedAt: '2026-04-10T12:00:00Z' }),
      makeTodo({ id: 'pending', completed: false }),
    ]
    const sorted = sortTodos(todos)
    expect(sorted[0].id).toBe('pending')
    expect(sorted[1].id).toBe('done')
  })

  it('sorts incomplete by sortOrder ascending', () => {
    const todos = [
      makeTodo({ id: 'b', sortOrder: 2 }),
      makeTodo({ id: 'a', sortOrder: 0 }),
      makeTodo({ id: 'c', sortOrder: 1 }),
    ]
    const sorted = sortTodos(todos)
    expect(sorted.map((t) => t.id)).toEqual(['a', 'c', 'b'])
  })

  it('sorts incomplete by createdAt when sortOrder is equal', () => {
    const todos = [
      makeTodo({ id: 'b', sortOrder: 0, createdAt: '2026-04-11T00:00:00Z' }),
      makeTodo({ id: 'a', sortOrder: 0, createdAt: '2026-04-10T00:00:00Z' }),
    ]
    const sorted = sortTodos(todos)
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('sorts completed by completedAt descending (most recent first)', () => {
    const todos = [
      makeTodo({ id: 'old', completed: true, completedAt: '2026-04-08T00:00:00Z' }),
      makeTodo({ id: 'new', completed: true, completedAt: '2026-04-12T00:00:00Z' }),
    ]
    const sorted = sortTodos(todos)
    expect(sorted.map((t) => t.id)).toEqual(['new', 'old'])
  })
})

describe('getTodoProgress', () => {
  it('returns zeros for empty list', () => {
    expect(getTodoProgress([])).toEqual({ completed: 0, total: 0, percent: 0 })
  })

  it('calculates correct progress', () => {
    const todos = [
      makeTodo({ completed: true }),
      makeTodo({ completed: true }),
      makeTodo({ completed: false }),
      makeTodo({ completed: false }),
    ]
    expect(getTodoProgress(todos)).toEqual({ completed: 2, total: 4, percent: 50 })
  })

  it('returns 100% when all completed', () => {
    const todos = [
      makeTodo({ completed: true }),
      makeTodo({ completed: true }),
    ]
    expect(getTodoProgress(todos)).toEqual({ completed: 2, total: 2, percent: 100 })
  })

  it('returns 0% when none completed', () => {
    const todos = [makeTodo({ completed: false })]
    expect(getTodoProgress(todos)).toEqual({ completed: 0, total: 1, percent: 0 })
  })

  it('rounds percent to nearest integer', () => {
    const todos = [
      makeTodo({ completed: true }),
      makeTodo({ completed: false }),
      makeTodo({ completed: false }),
    ]
    expect(getTodoProgress(todos).percent).toBe(33) // 33.33 → 33
  })
})

describe('sortTodos — reorder scenarios', () => {
  it('preserves sort after reorder (sortOrder 0,1,2 → user drags 2 to 0)', () => {
    const todos = [
      makeTodo({ id: 'a', sortOrder: 0 }),
      makeTodo({ id: 'b', sortOrder: 1 }),
      makeTodo({ id: 'c', sortOrder: 2 }),
    ]
    // Simulate reorder: c moves to front
    todos[2].sortOrder = 0
    todos[0].sortOrder = 1
    todos[1].sortOrder = 2
    const sorted = sortTodos(todos)
    expect(sorted.map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('handles mixed completed and incomplete with varied sortOrders', () => {
    const todos = [
      makeTodo({ id: 'done1', completed: true, completedAt: '2026-04-09T00:00:00Z', sortOrder: 0 }),
      makeTodo({ id: 'active2', completed: false, sortOrder: 5 }),
      makeTodo({ id: 'active1', completed: false, sortOrder: 1 }),
      makeTodo({ id: 'done2', completed: true, completedAt: '2026-04-12T00:00:00Z', sortOrder: 3 }),
    ]
    const sorted = sortTodos(todos)
    // Incomplete first (by sortOrder: 1, 5), then completed (by completedAt desc: done2, done1)
    expect(sorted.map((t) => t.id)).toEqual(['active1', 'active2', 'done2', 'done1'])
  })

  it('handles single todo', () => {
    const todos = [makeTodo({ id: 'only' })]
    expect(sortTodos(todos).map((t) => t.id)).toEqual(['only'])
  })

  it('handles empty array', () => {
    expect(sortTodos([])).toEqual([])
  })
})
