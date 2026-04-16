import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// ── Mocks (hoisted) ──

const { mockNavigate, mockCreateHouse, mockSwitchHouse, mockHouseholdState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateHouse: vi.fn(),
  mockSwitchHouse: vi.fn(),
  mockHouseholdState: {
    houses: [
      { id: 'house-1', name: 'Casa Bella', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
      { id: 'house-2', name: 'Beach House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
    ],
  },
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
