import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BudgetHealthCard } from './BudgetHealthCard'
import type { Expense } from '@/types/expense'
import type { BudgetConfig } from '@/types/budget'

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 100000,
    category: 'renovations',
    payer: 'alice',
    description: 'Test',
    date: '2026-01-01',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('BudgetHealthCard', () => {
  afterEach(cleanup)

  it('renders nothing when no category budgets exist', () => {
    const budget: BudgetConfig = { totalBudget: 10000000, categories: {}, updatedAt: '' }
    const { container } = render(<BudgetHealthCard expenses={[]} budget={budget} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows "All on track" when all categories are under budget', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 5000000 },
      updatedAt: '',
    }
    const expenses = [makeExpense({ amount: 1000000 })] // 10,000 of 50,000

    render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    expect(screen.getByText('All on track')).toBeTruthy()
    expect(screen.queryByText(/over limit/i)).toBeNull()
  })

  it('shows over-budget count badge when categories exceed budget', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 500000, furniture: 300000 },
      updatedAt: '',
    }
    const expenses = [
      makeExpense({ id: 'e1', category: 'renovations', amount: 600000 }), // over
      makeExpense({ id: 'e2', category: 'furniture', amount: 400000 }),    // over
    ]

    render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    expect(screen.getByText('2 over limit')).toBeTruthy()
  })

  it('sorts over-budget categories first', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 100000, furniture: 5000000 },
      updatedAt: '',
    }
    const expenses = [
      makeExpense({ id: 'e1', category: 'renovations', amount: 200000 }), // over (200%)
      makeExpense({ id: 'e2', category: 'furniture', amount: 1000000 }),   // on_track (20%)
    ]

    render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    const labels = screen.getAllByText(/Renovations|Furniture/)
    expect(labels[0].textContent).toBe('Renovations')
    expect(labels[1].textContent).toContain('Furniture')
  })

  it('shows categories with zero spend', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 5000000 },
      updatedAt: '',
    }

    render(<BudgetHealthCard expenses={[]} budget={budget} />)

    expect(document.body.textContent).toContain('Renovations')
  })

  it('accumulates multiple expenses in the same category', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 5000000 },
      updatedAt: '',
    }
    const expenses = [
      makeExpense({ id: 'e1', category: 'renovations', amount: 1000000 }),
      makeExpense({ id: 'e2', category: 'renovations', amount: 1500000 }),
      makeExpense({ id: 'e3', category: 'renovations', amount: 500000 }),
    ]

    render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    // 3 expenses sum to 30,000.00 of 50,000.00 budget
    expect(document.body.textContent).toContain('€30,000.00 of €50,000.00')
  })

  it('ignores expenses in non-budgeted categories', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 5000000 },
      updatedAt: '',
    }
    const expenses = [
      makeExpense({ id: 'e1', category: 'renovations', amount: 1000000 }),
      makeExpense({ id: 'e2', category: 'taxes', amount: 9000000 }),
    ]

    render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    // Only renovations should appear, taxes has no budget entry
    expect(document.body.textContent).toContain('Renovations')
    expect(document.body.textContent).not.toContain('Taxes')
  })

  it('shows warning status at exactly 80% spend', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 500000 },
      updatedAt: '',
    }
    // 4000 of 5000 = exactly 80%
    const expenses = [makeExpense({ amount: 400000, category: 'renovations' })]

    const { container } = render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    // Warning color #f59e0b should be applied to the progress bar
    const bar = container.querySelector('[style*="background-color"]')
    expect(bar).not.toBeNull()
    // The bar should use warning color (amber)
    const bars = container.querySelectorAll<HTMLElement>('.h-full.rounded-full')
    const barEl = bars[0]
    expect(barEl.style.backgroundColor).toBe('rgb(245, 158, 11)')
  })

  it('shows over status at exactly 100% spend', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 500000 },
      updatedAt: '',
    }
    // 5000 of 5000 = exactly 100%
    const expenses = [makeExpense({ amount: 500000, category: 'renovations' })]

    const { container } = render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    // Over color #dc2626 should be applied to the progress bar
    const bars = container.querySelectorAll<HTMLElement>('.h-full.rounded-full')
    expect(bars.length).toBe(1)
    expect(bars[0].style.backgroundColor).toBe('rgb(220, 38, 38)')
  })

  it('sorts categories correctly: over first, then warning, then on_track', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: {
        renovations: 1000000,  // will be over (150%)
        furniture: 1000000,    // will be warning (90%)
        moving: 1000000,       // will be on_track (50%)
      },
      updatedAt: '',
    }
    const expenses = [
      makeExpense({ id: 'e1', category: 'renovations', amount: 1500000 }), // 150% → over
      makeExpense({ id: 'e2', category: 'furniture', amount: 900000 }),     // 90% → warning
      makeExpense({ id: 'e3', category: 'moving', amount: 500000 }),        // 50% → on_track
    ]

    render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    const labels = screen.getAllByText(/Renovations|Furniture & Appliances|Moving Costs/)
    expect(labels[0].textContent).toBe('Renovations')
    expect(labels[1].textContent).toBe('Furniture & Appliances')
    expect(labels[2].textContent).toBe('Moving Costs')
  })

  it('renders nothing when budget category has 0 amount', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 0 },
      updatedAt: '',
    }
    const { container } = render(<BudgetHealthCard expenses={[]} budget={budget} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows "over by" amount for over-budget categories', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 500000 },
      updatedAt: '',
    }
    // 8000 spent on 5000 budget → over by 3000
    const expenses = [makeExpense({ amount: 800000, category: 'renovations' })]

    render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    // budget.overBy = "{{amount}} over" → "€3,000.00 over"
    expect(screen.getByText('€3,000.00 over')).toBeTruthy()
  })

  it('shows singular text for single over-budget category', () => {
    const budget: BudgetConfig = {
      totalBudget: 10000000,
      categories: { renovations: 500000, furniture: 5000000 },
      updatedAt: '',
    }
    const expenses = [
      makeExpense({ id: 'e1', category: 'renovations', amount: 600000 }), // over
      makeExpense({ id: 'e2', category: 'furniture', amount: 100000 }),    // on_track
    ]

    render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    // categoriesOver_one = "{{count}} over limit"
    expect(screen.getByText('1 over limit')).toBeTruthy()
  })

  it('renders all 14 categories when all are budgeted', () => {
    const budget: BudgetConfig = {
      totalBudget: 50000000,
      categories: {
        down_payment: 10000000,
        taxes: 3000000,
        notary_legal: 2000000,
        real_estate_agent: 2000000,
        financial_advisor: 1000000,
        valuation: 500000,
        home_inspection: 500000,
        title_registry: 500000,
        mortgage_fees: 1000000,
        insurance: 1000000,
        renovations: 5000000,
        furniture: 3000000,
        moving: 1000000,
        other: 500000,
      },
      updatedAt: '',
    }
    const expenses = [
      makeExpense({ id: 'e1', category: 'down_payment', amount: 5000000 }),
      makeExpense({ id: 'e2', category: 'taxes', amount: 1500000 }),
      makeExpense({ id: 'e3', category: 'renovations', amount: 6000000 }), // over limit
    ]

    const { container } = render(<BudgetHealthCard expenses={expenses} budget={budget} />)

    // All 14 categories should be rendered as rows
    const rows = container.querySelectorAll('.space-y-1')
    expect(rows.length).toBe(14)

    // Verify a sampling of category labels appear
    expect(document.body.textContent).toContain('Down Payment')
    expect(document.body.textContent).toContain('Taxes & Stamp Duty')
    expect(document.body.textContent).toContain('Notary & Legal')
    expect(document.body.textContent).toContain('Real Estate Agent')
    expect(document.body.textContent).toContain('Insurance')
    expect(document.body.textContent).toContain('Renovations')
    expect(document.body.textContent).toContain('Furniture & Appliances')
    expect(document.body.textContent).toContain('Moving Costs')
    expect(document.body.textContent).toContain('Other')
  })
})
