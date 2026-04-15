import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import type { Todo } from '@/types/todo'
import type { ExpenseRepository } from '@/data/repository'
import { FirestoreRepository } from '@/data/firestore-repository'
import { db } from '@/data/firebase'
import { useAuth } from './AuthContext'
import { useHousehold } from './HouseholdContext'
import { sortTodos } from '@/lib/todo-utils'

interface TodoContextValue {
  todos: Todo[]
  loading: boolean
  pendingTodoIds: Set<string>
  addTodo: (title: string) => Promise<void>
  toggleTodo: (id: string) => Promise<void>
  updateTodo: (id: string, updates: Partial<Todo>) => Promise<void>
  deleteTodo: (id: string) => Promise<void>
  reorderTodos: (activeId: string, overId: string) => Promise<void>
}

const TodoContext = createContext<TodoContextValue | null>(null)

export function TodoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { house } = useHousehold()
  const [repo, setRepo] = useState<ExpenseRepository | null>(null)
  const [rawTodos, setRawTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingTodoIds, setPendingTodoIds] = useState<Set<string>>(new Set())

  const houseId = house?.id
  const todosRef = useRef(rawTodos)
  todosRef.current = rawTodos

  useEffect(() => {
    if (houseId) {
      setRepo(new FirestoreRepository(db, houseId))
    } else {
      setRepo(null)
      setRawTodos([])
      setLoading(false)
    }
  }, [houseId])

  // Real-time listener
  useEffect(() => {
    if (!houseId) {
      setLoading(false)
      return
    }

    setLoading(true)

    const unsub = onSnapshot(
      query(collection(db, 'houses', houseId, 'todos')),
      (snap) => {
        const serverTodos = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Todo)

        // Merge with pending placeholders (temp IDs not yet on server)
        setRawTodos((prev) => {
          const pendingDocs = prev.filter((t) => t.id.startsWith('temp-'))
          const serverIds = new Set(serverTodos.map((t) => t.id))
          const stillPending = pendingDocs.filter((t) => !serverIds.has(t.id))
          return [...serverTodos, ...stillPending]
        })
        setLoading(false)
      },
      () => {
        // Permission denied or network error — show the card anyway (empty state)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [houseId])

  const todos = useMemo(() => sortTodos(rawTodos), [rawTodos])

  const addTodo = useCallback(async (title: string) => {
    if (!repo || !user) return
    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const maxOrder = todosRef.current.reduce((max, t) => Math.max(max, t.sortOrder), -1)

    const tempTodo: Todo = {
      id: tempId,
      title,
      completed: false,
      sortOrder: maxOrder + 1,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    }

    setPendingTodoIds((prev) => new Set([...prev, tempId]))
    setRawTodos((prev) => [...prev, tempTodo])

    try {
      await repo.addTodo({
        title,
        completed: false,
        sortOrder: maxOrder + 1,
        createdBy: user.uid,
      })
      // onSnapshot will deliver the real document; remove temp
      setRawTodos((prev) => prev.filter((t) => t.id !== tempId))
    } catch (err) {
      setRawTodos((prev) => prev.filter((t) => t.id !== tempId))
      throw err
    } finally {
      setPendingTodoIds((prev) => {
        const next = new Set(prev)
        next.delete(tempId)
        return next
      })
    }
  }, [repo, user])

  const toggleTodo = useCallback(async (id: string) => {
    if (!repo || !user) return
    const todo = todosRef.current.find((t) => t.id === id)
    if (!todo) return

    const nowCompleting = !todo.completed
    const now = new Date().toISOString()

    // Optimistic update
    setRawTodos((prev) => prev.map((t) =>
      t.id === id
        ? {
            ...t,
            completed: nowCompleting,
            completedAt: nowCompleting ? now : undefined,
            completedBy: nowCompleting ? user.uid : undefined,
            updatedAt: now,
          }
        : t
    ))

    try {
      if (nowCompleting) {
        await repo.updateTodo(id, { completed: true, completedAt: now, completedBy: user.uid })
      } else {
        // completed: false is the source of truth; stale completedAt/completedBy are harmless
        await repo.updateTodo(id, { completed: false })
      }
    } catch (err) {
      // Rollback
      setRawTodos((prev) => prev.map((t) => t.id === id ? todo : t))
      throw err
    }
  }, [repo, user])

  const updateTodo = useCallback(async (id: string, updates: Partial<Todo>) => {
    if (!repo) return
    const previous = todosRef.current.find((t) => t.id === id)
    if (!previous) return

    setRawTodos((prev) => prev.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    ))

    try {
      await repo.updateTodo(id, updates)
    } catch (err) {
      setRawTodos((prev) => prev.map((t) => t.id === id ? previous : t))
      throw err
    }
  }, [repo])

  const deleteTodo = useCallback(async (id: string) => {
    if (!repo) return
    const todo = todosRef.current.find((t) => t.id === id)
    if (!todo) return

    setRawTodos((prev) => prev.filter((t) => t.id !== id))

    try {
      await repo.deleteTodo(id)
    } catch (err) {
      setRawTodos((prev) => [...prev, todo])
      throw err
    }
  }, [repo])

  const reorderTodos = useCallback(async (activeId: string, overId: string) => {
    if (!repo || activeId === overId) return

    // Work with incomplete todos only (completed are auto-sorted)
    const incompleteBefore = todosRef.current
      .filter((t) => !t.completed)
      .sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.createdAt.localeCompare(b.createdAt))

    const oldIndex = incompleteBefore.findIndex((t) => t.id === activeId)
    const newIndex = incompleteBefore.findIndex((t) => t.id === overId)
    if (oldIndex === -1 || newIndex === -1) return

    // Reorder array
    const reordered = [...incompleteBefore]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    // Assign new sortOrder values
    const updates: { id: string; sortOrder: number }[] = reordered
      .map((t, i) => ({ id: t.id, sortOrder: i }))
      .filter((entry, i) => incompleteBefore[i]?.id !== entry.id || incompleteBefore[i]?.sortOrder !== entry.sortOrder)

    if (updates.length === 0) return

    // Optimistic: apply new sort orders
    const previousTodos = [...todosRef.current]
    setRawTodos((prev) => {
      const orderMap = new Map(updates.map((u) => [u.id, u.sortOrder]))
      return prev.map((t) => orderMap.has(t.id) ? { ...t, sortOrder: orderMap.get(t.id)! } : t)
    })

    try {
      await Promise.all(updates.map((u) => repo.updateTodo(u.id, { sortOrder: u.sortOrder })))
    } catch {
      setRawTodos(previousTodos)
    }
  }, [repo])

  return (
    <TodoContext.Provider
      value={{ todos, loading, pendingTodoIds, addTodo, toggleTodo, updateTodo, deleteTodo, reorderTodos }}
    >
      {children}
    </TodoContext.Provider>
  )
}

export function useTodos() {
  const ctx = useContext(TodoContext)
  if (!ctx) throw new Error('useTodos must be used within TodoProvider')
  return ctx
}
