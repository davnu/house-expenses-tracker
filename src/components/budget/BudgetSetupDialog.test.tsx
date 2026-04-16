import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── jsdom polyfills ───────────────────────────────────

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

// ── Mocks ─────────────────────────────────────────────

const { mockBudget, mockSaveBudget, mockDeleteBudget, mockExpenses } = vi.hoisted(() => ({
  mockBudget: { current: null as object | null },
  mockSaveBudget: vi.fn(),
  mockDeleteBudget: vi.fn(),
  mockExpenses: { current: [] as Array<{ id: string; amount: number; category: string; payer: string; description: string; date: string; createdAt: string; updatedAt: string }> },
}))

vi.mock('@/context/BudgetContext', () => ({
  useBudget: () => ({
    budget: mockBudget.current,
    loading: false,
    saveBudget: mockSaveBudget,
    deleteBudget: mockDeleteBudget,
  }),
}))

vi.mock('@/context/ExpenseContext', () => ({
  useExpenses: () => ({
    expenses: mockExpenses.current,
    loading: false,
    storageUsed: 0,
  }),
}))

import { BudgetSetupDialog } from './BudgetSetupDialog'

// Radix Dialog sets pointer-events: none on the body — bypass for tests
function setupUser() {
  return userEvent.setup({ pointerEventsCheck: 0 })
}

function renderDialog(onOpenChange = vi.fn()) {
  return render(<BudgetSetupDialog open={true} onOpenChange={onOpenChange} />)
}

function getDialog() {
  // Radix may leave stale portals; grab the last (most recent) dialog
  const dialogs = screen.getAllByRole('dialog')
  return dialogs[dialogs.length - 1]
}

// ── Tests ─────────────────────────────────────────────

describe('BudgetSetupDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBudget.current = null
    mockExpenses.current = []
    mockSaveBudget.mockResolvedValue(undefined)
    mockDeleteBudget.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('shows categories with expenses at the top, rest in collapsible when editing', async () => {
    const user = setupUser()
    mockExpenses.current = [
      { id: 'e1', amount: 100000, category: 'renovations', payer: 'a', description: '', date: '2026-01-01', createdAt: '', updatedAt: '' },
      { id: 'e2', amount: 50000, category: 'furniture', payer: 'a', description: '', date: '2026-01-01', createdAt: '', updatedAt: '' },
    ]
    // Budget exists — triggers the collapsible grouping
    mockBudget.current = {
      totalBudget: 10000000,
      categories: { renovations: 5000000 },
      updatedAt: '2026-04-01T00:00:00Z',
    }

    renderDialog()
    const dialog = getDialog()

    // 2 primary (renovations from budget + furniture from expenses) + 1 total = 3 inputs
    const inputs = within(dialog).getAllByPlaceholderText('0.00')
    expect(inputs).toHaveLength(3)

    // Primary categories visible
    expect(dialog.textContent).toContain('Renovations')
    expect(dialog.textContent).toContain('Furniture')

    // Other categories hidden behind collapsible
    expect(dialog.textContent).toContain('Other categories')
    expect(dialog.textContent).not.toContain('Down Payment')

    // Expand the collapsible
    await user.click(within(dialog).getByText(/Other categories/))

    // Now all 14 + 1 total = 15 inputs visible
    const allInputs = within(dialog).getAllByPlaceholderText('0.00')
    expect(allInputs).toHaveLength(15)
    expect(dialog.textContent).toContain('Down Payment')
  })

  it('shows all 14 categories when no budget exists (first-time setup)', () => {
    renderDialog()
    const dialog = getDialog()

    // All 14 category inputs + 1 total = 15 visible — no collapsible on first use
    const inputs = within(dialog).getAllByPlaceholderText('0.00')
    expect(inputs).toHaveLength(15)

    // No collapsible toggle
    expect(dialog.textContent).not.toContain('Other categories')
  })

  it('pre-fills values when budget exists and shows budgeted categories as primary', () => {
    mockBudget.current = {
      totalBudget: 12000000,
      categories: { down_payment: 5000000, renovations: 3000000 },
      updatedAt: '2026-04-01T00:00:00Z',
    }

    renderDialog()
    const dialog = getDialog()

    const totalInput = within(dialog).getByLabelText('Total limit') as HTMLInputElement
    expect(totalInput.value).toBe('120000')

    // 2 budgeted category inputs visible as primary + 1 total = 3 inputs
    const inputs = within(dialog).getAllByPlaceholderText('0.00') as HTMLInputElement[]
    expect(inputs).toHaveLength(3)

    const filledInputs = inputs.filter((i) => i.value !== '' && i !== totalInput)
    expect(filledInputs.length).toBe(2)
  })

  it('calls saveBudget on submit with correct cents values', async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()

    renderDialog(onOpenChange)
    const dialog = getDialog()

    const totalInput = within(dialog).getByLabelText('Total limit')
    await user.type(totalInput, '50000')

    await user.click(within(dialog).getByText('Save'))

    expect(mockSaveBudget).toHaveBeenCalledTimes(1)
    const savedConfig = mockSaveBudget.mock.calls[0][0]
    expect(savedConfig.totalBudget).toBe(5000000)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('hides remove button when no budget exists', () => {
    renderDialog()
    const dialog = getDialog()
    expect(within(dialog).queryByText('Remove limits')).toBeNull()
  })

  it('shows remove button when budget exists', () => {
    mockBudget.current = {
      totalBudget: 10000000,
      categories: {},
      updatedAt: '2026-04-01T00:00:00Z',
    }

    renderDialog()
    const dialog = getDialog()
    expect(within(dialog).getByText('Remove limits')).toBeTruthy()
  })

  it('calls deleteBudget and closes on remove', async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    mockBudget.current = {
      totalBudget: 10000000,
      categories: {},
      updatedAt: '2026-04-01T00:00:00Z',
    }

    renderDialog(onOpenChange)
    const dialog = getDialog()

    await user.click(within(dialog).getByText('Remove limits'))

    expect(mockDeleteBudget).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('empty category amounts are not included in saved config', async () => {
    const user = setupUser()

    renderDialog()
    const dialog = getDialog()

    const totalInput = within(dialog).getByLabelText('Total limit')
    await user.type(totalInput, '1000')

    await user.click(within(dialog).getByText('Save'))

    const savedConfig = mockSaveBudget.mock.calls[0][0]
    expect(Object.keys(savedConfig.categories)).toHaveLength(0)
  })

  it('empty budget is not saved — dialog just closes', async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()

    renderDialog(onOpenChange)
    const dialog = getDialog()

    // Don't type anything — leave every field empty
    await user.click(within(dialog).getByText('Save'))

    expect(mockSaveBudget).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('saves with only categories and no total', async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    // Make down_payment a primary category by adding an expense
    mockExpenses.current = [
      { id: 'e1', amount: 100000, category: 'down_payment', payer: 'a', description: '', date: '2026-01-01', createdAt: '', updatedAt: '' },
    ]

    renderDialog(onOpenChange)
    const dialog = getDialog()

    // Leave total empty, fill the down_payment category input
    const inputs = within(dialog).getAllByPlaceholderText('0.00') as HTMLInputElement[]
    // inputs[0] is total, inputs[1] is down_payment (first primary)
    await user.type(inputs[1], '5000')

    await user.click(within(dialog).getByText('Save'))

    expect(mockSaveBudget).toHaveBeenCalledTimes(1)
    const savedConfig = mockSaveBudget.mock.calls[0][0]
    expect(savedConfig.totalBudget).toBe(0)
    expect(savedConfig.categories.down_payment).toBe(500000)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('decimal precision: 0.01 becomes 1 cent', async () => {
    const user = setupUser()

    renderDialog()
    const dialog = getDialog()

    const totalInput = within(dialog).getByLabelText('Total limit')
    await user.type(totalInput, '0.01')

    await user.click(within(dialog).getByText('Save'))

    expect(mockSaveBudget).toHaveBeenCalledTimes(1)
    const savedConfig = mockSaveBudget.mock.calls[0][0]
    expect(savedConfig.totalBudget).toBe(1)
  })

  it('decimal precision: 99.99 becomes 9999 cents', async () => {
    const user = setupUser()

    renderDialog()
    const dialog = getDialog()

    const totalInput = within(dialog).getByLabelText('Total limit')
    await user.type(totalInput, '99.99')

    await user.click(within(dialog).getByText('Save'))

    expect(mockSaveBudget).toHaveBeenCalledTimes(1)
    const savedConfig = mockSaveBudget.mock.calls[0][0]
    expect(savedConfig.totalBudget).toBe(9999)
  })

  it('category sum display appears when categories have values', async () => {
    const user = setupUser()
    mockExpenses.current = [
      { id: 'e1', amount: 100000, category: 'renovations', payer: 'a', description: '', date: '2026-01-01', createdAt: '', updatedAt: '' },
    ]

    renderDialog()
    const dialog = getDialog()

    // Initially no category total shown
    expect(dialog.textContent).not.toContain('Category total:')

    // Fill the renovations input (first primary category)
    const inputs = within(dialog).getAllByPlaceholderText('0.00') as HTMLInputElement[]
    await user.type(inputs[1], '200')

    expect(dialog.textContent).toContain('Category total:')
  })

  it('displays error and keeps dialog open on save failure', async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    mockSaveBudget.mockRejectedValueOnce(new Error('Firestore write failed'))

    renderDialog(onOpenChange)
    const dialog = getDialog()

    const totalInput = within(dialog).getByLabelText('Total limit')
    await user.type(totalInput, '1000')

    await user.click(within(dialog).getByText('Save'))

    // Error message should be visible (friendlyError maps unknown errors to generic message)
    expect(within(dialog).getByText('Something went wrong. Please try again.')).toBeTruthy()

    // Dialog should NOT have closed
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('save button is disabled while saving', async () => {
    const user = setupUser()
    let resolveSave!: () => void
    mockSaveBudget.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSave = resolve })
    )

    renderDialog()
    const dialog = getDialog()

    const totalInput = within(dialog).getByLabelText('Total limit')
    await user.type(totalInput, '1000')

    const saveButton = within(dialog).getByText('Save') as HTMLButtonElement
    expect(saveButton.disabled).toBe(false)

    // Start save — don't await it because we want to check intermediate state
    const savePromise = user.click(saveButton)

    // The button should now show "Saving..." and be disabled
    const savingButton = await within(dialog).findByText('Saving...') as HTMLButtonElement
    expect(savingButton.disabled).toBe(true)

    // Resolve the save so the test cleans up properly
    resolveSave()
    await savePromise
  })
})
