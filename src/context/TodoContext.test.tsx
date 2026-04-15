import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Todo } from '@/types/todo'
import type { ReactNode } from 'react'

// ── Mocks (hoisted) ─────────────────────────────────

const { mockRepo, mockOnSnapshot } = vi.hoisted(() => {
  const mockRepo = {
    getExpenses: vi.fn(),
    addExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getMortgage: vi.fn(),
    saveMortgage: vi.fn(),
    deleteMortgage: vi.fn(),
    getBudget: vi.fn(),
    saveBudget: vi.fn(),
    deleteBudget: vi.fn(),
    getFolders: vi.fn(),
    addFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    getDocuments: vi.fn(),
    addDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getTodos: vi.fn(),
    addTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
  }
  return {
    mockRepo,
    // Capture onSnapshot callbacks so we can fire fake snapshots
    mockOnSnapshot: vi.fn(),
  }
})

// We need to store the snapshot callback so tests can fire it
let snapshotCallback: ((snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null = null

vi.mock('@/data/firestore-repository', () => ({
  FirestoreRepository: vi.fn().mockImplementation(function () { return mockRepo }),
}))

vi.mock('@/data/firebase', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  onSnapshot: vi.fn((_query: unknown, onNext: typeof snapshotCallback) => {
    snapshotCallback = onNext
    mockOnSnapshot()
    // Return unsubscribe fn
    return vi.fn()
  }),
  deleteField: vi.fn(() => '__DELETE_FIELD__'),
}))

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'alice' } }),
}))

vi.mock('./HouseholdContext', () => ({
  useHousehold: () => ({
    house: { id: 'house-1', name: 'Test House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
  }),
}))

import { TodoProvider, useTodos } from './TodoContext'

// ── Helpers ──────────────────────────────────────────

const seedTodos: Todo[] = [
  { id: 'todo-1', title: 'Get pre-approval', completed: false, sortOrder: 0, createdBy: 'alice', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' },
  { id: 'todo-2', title: 'Find notary', completed: false, sortOrder: 1, createdBy: 'alice', createdAt: '2026-04-02T00:00:00Z', updatedAt: '2026-04-02T00:00:00Z' },
  { id: 'todo-3', title: 'Schedule inspection', completed: true, completedAt: '2026-04-10T00:00:00Z', completedBy: 'alice', sortOrder: 2, createdBy: 'alice', createdAt: '2026-04-03T00:00:00Z', updatedAt: '2026-04-10T00:00:00Z' },
]

function wrapper({ children }: { children: ReactNode }) {
  return <TodoProvider>{children}</TodoProvider>
}

function fireSnapshot(todos: Todo[]) {
  if (!snapshotCallback) throw new Error('onSnapshot not called yet')
  snapshotCallback({
    docs: todos.map((t) => ({
      id: t.id,
      data: () => {
        const { id: _id, ...rest } = t
        return rest as Record<string, unknown>
      },
    })),
  })
}

async function setupHook(initialTodos = seedTodos) {
  const result = renderHook(() => useTodos(), { wrapper })
  // Fire initial snapshot to load data
  await act(async () => {
    fireSnapshot(initialTodos)
  })
  return result
}

// ── Tests ────────────────────────────────────────────

describe('TodoContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    mockRepo.addTodo.mockImplementation(async (input: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>) => ({
      id: 'real-todo-id',
      ...input,
      createdAt: '2026-04-15T10:00:00Z',
      updatedAt: '2026-04-15T10:00:00Z',
    }))
    mockRepo.updateTodo.mockImplementation(async (id: string, updates: Partial<Todo>) => ({
      ...seedTodos.find((t) => t.id === id),
      ...updates,
      updatedAt: '2026-04-15T11:00:00Z',
    }))
    mockRepo.deleteTodo.mockResolvedValue(undefined)
  })

  // ── Initial load ──────────────────────────────

  describe('initial load', () => {
    it('starts loading, then sets todos from onSnapshot', async () => {
      const { result } = renderHook(() => useTodos(), { wrapper })
      expect(result.current.loading).toBe(true)

      await act(async () => { fireSnapshot(seedTodos) })

      expect(result.current.loading).toBe(false)
      expect(result.current.todos).toHaveLength(3)
    })

    it('sorts todos: incomplete first, then completed', async () => {
      const { result } = await setupHook()

      const ids = result.current.todos.map((t) => t.id)
      // Incomplete (sortOrder 0, 1) then completed
      expect(ids).toEqual(['todo-1', 'todo-2', 'todo-3'])
    })
  })

  // ── addTodo ───────────────────────────────────

  describe('addTodo', () => {
    it('adds todo optimistically with temp ID, removes after server confirms', async () => {
      const { result } = await setupHook()
      expect(result.current.todos).toHaveLength(3)

      let addPromise: Promise<void>
      act(() => {
        addPromise = result.current.addTodo('Hire movers')
      })

      // Temp todo appears immediately
      expect(result.current.todos).toHaveLength(4)
      const temp = result.current.todos.find((t) => t.id.startsWith('temp-'))!
      expect(temp).toBeDefined()
      expect(temp.title).toBe('Hire movers')
      expect(temp.completed).toBe(false)
      expect(result.current.pendingTodoIds.has(temp.id)).toBe(true)

      await act(async () => { await addPromise! })

      // Temp removed (onSnapshot will deliver real one)
      expect(result.current.todos.some((t) => t.id.startsWith('temp-'))).toBe(false)
      expect(result.current.pendingTodoIds.size).toBe(0)
      expect(mockRepo.addTodo).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Hire movers',
        completed: false,
        createdBy: 'alice',
      }))
    })

    it('assigns sortOrder after the current max', async () => {
      const { result } = await setupHook()

      await act(async () => { await result.current.addTodo('New task') })

      const call = mockRepo.addTodo.mock.calls[0][0]
      expect(call.sortOrder).toBe(3) // max is 2 (todo-3), so new is 3
    })

    it('rolls back on error', async () => {
      mockRepo.addTodo.mockRejectedValueOnce(new Error('Network error'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.addTodo('Will fail') })
      ).rejects.toThrow('Network error')

      // Rolled back
      expect(result.current.todos).toHaveLength(3)
      expect(result.current.pendingTodoIds.size).toBe(0)
    })
  })

  // ── toggleTodo ────────────────────────────────

  describe('toggleTodo', () => {
    it('marks incomplete todo as completed optimistically', async () => {
      const { result } = await setupHook()

      let togglePromise: Promise<void>
      act(() => {
        togglePromise = result.current.toggleTodo('todo-1')
      })

      // Optimistic: completed immediately
      const toggled = result.current.todos.find((t) => t.id === 'todo-1')!
      expect(toggled.completed).toBe(true)
      expect(toggled.completedBy).toBe('alice')
      expect(toggled.completedAt).toBeDefined()

      await act(async () => { await togglePromise! })

      expect(mockRepo.updateTodo).toHaveBeenCalledWith('todo-1', expect.objectContaining({
        completed: true,
        completedBy: 'alice',
      }))
    })

    it('marks completed todo as incomplete optimistically', async () => {
      const { result } = await setupHook()

      let togglePromise: Promise<void>
      act(() => {
        togglePromise = result.current.toggleTodo('todo-3')
      })

      const toggled = result.current.todos.find((t) => t.id === 'todo-3')!
      expect(toggled.completed).toBe(false)
      expect(toggled.completedAt).toBeUndefined()
      expect(toggled.completedBy).toBeUndefined()

      await act(async () => { await togglePromise! })

      expect(mockRepo.updateTodo).toHaveBeenCalledWith('todo-3', { completed: false })
    })

    it('rolls back on error', async () => {
      mockRepo.updateTodo.mockRejectedValueOnce(new Error('Permission denied'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.toggleTodo('todo-1') })
      ).rejects.toThrow('Permission denied')

      // Rolled back to original state
      expect(result.current.todos.find((t) => t.id === 'todo-1')!.completed).toBe(false)
    })

    it('no-ops for non-existent todo', async () => {
      const { result } = await setupHook()

      await act(async () => { await result.current.toggleTodo('non-existent') })

      expect(mockRepo.updateTodo).not.toHaveBeenCalled()
    })
  })

  // ── updateTodo ────────────────────────────────

  describe('updateTodo', () => {
    it('applies updates optimistically', async () => {
      const { result } = await setupHook()

      let updatePromise: Promise<void>
      act(() => {
        updatePromise = result.current.updateTodo('todo-1', { title: 'Get mortgage pre-approval', dueDate: '2026-05-01' })
      })

      const updated = result.current.todos.find((t) => t.id === 'todo-1')!
      expect(updated.title).toBe('Get mortgage pre-approval')
      expect(updated.dueDate).toBe('2026-05-01')

      await act(async () => { await updatePromise! })

      expect(mockRepo.updateTodo).toHaveBeenCalledWith('todo-1', { title: 'Get mortgage pre-approval', dueDate: '2026-05-01' })
    })

    it('rolls back on error', async () => {
      mockRepo.updateTodo.mockRejectedValueOnce(new Error('Failed'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.updateTodo('todo-1', { title: 'Changed' }) })
      ).rejects.toThrow('Failed')

      expect(result.current.todos.find((t) => t.id === 'todo-1')!.title).toBe('Get pre-approval')
    })

    it('no-ops for non-existent todo', async () => {
      const { result } = await setupHook()

      await act(async () => { await result.current.updateTodo('ghost', { title: 'Nope' }) })

      expect(mockRepo.updateTodo).not.toHaveBeenCalled()
    })
  })

  // ── deleteTodo ────────────────────────────────

  describe('deleteTodo', () => {
    it('removes todo optimistically', async () => {
      const { result } = await setupHook()
      expect(result.current.todos).toHaveLength(3)

      let deletePromise: Promise<void>
      act(() => {
        deletePromise = result.current.deleteTodo('todo-2')
      })

      expect(result.current.todos).toHaveLength(2)
      expect(result.current.todos.some((t) => t.id === 'todo-2')).toBe(false)

      await act(async () => { await deletePromise! })

      expect(mockRepo.deleteTodo).toHaveBeenCalledWith('todo-2')
    })

    it('rolls back on error', async () => {
      mockRepo.deleteTodo.mockRejectedValueOnce(new Error('Delete failed'))
      const { result } = await setupHook()

      await expect(
        act(async () => { await result.current.deleteTodo('todo-2') })
      ).rejects.toThrow('Delete failed')

      expect(result.current.todos).toHaveLength(3)
      expect(result.current.todos.some((t) => t.id === 'todo-2')).toBe(true)
    })

    it('no-ops for non-existent todo', async () => {
      const { result } = await setupHook()

      await act(async () => { await result.current.deleteTodo('ghost') })

      expect(mockRepo.deleteTodo).not.toHaveBeenCalled()
      expect(result.current.todos).toHaveLength(3)
    })
  })

  // ── reorderTodos ──────────────────────────────

  describe('reorderTodos', () => {
    it('reorders incomplete todos and persists changed sortOrders', async () => {
      const { result } = await setupHook()

      // Move todo-2 (sortOrder 1) before todo-1 (sortOrder 0)
      await act(async () => { await result.current.reorderTodos('todo-2', 'todo-1') })

      // Verify the calls to updateTodo
      const calls = mockRepo.updateTodo.mock.calls
      // Both should be updated: todo-2 → sortOrder 0, todo-1 → sortOrder 1
      expect(calls).toHaveLength(2)
      expect(calls.some((c: unknown[]) => c[0] === 'todo-2' && (c[1] as { sortOrder: number }).sortOrder === 0)).toBe(true)
      expect(calls.some((c: unknown[]) => c[0] === 'todo-1' && (c[1] as { sortOrder: number }).sortOrder === 1)).toBe(true)
    })

    it('no-ops when activeId === overId', async () => {
      const { result } = await setupHook()

      await act(async () => { await result.current.reorderTodos('todo-1', 'todo-1') })

      expect(mockRepo.updateTodo).not.toHaveBeenCalled()
    })

    it('no-ops when IDs do not exist', async () => {
      const { result } = await setupHook()

      await act(async () => { await result.current.reorderTodos('ghost-a', 'ghost-b') })

      expect(mockRepo.updateTodo).not.toHaveBeenCalled()
    })

    it('rolls back on error', async () => {
      mockRepo.updateTodo.mockRejectedValueOnce(new Error('Network'))
      const { result } = await setupHook()

      const orderBefore = result.current.todos.filter((t) => !t.completed).map((t) => t.sortOrder)

      await act(async () => { await result.current.reorderTodos('todo-2', 'todo-1') })

      // Rolled back — original order restored
      const orderAfter = result.current.todos.filter((t) => !t.completed).map((t) => t.sortOrder)
      expect(orderAfter).toEqual(orderBefore)
    })

    it('ignores completed todos (only reorders incomplete)', async () => {
      const { result } = await setupHook()

      // todo-3 is completed — trying to reorder it should no-op
      await act(async () => { await result.current.reorderTodos('todo-3', 'todo-1') })

      expect(mockRepo.updateTodo).not.toHaveBeenCalled()
    })
  })

  // ── onSnapshot reconciliation ─────────────────

  describe('onSnapshot reconciliation', () => {
    it('merges server data with pending temp todos', async () => {
      const { result } = await setupHook()

      // Start adding a todo (will be pending)
      // Make addTodo hang to keep the temp in state
      mockRepo.addTodo.mockImplementation(() => new Promise(() => {}))

      act(() => {
        result.current.addTodo('Pending task')
      })

      expect(result.current.todos).toHaveLength(4)
      const tempId = result.current.todos.find((t) => t.id.startsWith('temp-'))!.id

      // Server snapshot arrives with the 3 originals (temp not yet on server)
      await act(async () => {
        fireSnapshot(seedTodos)
      })

      // Temp should still be in the list (merged with server data)
      expect(result.current.todos.some((t) => t.id === tempId)).toBe(true)
      expect(result.current.todos).toHaveLength(4)
    })
  })
})
