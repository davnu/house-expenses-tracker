import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

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
  window.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
})

// ── Mocks ─────────────────────────────────────────────

const { mockExpenses, mockMortgage } = vi.hoisted(() => ({
  mockExpenses: { current: [] as Array<{ id: string; amount: number; category: string; payer: string; description: string; date: string; createdAt: string; updatedAt: string }> },
  mockMortgage: { current: null as object | null },
}))

vi.mock('@/context/ExpenseContext', () => ({
  useExpenses: () => ({
    expenses: mockExpenses.current,
    loading: false,
    storageUsed: 0,
    pendingExpenseIds: new Set(),
    pendingAttachmentIds: new Set(),
    addExpenseWithFiles: vi.fn(),
  }),
}))

vi.mock('@/context/MortgageContext', () => ({
  useMortgage: () => ({
    mortgage: mockMortgage.current,
    loading: false,
  }),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    house: { id: 'h1', name: 'Test House', ownerId: 'alice', memberIds: ['alice'], createdAt: '' },
    members: [{ uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#3b82f6', role: 'owner', joinedAt: '' }],
    getMemberName: () => 'Alice',
    getMemberColor: () => '#3b82f6',
  }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'alice' } }),
}))

vi.mock('@/lib/mortgage-utils', () => ({
  getMortgageStats: () => ({
    principalPaidSoFar: 500000,
    interestPaidSoFar: 300000,
    progressPercent: 2.5,
    remainingBalance: 19500000,
    monthsRemaining: 350,
    payoffDate: '2055-01',
    totalInterest: 12000000,
    totalCost: 32000000,
    monthlyPayment: 89000,
  }),
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
  PieChart: () => null,
  Pie: () => null,
  Legend: () => null,
  AreaChart: () => null,
  Area: () => null,
}))

import React from 'react'
import { DashboardPage } from './DashboardPage'

function renderPage() {
  const { container } = render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
  return container
}

// ── Tests ─────────────────────────────────────────────

describe('DashboardPage', () => {
  beforeEach(() => {
    mockExpenses.current = []
    mockMortgage.current = null
  })

  describe('empty state', () => {
    it('explains what the dashboard will show once populated', () => {
      const container = renderPage()

      expect(container.textContent).toContain('Track every cost of your purchase')
      expect(container.textContent).toContain('total spend')
      expect(container.textContent).toContain('breakdown by category')
    })

    it('shows two equal action cards: log cost and set up mortgage', () => {
      const container = renderPage()

      expect(container.textContent).toContain('Log a cost')
      expect(container.textContent).toContain('Down payment, notary, taxes, renovations...')
      expect(container.textContent).toContain('Set up mortgage')
      expect(container.textContent).toContain('Payments, interest, and payoff progress')
    })

    it('mortgage card links to /mortgage', () => {
      const container = renderPage()

      const link = container.querySelector('a[href="/mortgage"]')
      expect(link).not.toBeNull()
      expect(link!.textContent).toContain('Set up mortgage')
    })

    it('clicking the expense card opens QuickAddDialog', async () => {
      const user = userEvent.setup()
      const container = renderPage()

      const card = container.querySelector('[role="button"]')!
      await user.click(card)

      expect(container.ownerDocument.body.textContent).toContain('Add Expense')
    })

    it('expense card is keyboard accessible', async () => {
      const user = userEvent.setup()
      const container = renderPage()

      const card = container.querySelector('[role="button"]') as HTMLElement
      card.focus()
      await user.keyboard('{Enter}')

      expect(container.ownerDocument.body.textContent).toContain('Add Expense')
    })
  })

  describe('with data', () => {
    it('hides empty state when expenses exist', () => {
      mockExpenses.current = [{
        id: 'e1', amount: 100000, category: 'notary_legal', payer: 'alice',
        description: 'Notary', date: '2026-01-01', createdAt: '', updatedAt: '',
      }]

      const container = renderPage()

      expect(container.textContent).not.toContain('Track every cost of your purchase')
      expect(container.textContent).not.toContain('Log your first cost')
    })

    it('hides empty state when mortgage exists (even with no expenses)', () => {
      mockMortgage.current = {
        principal: 20000000, annualRate: 3.5, termYears: 30,
        startDate: '2025-01-01', rateType: 'fixed', amortizationType: 'french',
        monthlyPayment: 89000, monthlyPaymentOverride: false,
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }

      const container = renderPage()

      expect(container.textContent).not.toContain('Track every cost of your purchase')
    })
  })
})
