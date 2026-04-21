import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// ── Mocks (hoisted) ──

const {
  mockNavigate,
  mockCreateHouse,
  mockSwitchHouse,
  mockHouseholdState,
  canCreateHouseRef,
  openUpgradeMock,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateHouse: vi.fn(),
  mockSwitchHouse: vi.fn(),
  mockHouseholdState: {
    houses: [
      { id: 'house-1', name: 'Casa Bella', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
      { id: 'house-2', name: 'Beach House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
    ],
  },
  canCreateHouseRef: {
    current: { canCreate: true, reason: 'hasProHouse' as 'first' | 'hasProHouse' | 'needsUpgrade' | 'loading', ownedCount: 1 },
  },
  openUpgradeMock: vi.fn(),
}))

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    house: mockHouseholdState.houses[0],
    houses: mockHouseholdState.houses,
    switchHouse: mockSwitchHouse,
    createHouse: mockCreateHouse,
  }),
}))

// Billing mocks — these components now read the entitlement-aware capability
// hook + upgrade modal context. The ref-based pattern lets individual tests
// flip the create-house reason (first/hasProHouse/needsUpgrade/loading)
// without re-mocking per test.
vi.mock('@/hooks/use-can-create-house', () => ({
  useCanCreateHouse: () => canCreateHouseRef.current,
}))
vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({
    isOpen: false,
    gate: null,
    product: 'pro',
    open: openUpgradeMock,
    close: vi.fn(),
  }),
  UpgradeDialogProvider: ({ children }: { children: unknown }) => children,
}))

// Mock Dialog to render children directly (avoid Radix portal issues in jsdom)
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

import { HouseSwitcher } from './HouseSwitcher'
import { CreateHouseDialog } from './CreateHouseDialog'

// ── Tests ──

afterEach(cleanup)

const twoHouses = [
  { id: 'house-1', name: 'Casa Bella', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
  { id: 'house-2', name: 'Beach House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
]

const oneHouse = [twoHouses[0]]

describe('HouseSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSwitchHouse.mockResolvedValue(undefined)
    mockHouseholdState.houses = twoHouses
    // Default permissive state for the existing dropdown/switch tests.
    canCreateHouseRef.current = {
      canCreate: true,
      reason: 'hasProHouse',
      ownedCount: 1,
    }
  })

  it('shows static label with no dropdown for single house', () => {
    mockHouseholdState.houses = oneHouse
    render(<HouseSwitcher />)

    // House name is displayed
    expect(screen.getByText('Casa Bella')).toBeTruthy()

    // No combobox trigger — just a static heading
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows dropdown trigger for multiple houses', () => {
    render(<HouseSwitcher />)

    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('navigates to dashboard after switching to a different house', async () => {
    render(<HouseSwitcher />)

    fireEvent.click(screen.getByRole('combobox'))

    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Beach House' }))
    })

    expect(mockSwitchHouse).toHaveBeenCalledWith('house-2')
    expect(mockNavigate).toHaveBeenCalledWith('/app', { replace: true })
  })

  it('does NOT navigate when clicking the already-active house', async () => {
    render(<HouseSwitcher />)

    fireEvent.click(screen.getByRole('combobox'))

    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Casa Bella' }))
    })

    expect(mockSwitchHouse).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does NOT navigate when switchHouse fails', async () => {
    mockSwitchHouse.mockRejectedValue(new Error('Network error'))

    render(<HouseSwitcher />)

    fireEvent.click(screen.getByRole('combobox'))

    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Beach House' }))
    })

    expect(mockSwitchHouse).toHaveBeenCalledWith('house-2')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  // ── Create-new-house routing ─────────────────────────────────────
  //
  // The four `useCanCreateHouse` reasons must each route to exactly the
  // right destination. Regression risk: an earlier version of this flow
  // opened the free CreateHouseDialog for `hasProHouse`, silently giving
  // Pro users unlimited free additional houses instead of collecting the
  // €29. These tests pin each branch so that can't recur.

  it('routes reason="first" to the free CreateHouseDialog (onboarding — no paywall)', async () => {
    canCreateHouseRef.current = { canCreate: true, reason: 'first', ownedCount: 0 }
    mockHouseholdState.houses = twoHouses
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Create New House/i }))
    })
    // Free dialog opened — no paywall.
    expect(screen.getByTestId('dialog')).toBeTruthy()
    expect(openUpgradeMock).not.toHaveBeenCalled()
  })

  it('routes reason="hasProHouse" to the €29 additional_house paywall (NOT the free dialog)', async () => {
    canCreateHouseRef.current = { canCreate: true, reason: 'hasProHouse', ownedCount: 1 }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Create New House/i }))
    })
    expect(openUpgradeMock).toHaveBeenCalledWith('create_house', {
      product: 'additional_house',
    })
    // Free dialog is NOT opened.
    expect(screen.queryByTestId('dialog')).toBeNull()
  })

  it('routes reason="needsUpgrade" to the €49 Pro paywall (upgrade the first house first)', async () => {
    canCreateHouseRef.current = { canCreate: false, reason: 'needsUpgrade', ownedCount: 1 }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Create New House/i }))
    })
    expect(openUpgradeMock).toHaveBeenCalledWith('create_house', { product: 'pro' })
    expect(screen.queryByTestId('dialog')).toBeNull()
  })

  it('disables the Create New House button while entitlements are still loading (no premature routing)', async () => {
    canCreateHouseRef.current = { canCreate: false, reason: 'loading', ownedCount: 1 }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    const createButton = screen.getByRole('option', { name: /Create New House/i }) as HTMLButtonElement
    // The button is rendered (so users see the affordance) but disabled —
    // clicking it does nothing until the entitlement subscription resolves.
    expect(createButton.disabled).toBe(true)
    await act(async () => {
      fireEvent.click(createButton)
    })
    expect(openUpgradeMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('dialog')).toBeNull()
  })

  it('shows the lock icon when paywalled (needsUpgrade)', () => {
    canCreateHouseRef.current = { canCreate: false, reason: 'needsUpgrade', ownedCount: 1 }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    const buttons = screen.getAllByRole('option')
    const createBtn = buttons.find((b) => b.textContent?.includes('Create New House'))
    // Lock affordance signals "this will cost something". Asserts on the
    // lucide SVG class so a refactor to a different icon library (or
    // accidentally flipping the condition) trips the test.
    expect(createBtn?.querySelector('.lucide-lock')).toBeTruthy()
    expect(createBtn?.querySelector('.lucide-plus')).toBeNull()
  })

  it('shows the plus icon when the user can create (hasProHouse — paywall is inside the modal, not the switcher)', () => {
    canCreateHouseRef.current = { canCreate: true, reason: 'hasProHouse', ownedCount: 1 }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    const buttons = screen.getAllByRole('option')
    const createBtn = buttons.find((b) => b.textContent?.includes('Create New House'))
    expect(createBtn?.querySelector('.lucide-plus')).toBeTruthy()
    expect(createBtn?.querySelector('.lucide-lock')).toBeNull()
  })
})

describe('CreateHouseDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateHouse.mockResolvedValue(undefined)
  })

  it('navigates to dashboard after successful house creation', async () => {
    const onOpenChange = vi.fn()
    render(<CreateHouseDialog open={true} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('House name'), { target: { value: 'New House' } })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'ES' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create House' }))
    })

    expect(mockCreateHouse).toHaveBeenCalledWith('New House', 'ES', 'EUR')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockNavigate).toHaveBeenCalledWith('/app', { replace: true })
  })

  it('disables submit button when country is not selected', () => {
    render(<CreateHouseDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('House name'), { target: { value: 'New House' } })

    const button = screen.getByRole('button', { name: 'Create House' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('does NOT submit when country is not selected', async () => {
    const onOpenChange = vi.fn()
    render(<CreateHouseDialog open={true} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('House name'), { target: { value: 'New House' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create House' }))
    })

    expect(mockCreateHouse).not.toHaveBeenCalled()
  })

  it('does NOT navigate when creation fails', async () => {
    mockCreateHouse.mockRejectedValue(new Error('Failed'))
    const onOpenChange = vi.fn()

    render(<CreateHouseDialog open={true} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('House name'), { target: { value: 'New House' } })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'ES' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create House' }))
    })

    expect(mockCreateHouse).toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByText(/something went wrong/i)).toBeTruthy()
  })

  it('shows country hint when only name is filled', () => {
    render(<CreateHouseDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('House name'), { target: { value: 'New House' } })

    expect(screen.getByText('Select a country to continue')).toBeTruthy()
    expect(screen.queryByText('Enter a house name to continue')).toBeNull()
  })

  it('shows name hint when only country is filled', () => {
    render(<CreateHouseDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'ES' } })

    expect(screen.getByText('Enter a house name to continue')).toBeTruthy()
    expect(screen.queryByText('Select a country to continue')).toBeNull()
  })

  it('shows no hint when form is empty or complete', () => {
    render(<CreateHouseDialog open={true} onOpenChange={vi.fn()} />)

    // Empty form — no hints
    expect(screen.queryByText('Select a country to continue')).toBeNull()
    expect(screen.queryByText('Enter a house name to continue')).toBeNull()

    // Complete form — no hints
    fireEvent.change(screen.getByLabelText('House name'), { target: { value: 'New House' } })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'ES' } })

    expect(screen.queryByText('Select a country to continue')).toBeNull()
    expect(screen.queryByText('Enter a house name to continue')).toBeNull()
  })

  it('resets form state when dialog closes', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<CreateHouseDialog open={true} onOpenChange={onOpenChange} />)

    const input = () => screen.getByLabelText('House name') as HTMLInputElement
    const select = () => screen.getByLabelText('Country') as HTMLSelectElement

    fireEvent.change(input(), { target: { value: 'Typed Name' } })
    fireEvent.change(select(), { target: { value: 'ES' } })
    expect(input().value).toBe('Typed Name')
    expect(select().value).toBe('ES')

    // Close dialog
    rerender(<CreateHouseDialog open={false} onOpenChange={onOpenChange} />)
    // Reopen dialog
    rerender(<CreateHouseDialog open={true} onOpenChange={onOpenChange} />)

    expect(input().value).toBe('')
    expect(select().value).toBe('')
  })
})
