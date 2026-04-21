import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// ── Mocks (hoisted) ──

const {
  mockNavigate,
  mockCreateHouse,
  mockSwitchHouse,
  mockHouseholdState,
  createHouseRef,
  openCreateDialogMock,
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
  createHouseRef: {
    current: {
      reason: 'hasProHouse' as 'first' | 'hasProHouse' | 'needsUpgrade' | 'loading',
      ownedCount: 1,
      upgradeTargetHouseId: null as string | null,
    },
  },
  openCreateDialogMock: vi.fn(),
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

// CreateHouseContext replaces the old useCanCreateHouse hook + provides a
// shared openCreateDialog function. Mock both — tests flip the current
// reason per case without re-mocking.
vi.mock('@/context/CreateHouseContext', () => ({
  useCreateHouse: () => ({
    reason: createHouseRef.current.reason,
    ownedCount: createHouseRef.current.ownedCount,
    upgradeTargetHouseId: createHouseRef.current.upgradeTargetHouseId,
    openCreateDialog: openCreateDialogMock,
  }),
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
    createHouseRef.current = {
      reason: 'hasProHouse',
      ownedCount: 1,
      upgradeTargetHouseId: null,
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

  it('routes reason="first" to the shared openCreateDialog (provider owns the free dialog instance)', async () => {
    createHouseRef.current = { reason: 'first', ownedCount: 0, upgradeTargetHouseId: null }
    mockHouseholdState.houses = twoHouses
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Create New House/i }))
    })
    // The provider's openCreateDialog is the single entry point — no local
    // dialog instance in this component any more.
    expect(openCreateDialogMock).toHaveBeenCalledTimes(1)
    expect(openUpgradeMock).not.toHaveBeenCalled()
  })

  it('routes reason="hasProHouse" to the €29 additional_house paywall (NOT the free dialog)', async () => {
    createHouseRef.current = { reason: 'hasProHouse', ownedCount: 1, upgradeTargetHouseId: null }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Create New House/i }))
    })
    expect(openUpgradeMock).toHaveBeenCalledWith('create_house', {
      product: 'additional_house',
    })
    expect(openCreateDialogMock).not.toHaveBeenCalled()
  })

  it('routes reason="needsUpgrade" to the €49 Pro paywall (upgrade the first house first)', async () => {
    createHouseRef.current = { reason: 'needsUpgrade', ownedCount: 1, upgradeTargetHouseId: null }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Create New House/i }))
    })
    expect(openUpgradeMock).toHaveBeenCalledWith('create_house', { product: 'pro' })
    expect(openCreateDialogMock).not.toHaveBeenCalled()
  })

  it('routes reason="needsUpgrade" + non-owner of current house by switching to the user\'s own non-Pro house FIRST, then opening the €49 modal', async () => {
    // Scenario: Alice owns her own free house (house-2) but is currently
    // viewing Bob's house (house-1) as a member. The upgrade modal targets
    // useHousehold().house.id, so opening it directly would try to upgrade
    // Bob's house — the server rejects (Alice isn't the owner). Switching
    // to Alice's own non-Pro house first means the €49 checkout lands on
    // an ownership-gated house the server will accept.
    createHouseRef.current = {
      reason: 'needsUpgrade',
      ownedCount: 1,
      upgradeTargetHouseId: 'house-2',
    }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Create New House/i }))
    })
    // Switch happens BEFORE the modal opens.
    expect(mockSwitchHouse).toHaveBeenCalledWith('house-2')
    expect(openUpgradeMock).toHaveBeenCalledWith('create_house', { product: 'pro' })
    // Order matters — the modal would see stale state if it opened first.
    const switchCallOrder = mockSwitchHouse.mock.invocationCallOrder[0]
    const openCallOrder = openUpgradeMock.mock.invocationCallOrder[0]
    expect(switchCallOrder).toBeLessThan(openCallOrder)
  })

  it('routes reason="needsUpgrade" + owner of current house WITHOUT an extra switch (already on the right target)', async () => {
    // When the currently-viewed house is already the user's own non-Pro house
    // (the common case — user is on their own house and wants to add another),
    // skip the switch so we don't trigger a needless rerender/navigation.
    createHouseRef.current = {
      reason: 'needsUpgrade',
      ownedCount: 1,
      upgradeTargetHouseId: 'house-1', // same as active house
    }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Create New House/i }))
    })
    expect(mockSwitchHouse).not.toHaveBeenCalled()
    expect(openUpgradeMock).toHaveBeenCalledWith('create_house', { product: 'pro' })
  })

  it('disables the Create New House button while entitlements are still loading (no premature routing)', async () => {
    createHouseRef.current = { reason: 'loading', ownedCount: 1, upgradeTargetHouseId: null }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    const createButton = screen.getByRole('option', { name: /Create New House/i }) as HTMLButtonElement
    expect(createButton.disabled).toBe(true)
    await act(async () => {
      fireEvent.click(createButton)
    })
    expect(openUpgradeMock).not.toHaveBeenCalled()
    expect(openCreateDialogMock).not.toHaveBeenCalled()
  })

  it('shows the lock icon when paywalled (needsUpgrade)', () => {
    createHouseRef.current = { reason: 'needsUpgrade', ownedCount: 1, upgradeTargetHouseId: null }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    const buttons = screen.getAllByRole('option')
    const createBtn = buttons.find((b) => b.textContent?.includes('Create New House'))
    expect(createBtn?.querySelector('.lucide-lock')).toBeTruthy()
    expect(createBtn?.querySelector('.lucide-plus')).toBeNull()
  })

  it('shows the plus icon when the user can create (hasProHouse — paywall is inside the modal, not the switcher)', () => {
    createHouseRef.current = { reason: 'hasProHouse', ownedCount: 1, upgradeTargetHouseId: null }
    render(<HouseSwitcher />)
    fireEvent.click(screen.getByRole('combobox'))
    const buttons = screen.getAllByRole('option')
    const createBtn = buttons.find((b) => b.textContent?.includes('Create New House'))
    expect(createBtn?.querySelector('.lucide-plus')).toBeTruthy()
    expect(createBtn?.querySelector('.lucide-lock')).toBeNull()
  })

  it('does NOT mount a local CreateHouseDialog instance (the provider owns the single dialog)', () => {
    createHouseRef.current = { reason: 'hasProHouse', ownedCount: 1, upgradeTargetHouseId: null }
    render(<HouseSwitcher />)
    // The dialog mock renders data-testid="dialog" when open=true. We never
    // open anything and the component no longer mounts its own instance,
    // so the testid must be absent even when open=false (because no Dialog
    // node of any kind is rendered locally).
    expect(screen.queryByTestId('dialog')).toBeNull()
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
