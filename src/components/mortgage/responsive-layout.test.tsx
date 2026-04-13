import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── jsdom polyfills ──

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  window.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  }))
})

// ── Shared mock data ──

const baseMortgage = {
  principal: 40000000,
  annualRate: 2.5,
  rateType: 'fixed' as const,
  termYears: 30,
  startDate: '2026-04-01',
  monthlyPayment: 158000,
  monthlyPaymentOverride: false,
  amortizationType: 'french' as const,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
}

const variableMortgage = {
  ...baseMortgage,
  rateType: 'variable' as const,
  variableRate: {
    subtype: 'tracker' as const,
    referenceRateId: 'euribor_12m',
    currentReferenceRate: 2.5,
    spread: 0.9,
    reviewFrequencyMonths: 12,
  },
  ratePeriods: [
    { id: 'rp1', startDate: '2026-10-01', annualRate: 3.4, rateType: 'variable' as const, referenceRate: 2.5, spread: 0.9 },
  ],
}

// ── Mock contexts ──

const { mockMortgage, mockSaveMortgage } = vi.hoisted(() => ({
  mockMortgage: { current: null as object | null },
  mockSaveMortgage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/context/MortgageContext', () => ({
  useMortgage: () => ({
    mortgage: mockMortgage.current,
    loading: false,
    saveMortgage: mockSaveMortgage,
  }),
}))

vi.mock('@/lib/mortgage-utils', () => ({
  generateAmortizationSchedule: () => [
    { date: '2026-04', remainingBalance: 39900000 },
    { date: '2026-05', remainingBalance: 39800000 },
  ],
  calculateMortgageImpact: () => ({ interestSaved: 0, monthsSaved: 0 }),
}))

vi.mock('@/lib/mortgage-country', () => ({
  REFERENCE_RATES: { euribor_12m: { label: 'Euribor 12M' } },
  computeEffectiveRate: (ref: number, spread: number) => +(ref + spread).toFixed(2),
}))

// ── Imports (after mocks) ──

import { BalanceCorrectionCard } from './BalanceCorrectionCard'
import { ExtraRepaymentsCard } from './ExtraRepaymentsCard'
import { RatePeriodsCard } from './RatePeriodsCard'

afterEach(() => {
  cleanup()
  mockSaveMortgage.mockClear()
})

// ── Helpers ──

/** Returns all elements whose class attribute includes both `grid` and the given cols class */
function findGrids(container: HTMLElement, colsClass: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[class]')).filter(
    (el) => {
      const cls = el.getAttribute('class') ?? ''
      return cls.includes('grid') && cls.includes(colsClass)
    }
  )
}

/** Returns all elements with a non-responsive grid-cols-2 (without sm: prefix) */
function findNonResponsiveGrids(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[class]')).filter(
    (el) => {
      const cls = el.getAttribute('class') ?? ''
      return cls.includes('grid') && /\bgrid-cols-2\b/.test(cls) && !cls.includes('sm:grid-cols-2')
    }
  )
}

// ── BalanceCorrectionCard ──

describe('BalanceCorrectionCard responsive layout', () => {
  it('form grid uses responsive grid-cols-1 sm:grid-cols-2', async () => {
    mockMortgage.current = baseMortgage
    const { container } = render(<BalanceCorrectionCard />)

    // Click "Add Correction" to show the form
    const addBtn = screen.getByRole('button', { name: /add correction/i })
    await userEvent.click(addBtn)

    // The form grid should have the responsive class
    const grids = findGrids(container, 'sm:grid-cols-2')
    expect(grids.length).toBeGreaterThanOrEqual(1)

    // Verify it does NOT use non-responsive grid-cols-2 (without sm: prefix)
    expect(findNonResponsiveGrids(container)).toHaveLength(0)
  })

  it('form contains Date and Balance fields', async () => {
    mockMortgage.current = baseMortgage
    render(<BalanceCorrectionCard />)

    await userEvent.click(screen.getByRole('button', { name: /add correction/i }))

    expect(screen.getByText('Date (from bank statement)')).toBeDefined()
    expect(screen.getByText('Actual remaining balance')).toBeDefined()
  })

  it('form has Save and Cancel buttons when open', async () => {
    mockMortgage.current = baseMortgage
    render(<BalanceCorrectionCard />)

    await userEvent.click(screen.getByRole('button', { name: /add correction/i }))

    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined()
  })
})

// ── ExtraRepaymentsCard ──

describe('ExtraRepaymentsCard responsive layout', () => {
  it('form grid uses responsive grid-cols-1 sm:grid-cols-2', async () => {
    mockMortgage.current = baseMortgage
    const { container } = render(<ExtraRepaymentsCard />)

    await userEvent.click(screen.getByRole('button', { name: /add payment/i }))

    const grids = findGrids(container, 'sm:grid-cols-2')
    expect(grids.length).toBeGreaterThanOrEqual(1)

    expect(findNonResponsiveGrids(container)).toHaveLength(0)
  })

  it('form contains Date and Amount fields', async () => {
    mockMortgage.current = baseMortgage
    render(<ExtraRepaymentsCard />)

    await userEvent.click(screen.getByRole('button', { name: /add payment/i }))

    expect(screen.getByText('Date')).toBeDefined()
    expect(screen.getByText('Amount')).toBeDefined()
  })

  it('form contains effect toggle with both options', async () => {
    mockMortgage.current = baseMortgage
    render(<ExtraRepaymentsCard />)

    await userEvent.click(screen.getByRole('button', { name: /add payment/i }))

    expect(screen.getByText('Reduce term')).toBeDefined()
    expect(screen.getByText('Reduce payment')).toBeDefined()
  })
})

// ── RatePeriodsCard ──

describe('RatePeriodsCard responsive layout', () => {
  it('add form (fixed rate) uses responsive grid', async () => {
    mockMortgage.current = baseMortgage
    const { container } = render(<RatePeriodsCard />)

    await userEvent.click(screen.getByRole('button', { name: /add rate change/i }))

    // Should have responsive grids
    const grids = findGrids(container, 'sm:grid-cols-2')
    expect(grids.length).toBeGreaterThanOrEqual(1)

    // No non-responsive grid-cols-2
    expect(findNonResponsiveGrids(container)).toHaveLength(0)
  })

  it('add form (fixed rate) shows Annual rate and Type fields', async () => {
    mockMortgage.current = baseMortgage
    render(<RatePeriodsCard />)

    await userEvent.click(screen.getByRole('button', { name: /add rate change/i }))

    expect(screen.getByText('Annual rate (%)')).toBeDefined()
    expect(screen.getByText('Type')).toBeDefined()
  })

  it('add form (variable rate) uses responsive grid for ref rate + spread', async () => {
    mockMortgage.current = variableMortgage
    const { container } = render(<RatePeriodsCard />)

    await userEvent.click(screen.getByRole('button', { name: /add rate change/i }))

    const grids = findGrids(container, 'sm:grid-cols-2')
    expect(grids.length).toBeGreaterThanOrEqual(1)

    // No non-responsive grid-cols-2
    expect(findNonResponsiveGrids(container)).toHaveLength(0)
  })

  it('add form (variable rate) shows reference rate and spread fields', async () => {
    mockMortgage.current = variableMortgage
    render(<RatePeriodsCard />)

    await userEvent.click(screen.getByRole('button', { name: /add rate change/i }))

    // Multiple elements match Euribor 12M (initial rate display + form label)
    const euriborMatches = screen.getAllByText(/Euribor 12M/)
    expect(euriborMatches.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Spread (%)')).toBeDefined()
  })

  it('edit form (variable rate) uses responsive grid', async () => {
    mockMortgage.current = variableMortgage
    const { container } = render(<RatePeriodsCard />)

    // Find the rate period row by its rate text "3.4%" and click the edit button
    const rateSpan = screen.getByText('3.4%')
    const rateRow = rateSpan.closest('.p-2')!
    const editBtn = rateRow.querySelector('button')
    expect(editBtn).not.toBeNull()
    await userEvent.click(editBtn!)

    const grids = findGrids(container, 'sm:grid-cols-2')
    expect(grids.length).toBeGreaterThanOrEqual(1)
  })
})
