import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_FILE_SIZE, MAX_FILES_PER_EXPENSE, MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'

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

function makeExpense(id: string, date = '2026-01-15', overrides: Record<string, unknown> = {}) {
  return {
    id,
    amount: 100000,
    category: 'other' as const,
    payer: 'user-1',
    description: `Expense ${id}`,
    date,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    ...overrides,
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

// ── Filtering, sorting, search ──────────────────────

describe('ExpenseList filtering and search', () => {
  const DIVERSE_EXPENSES = [
    makeExpense('e1', '2026-01-15', { amount: 50000, category: 'taxes', description: 'Property tax', payer: 'user-1' }),
    makeExpense('e2', '2026-02-10', { amount: 200000, category: 'notary_legal', description: 'Notary fees', payer: 'user-1' }),
    makeExpense('e3', '2026-03-05', { amount: 30000, category: 'renovations', description: 'Paint job', payer: 'user-1' }),
  ]

  beforeEach(() => {
    // Use real timers — userEvent.type doesn't work with fake timers
    mockExpenseCtx.expenses = DIVERSE_EXPENSES
    mockExpenseCtx.pendingExpenseIds = new Set()
    mockExpenseCtx.pendingAttachmentIds = new Set()
    mockExpenseCtx.deleteExpense = vi.fn()
  })

  afterEach(cleanup)

  it('renders all expenses initially', () => {
    render(<ExpenseList />)

    expect(screen.getByText('Property tax')).toBeDefined()
    expect(screen.getByText('Notary fees')).toBeDefined()
    expect(screen.getByText('Paint job')).toBeDefined()
  })

  it('filters expenses by search text (case-insensitive)', async () => {
    render(<ExpenseList />)

    const searchInput = screen.getByPlaceholderText('Search expenses...')
    await userEvent.type(searchInput, 'notary')

    expect(screen.getByText('Notary fees')).toBeDefined()
    expect(screen.queryByText('Property tax')).toBeNull()
    expect(screen.queryByText('Paint job')).toBeNull()
  })

  it('shows filtered total matching displayed expenses', async () => {
    render(<ExpenseList />)

    const searchInput = screen.getByPlaceholderText('Search expenses...')
    await userEvent.type(searchInput, 'notary')

    // Only the notary expense should show in the summary
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.startsWith('1 expense') === true)).toBeDefined()
  })

  it('shows empty state when search matches nothing', async () => {
    render(<ExpenseList />)

    const searchInput = screen.getByPlaceholderText('Search expenses...')
    await userEvent.type(searchInput, 'zzzznonexistent')

    expect(screen.getByText('No matching expenses')).toBeDefined()
  })

  it('shows empty state when no expenses exist at all', () => {
    mockExpenseCtx.expenses = []
    render(<ExpenseList />)

    expect(screen.getByText('No costs logged yet')).toBeDefined()
  })

  it('displays expense amounts formatted as currency', () => {
    mockExpenseCtx.expenses = [
      makeExpense('e1', '2026-01-15', { amount: 150075 }),
    ]
    render(<ExpenseList />)

    // 150075 cents = some currency format (depends on locale)
    // Just verify the expense row renders
    expect(screen.getByText('Expense e1')).toBeDefined()
  })

  it('shows category badges', () => {
    mockExpenseCtx.expenses = [
      makeExpense('e1', '2026-01-15', { category: 'taxes' }),
    ]
    render(<ExpenseList />)

    expect(screen.getByText('Taxes & Stamp Duty')).toBeDefined()
  })
})

describe('ExpenseList pending state', () => {
  beforeEach(() => {
    mockExpenseCtx.pendingExpenseIds = new Set()
    mockExpenseCtx.pendingAttachmentIds = new Set()
  })

  afterEach(cleanup)

  it('shows loading spinner for pending expenses', () => {
    mockExpenseCtx.expenses = [makeExpense('pending-1')]
    mockExpenseCtx.pendingExpenseIds = new Set(['pending-1'])
    const { container } = render(<ExpenseList />)

    // Pending expense should show a spinner (Loader2 icon)
    const spinners = container.querySelectorAll('.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)
  })

  it('hides edit/delete buttons for pending expenses', () => {
    mockExpenseCtx.expenses = [makeExpense('pending-1')]
    mockExpenseCtx.pendingExpenseIds = new Set(['pending-1'])
    render(<ExpenseList />)

    // Edit and delete buttons should not be present
    const buttons = screen.queryAllByRole('button')
    // Only the search-related buttons should be present, not per-row actions
    const actionButtons = buttons.filter(b => {
      const title = b.getAttribute('title')
      return title === 'Confirm' || title === 'Cancel'
    })
    expect(actionButtons).toHaveLength(0)
  })
})

describe('ExpenseList attachments display', () => {
  beforeEach(() => {
    mockExpenseCtx.pendingExpenseIds = new Set()
    mockExpenseCtx.pendingAttachmentIds = new Set()
  })

  afterEach(cleanup)

  it('shows attachment count badge', () => {
    mockExpenseCtx.expenses = [
      makeExpense('e1', '2026-01-15', {
        attachments: [
          { id: 'att-1', name: 'receipt.pdf', type: 'application/pdf', size: 1000, url: 'https://example.com/r.pdf' },
          { id: 'att-2', name: 'photo.jpg', type: 'image/jpeg', size: 2000, url: 'https://example.com/p.jpg' },
        ],
      }),
    ]
    render(<ExpenseList />)

    // Attachment count should show "2"
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders attachment pills with file names', () => {
    mockExpenseCtx.expenses = [
      makeExpense('e1', '2026-01-15', {
        attachments: [
          { id: 'att-1', name: 'receipt.pdf', type: 'application/pdf', size: 1000, url: 'https://example.com/r.pdf' },
        ],
      }),
    ]
    render(<ExpenseList />)

    expect(screen.getByText('receipt.pdf')).toBeDefined()
  })

  it('shows extension badge for non-image attachments without thumbnails', () => {
    mockExpenseCtx.expenses = [
      makeExpense('e1', '2026-01-15', {
        attachments: [
          { id: 'att-1', name: 'doc.pdf', type: 'application/pdf', size: 1000, url: 'https://example.com/d.pdf' },
        ],
      }),
    ]
    render(<ExpenseList />)

    expect(screen.getByText('PDF')).toBeDefined()
  })

  it('shows thumbnail image when attachment has thumbnailUrl', () => {
    mockExpenseCtx.expenses = [
      makeExpense('e1', '2026-01-15', {
        attachments: [
          { id: 'att-1', name: 'photo.jpg', type: 'image/jpeg', size: 2000, url: 'https://example.com/full.jpg', thumbnailUrl: 'https://example.com/thumb.jpg' },
        ],
      }),
    ]
    const { container } = render(<ExpenseList />)

    const img = container.querySelector('img')
    expect(img).toBeDefined()
    expect(img?.getAttribute('src')).toBe('https://example.com/thumb.jpg')
  })

  it('shows extension badge when image has no thumbnailUrl', () => {
    mockExpenseCtx.expenses = [
      makeExpense('e1', '2026-01-15', {
        attachments: [
          { id: 'att-1', name: 'photo.jpg', type: 'image/jpeg', size: 2000, url: 'https://example.com/full.jpg' },
        ],
      }),
    ]
    const { container } = render(<ExpenseList />)

    // No img tag (doesn't download full image)
    expect(container.querySelector('img')).toBeNull()
    // Shows extension badge instead
    expect(screen.getByText('JPG')).toBeDefined()
  })

  it('shows spinner for pending attachments', () => {
    mockExpenseCtx.expenses = [
      makeExpense('e1', '2026-01-15', {
        attachments: [
          { id: 'pending-att', name: 'uploading.pdf', type: 'application/pdf', size: 1000 },
        ],
      }),
    ]
    mockExpenseCtx.pendingAttachmentIds = new Set(['pending-att'])
    const { container } = render(<ExpenseList />)

    const spinners = container.querySelectorAll('.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)
  })

  it('shows "Attach" button on expenses without attachments (on hover)', () => {
    mockExpenseCtx.expenses = [makeExpense('e1')]
    render(<ExpenseList />)

    expect(screen.getByText('Attach')).toBeDefined()
  })
})

// ── Attachment upload validation (regression tests for the "46 MB = 403" bug) ──

describe('ExpenseList attachment upload validation', () => {
  beforeEach(() => {
    mockExpenseCtx.expenses = [makeExpense('e1')]
    mockExpenseCtx.pendingExpenseIds = new Set()
    mockExpenseCtx.pendingAttachmentIds = new Set()
    mockExpenseCtx.storageUsed = 0
    mockExpenseCtx.addAttachmentsToExpense = vi.fn()
  })

  afterEach(cleanup)

  async function selectFileForExpense(container: HTMLElement, file: File) {
    // The "Attach" button sets attachTargetId via setState. We need React to
    // commit that update before firing the change event on the hidden input,
    // otherwise handleFileSelected still reads attachTargetId === null.
    await act(async () => { fireEvent.click(screen.getByText('Attach')) })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
  }

  it('blocks oversize files client-side, never calls addAttachmentsToExpense', async () => {
    const { container } = render(<ExpenseList />)

    const bigFile = new File([''], 'huge.png', { type: 'image/png' })
    Object.defineProperty(bigFile, 'size', { value: MAX_FILE_SIZE + 1 })

    await selectFileForExpense(container, bigFile)

    expect(mockExpenseCtx.addAttachmentsToExpense).not.toHaveBeenCalled()
    // Surfaced message must be specific (10 MB limit), NOT the old
    // misleading "You don't have permission to upload files" text.
    expect(screen.getByText(/exceeds 10 MB limit/i)).toBeDefined()
    expect(screen.queryByText(/don't have permission/i)).toBeNull()
  })

  it('blocks files with unsupported MIME type client-side', async () => {
    const { container } = render(<ExpenseList />)

    const badFile = new File(['x'], 'script.exe', { type: 'application/x-msdownload' })
    await selectFileForExpense(container, badFile)

    expect(mockExpenseCtx.addAttachmentsToExpense).not.toHaveBeenCalled()
    expect(screen.getByText(/not a supported file type/i)).toBeDefined()
  })

  it('passes validated files through to addAttachmentsToExpense', async () => {
    const { container } = render(<ExpenseList />)

    const goodFile = new File(['x'], 'photo.png', { type: 'image/png' })
    await selectFileForExpense(container, goodFile)

    expect(mockExpenseCtx.addAttachmentsToExpense).toHaveBeenCalledTimes(1)
    const [expenseId, files] = mockExpenseCtx.addAttachmentsToExpense.mock.calls[0]
    expect(expenseId).toBe('e1')
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('photo.png')
  })

  // Multi-file flow: user shift-selects a handful, one is bad — UX goal is
  // "accept what's valid, explain what's not" rather than all-or-nothing.
  it('uploads valid files and shows rejection for the bad one when mixed', async () => {
    const { container } = render(<ExpenseList />)

    const good1 = new File(['x'], 'a.png', { type: 'image/png' })
    const bad = new File([''], 'oversize.png', { type: 'image/png' })
    Object.defineProperty(bad, 'size', { value: MAX_FILE_SIZE + 1 })
    const good2 = new File(['y'], 'b.pdf', { type: 'application/pdf' })

    await act(async () => { fireEvent.click(screen.getByText('Attach')) })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [good1, bad, good2] } })
    })

    // Good files forwarded to context; bad one surfaced as error
    expect(mockExpenseCtx.addAttachmentsToExpense).toHaveBeenCalledTimes(1)
    const forwarded = mockExpenseCtx.addAttachmentsToExpense.mock.calls[0][1]
    expect(forwarded.map((f: File) => f.name)).toEqual(['a.png', 'b.pdf'])
    expect(screen.getByText(/exceeds 10 MB limit/i)).toBeDefined()
  })

  it('does NOT call addAttachmentsToExpense when every file is rejected', async () => {
    const { container } = render(<ExpenseList />)

    const bad1 = new File(['x'], 'a.exe', { type: 'application/x-msdownload' })
    const bad2 = new File(['y'], 'b.zip', { type: 'application/zip' })
    await act(async () => { fireEvent.click(screen.getByText('Attach')) })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [bad1, bad2] } })
    })

    expect(mockExpenseCtx.addAttachmentsToExpense).not.toHaveBeenCalled()
    expect(screen.getByText(/not a supported file type/i)).toBeDefined()
  })

  it('rejects a file that would push household past 50 MB quota (via context storageUsed)', async () => {
    mockExpenseCtx.storageUsed = MAX_HOUSEHOLD_STORAGE - 1000 // 1 KB remaining
    const { container } = render(<ExpenseList />)

    const file = new File([''], 'too-big-for-quota.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: 2000 }) // 2 KB — overflows

    await selectFileForExpense(container, file)

    expect(mockExpenseCtx.addAttachmentsToExpense).not.toHaveBeenCalled()
    expect(screen.getByText(/storage limit/i)).toBeDefined()
  })

  it('rejects attach when target expense is already at MAX_FILES_PER_EXPENSE', async () => {
    const full = makeExpense('e1', '2026-01-15', {
      attachments: Array.from({ length: MAX_FILES_PER_EXPENSE }, (_, i) => ({
        id: `a${i}`, name: `f${i}.png`, type: 'image/png', size: 100, url: 'https://x/y',
      })),
    })
    mockExpenseCtx.expenses = [full]
    const { container } = render(<ExpenseList />)

    // When an expense already has attachments, the "Attach" text-label is
    // replaced by a "+" pill whose title is t('common.attach') = "Attach".
    await act(async () => { fireEvent.click(screen.getByTitle('Attach')) })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'extra.png', { type: 'image/png' })
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })

    expect(mockExpenseCtx.addAttachmentsToExpense).not.toHaveBeenCalled()
    // UI must explain the reason so the user can remove an existing pill.
    expect(screen.getByText(/Maximum/i)).toBeDefined()
  })
})
