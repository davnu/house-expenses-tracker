import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

// ── Mocks (hoisted) ──

const { mockExpenseCtx, mockHouseholdCtx } = vi.hoisted(() => ({
  mockExpenseCtx: {
    expenses: [] as Array<{
      id: string; amount: number; category: string; payer: string
      description: string; date: string; createdAt: string; updatedAt: string
    }>,
    deleteExpense: vi.fn(),
    addAttachmentsToExpense: vi.fn(),
    removeAttachment: vi.fn(),
    pendingExpenseIds: new Set<string>(),
    pendingAttachmentIds: new Set<string>(),
    storageUsed: 0,
  },
  mockHouseholdCtx: {
    members: [{ uid: 'user-1', displayName: 'Alice', email: 'a@test.com', color: '#3b82f6', role: 'owner', joinedAt: '' }],
    getMemberName: (uid: string) => uid === 'user-1' ? 'Alice' : uid,
    getMemberColor: () => '#3b82f6',
  },
}))

vi.mock('@/context/ExpenseContext', () => ({
  useExpenses: () => mockExpenseCtx,
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => mockHouseholdCtx,
}))

// Avoid Radix portal issues in jsdom
vi.mock('./AttachmentViewer', () => ({ AttachmentViewer: () => null }))
vi.mock('./EditExpenseDialog', () => ({ EditExpenseDialog: () => null }))

import { ExpenseList } from './ExpenseList'

// ── Helpers ──

function makeExpense(id: string, date = '2026-01-15') {
  return {
    id,
    amount: 100000,
    category: 'other' as const,
    payer: 'user-1',
    description: `Expense ${id}`,
    date,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  }
}

const TWO_EXPENSES = [makeExpense('expense-1'), makeExpense('expense-2', '2026-02-10')]

// ── Tests ──

describe('ExpenseList highlight behavior', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    scrollIntoViewSpy = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy as unknown as typeof HTMLElement.prototype.scrollIntoView
    mockExpenseCtx.expenses = TWO_EXPENSES
    mockExpenseCtx.pendingExpenseIds = new Set()
    mockExpenseCtx.pendingAttachmentIds = new Set()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('does nothing when highlightExpenseId is not provided', () => {
    render(<ExpenseList />)

    act(() => { vi.advanceTimersByTime(6000) })

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('scrolls to the target expense and calls onHighlightDone', () => {
    const onDone = vi.fn()

    render(<ExpenseList highlightExpenseId="expense-1" onHighlightDone={onDone} />)

    // Trigger requestAnimationFrame
    act(() => { vi.advanceTimersByTime(16) })

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })
    expect(onDone).not.toHaveBeenCalled()

    // Advance past highlight duration (3s)
    act(() => { vi.advanceTimersByTime(3000) })

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('calls onHighlightDone via fallback when the expense does not exist', () => {
    const onDone = vi.fn()

    render(<ExpenseList highlightExpenseId="nonexistent-id" onHighlightDone={onDone} />)

    // RAF fires but no matching row in the ref map
    act(() => { vi.advanceTimersByTime(16) })
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()

    // Fallback fires after 5s
    act(() => { vi.advanceTimersByTime(5000) })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not re-highlight when expenses change after highlight completes', () => {
    const onDone = vi.fn()

    const { rerender } = render(
      <ExpenseList highlightExpenseId="expense-1" onHighlightDone={onDone} />,
    )

    // Complete the highlight cycle
    act(() => { vi.advanceTimersByTime(16) })   // RAF
    act(() => { vi.advanceTimersByTime(3000) })  // fade timeout
    expect(onDone).toHaveBeenCalledTimes(1)

    scrollIntoViewSpy.mockClear()
    onDone.mockClear()

    // Simulate Firestore onSnapshot delivering new data (same highlightExpenseId)
    mockExpenseCtx.expenses = [...TWO_EXPENSES, makeExpense('expense-3', '2026-03-01')]
    rerender(<ExpenseList highlightExpenseId="expense-1" onHighlightDone={onDone} />)

    act(() => { vi.advanceTimersByTime(16) })
    act(() => { vi.advanceTimersByTime(5000) })

    // Guard prevents re-triggering
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('highlights after expenses load asynchronously', () => {
    const onDone = vi.fn()

    // Start with empty expenses (Firestore hasn't loaded yet)
    mockExpenseCtx.expenses = []

    const { rerender } = render(
      <ExpenseList highlightExpenseId="expense-1" onHighlightDone={onDone} />,
    )

    // RAF fires but no rows exist yet
    act(() => { vi.advanceTimersByTime(16) })
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()

    // Expenses arrive from Firestore
    mockExpenseCtx.expenses = TWO_EXPENSES
    rerender(<ExpenseList highlightExpenseId="expense-1" onHighlightDone={onDone} />)

    // Effect re-runs (expenses dependency changed), new RAF fires
    act(() => { vi.advanceTimersByTime(16) })
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('allows re-highlighting when highlightExpenseId changes to a different ID', () => {
    const onDone = vi.fn()

    const { rerender } = render(
      <ExpenseList highlightExpenseId="expense-1" onHighlightDone={onDone} />,
    )

    // Complete first highlight
    act(() => { vi.advanceTimersByTime(16) })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onDone).toHaveBeenCalledTimes(1)

    scrollIntoViewSpy.mockClear()
    onDone.mockClear()

    // Navigate to a different expense
    rerender(<ExpenseList highlightExpenseId="expense-2" onHighlightDone={onDone} />)

    act(() => { vi.advanceTimersByTime(16) })
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
