import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TotalCostCard } from './TotalCostCard'
import type { Expense } from '@/types/expense'
import type { BudgetConfig } from '@/types/budget'

afterEach(cleanup)

// ── Test helpers ──

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 100000, // €1,000.00
    category: 'renovations',
    payer: 'alice',
    description: 'Test',
    date: '2026-01-01',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function makeBudget(overrides: Partial<BudgetConfig> = {}): BudgetConfig {
  return {
    totalBudget: 10000000, // €100,000.00
    categories: {},
    updatedAt: '',
    ...overrides,
  }
}

// ── Tests ──

describe('TotalCostCard', () => {
  describe('no budget', () => {
    it('renders total without budget bar when budget is undefined', () => {
      const expenses = [
        makeExpense({ id: 'e1', amount: 500000 }),
        makeExpense({ id: 'e2', amount: 300000 }),
      ]
      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} />
      )

      // Shows the total (€8,000.00)
      expect(container.textContent).toContain('8,000.00')
      // Shows "Total House Cost" label
      expect(container.textContent).toContain('Total House Cost')
      // No budget bar text should appear
      expect(container.textContent).not.toContain('remaining')
      expect(container.textContent).not.toContain('over')
      expect(container.textContent).not.toContain(' of ')
    })

    it('renders correctly when budget is explicitly null', () => {
      const expenses = [makeExpense({ id: 'e1', amount: 200000 })]
      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} budget={null} />
      )

      expect(container.textContent).toContain('2,000.00')
      expect(container.textContent).toContain('Total House Cost')
      // No budget elements
      expect(container.textContent).not.toContain('remaining')
      expect(container.textContent).not.toContain('over')
    })
  })

  describe('budget on-track (<80%)', () => {
    it('shows green bar and remaining text', () => {
      // 50,000 of 100,000 = 50%
      const expenses = [makeExpense({ id: 'e1', amount: 5000000 })]
      const budget = makeBudget({ totalBudget: 10000000 })

      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} budget={budget} />
      )

      // Shows "remaining" text
      expect(container.textContent).toContain('remaining')
      expect(container.textContent).not.toContain('over')

      // Bar should have green color (#2a9d90)
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar).toBeTruthy()
      expect(bar.style.backgroundColor).toBe('rgb(42, 157, 144)')
      expect(bar.style.width).toBe('50%')
    })
  })

  describe('budget warning (80-99%)', () => {
    it('shows amber bar', () => {
      // 90,000 of 100,000 = 90%
      const expenses = [makeExpense({ id: 'e1', amount: 9000000 })]
      const budget = makeBudget({ totalBudget: 10000000 })

      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} budget={budget} />
      )

      // Still under budget so shows remaining
      expect(container.textContent).toContain('remaining')

      // Bar should have amber color (#f59e0b)
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar).toBeTruthy()
      expect(bar.style.backgroundColor).toBe('rgb(245, 158, 11)')
      expect(bar.style.width).toBe('90%')
    })
  })

  describe('budget over (>=100%)', () => {
    it('shows red bar, "over" text, bar capped at 100%', () => {
      // 120,000 of 100,000 = 120%
      const expenses = [makeExpense({ id: 'e1', amount: 12000000 })]
      const budget = makeBudget({ totalBudget: 10000000 })

      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} budget={budget} />
      )

      // Shows "over" text (not "remaining")
      expect(container.textContent).toContain('over')
      expect(container.textContent).not.toContain('remaining')

      // Bar should have red color (#dc2626) and be capped at 100%
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar).toBeTruthy()
      expect(bar.style.backgroundColor).toBe('rgb(220, 38, 38)')
      expect(bar.style.width).toBe('100%')
    })
  })

  describe('boundary: exactly at 80%', () => {
    it('triggers warning threshold', () => {
      // 80,000 of 100,000 = exactly 80%
      const expenses = [makeExpense({ id: 'e1', amount: 8000000 })]
      const budget = makeBudget({ totalBudget: 10000000 })

      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} budget={budget} />
      )

      // At exactly 80%, getBudgetStatus returns 'warning'
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar).toBeTruthy()
      expect(bar.style.backgroundColor).toBe('rgb(245, 158, 11)') // amber
      expect(bar.style.width).toBe('80%')

      // Still under budget, so shows remaining
      expect(container.textContent).toContain('remaining')
    })
  })

  describe('boundary: exactly at 100%', () => {
    it('triggers over threshold', () => {
      // 100,000 of 100,000 = exactly 100%
      const expenses = [makeExpense({ id: 'e1', amount: 10000000 })]
      const budget = makeBudget({ totalBudget: 10000000 })

      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} budget={budget} />
      )

      // At exactly 100%, getBudgetStatus returns 'over'
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar).toBeTruthy()
      expect(bar.style.backgroundColor).toBe('rgb(220, 38, 38)') // red
      expect(bar.style.width).toBe('100%')

      // Exactly at budget: total <= budget is true, so shows "remaining" with €0.00
      expect(container.textContent).toContain('remaining')
    })
  })

  describe('zero state with budget', () => {
    it('shows €0.00 spent with full budget remaining', () => {
      const budget = makeBudget({ totalBudget: 10000000 })

      const { container } = render(
        <TotalCostCard expenses={[]} mortgagePaid={0} budget={budget} />
      )

      // Total is €0.00
      expect(container.textContent).toContain('0.00')
      // Full budget remaining
      expect(container.textContent).toContain('remaining')
      expect(container.textContent).not.toContain('over')

      // Bar width is 0%
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar).toBeTruthy()
      expect(bar.style.width).toBe('0%')
    })
  })

  describe('expenses + mortgage combined vs budget', () => {
    it('both contribute to the total and budget calculation', () => {
      // Expenses: €30,000 + mortgage: €20,000 = €50,000 total
      const expenses = [makeExpense({ id: 'e1', amount: 3000000 })]
      const mortgagePaid = 2000000
      const budget = makeBudget({ totalBudget: 10000000 }) // €100,000

      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={mortgagePaid} budget={budget} />
      )

      // Total should be €50,000.00
      expect(container.textContent).toContain('50,000.00')
      // Budget bar at 50%
      const bar = container.querySelector('[style*="background-color"]') as HTMLElement
      expect(bar).toBeTruthy()
      expect(bar.style.width).toBe('50%')
      // Shows remaining
      expect(container.textContent).toContain('remaining')
    })
  })

  describe('mortgage amount visibility', () => {
    it('shows mortgage line when mortgagePaid > 0', () => {
      const expenses = [makeExpense({ id: 'e1', amount: 500000 })]
      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={200000} />
      )

      // Mortgage text should appear with formatted amount
      expect(container.textContent).toContain('Mortgage')
      expect(container.textContent).toContain('2,000.00')
    })

    it('hides mortgage line when mortgagePaid is 0', () => {
      const expenses = [makeExpense({ id: 'e1', amount: 500000 })]
      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} />
      )

      expect(container.textContent).not.toContain('Mortgage')
    })
  })

  describe('empty expenses array', () => {
    it('renders €0.00 total with no expenses', () => {
      const { container } = render(
        <TotalCostCard expenses={[]} mortgagePaid={0} />
      )

      expect(container.textContent).toContain('0.00')
      expect(container.textContent).toContain('Total House Cost')
      // Expense count text should show 0
      expect(container.textContent).toContain('0 expenses')
    })
  })

  describe('budget with totalBudget=0', () => {
    it('is treated as no budget (hasBudget is false)', () => {
      const budget = makeBudget({ totalBudget: 0 })
      const expenses = [makeExpense({ id: 'e1', amount: 500000 })]

      const { container } = render(
        <TotalCostCard expenses={expenses} mortgagePaid={0} budget={budget} />
      )

      // No budget elements should appear
      expect(container.textContent).not.toContain('remaining')
      expect(container.textContent).not.toContain('over')
      expect(container.textContent).not.toContain(' of ')

      // Should not have a progress bar
      const bar = container.querySelector('[style*="background-color"]')
      expect(bar).toBeNull()
    })
  })
})
