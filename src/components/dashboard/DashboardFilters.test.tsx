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
})

// ── Mocks ──

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    members: [
      { uid: 'alice', displayName: 'Alice', email: 'a@a.com', color: '#2a9d90', role: 'owner', joinedAt: '' },
    ],
    getMemberName: () => 'Alice',
    getMemberColor: () => '#2a9d90',
  }),
}))

import { DashboardFilters } from './DashboardFilters'
import type { ExpenseCategory } from '@/types/expense'

afterEach(cleanup)

describe('DashboardFilters responsive layout', () => {
  const defaultProps = {
    filters: {},
    onChange: vi.fn(),
    usedCategories: ['notary' as ExpenseCategory],
  }

  it('custom date range uses responsive grid layout', async () => {
    const { container } = render(<DashboardFilters {...defaultProps} />)

    await userEvent.click(screen.getByText('Filters'))
    await userEvent.click(screen.getByText('Custom'))

    // Grid stacks on mobile (grid-cols-1), goes inline on sm+ (1fr auto 1fr)
    const grids = Array.from(container.querySelectorAll<HTMLElement>('[class]')).filter((el) => {
      const cls = el.getAttribute('class') ?? ''
      return cls.includes('grid') && cls.includes('sm:grid-cols-')
    })
    expect(grids.length).toBeGreaterThanOrEqual(1)
  })

  it('custom date range renders both date inputs with aria-labels', async () => {
    render(<DashboardFilters {...defaultProps} />)

    await userEvent.click(screen.getByText('Filters'))
    await userEvent.click(screen.getByText('Custom'))

    expect(screen.getByLabelText('Start date')).toBeDefined()
    expect(screen.getByLabelText('End date')).toBeDefined()
  })

  it('"to" label is hidden on mobile (sm:block)', async () => {
    render(<DashboardFilters {...defaultProps} />)

    await userEvent.click(screen.getByText('Filters'))
    await userEvent.click(screen.getByText('Custom'))

    const toLabel = screen.getByText('to')
    expect(toLabel.className).toContain('hidden')
    expect(toLabel.className).toContain('sm:block')
  })

  it('aligns items center only on sm+ screens', async () => {
    const { container } = render(<DashboardFilters {...defaultProps} />)

    await userEvent.click(screen.getByText('Filters'))
    await userEvent.click(screen.getByText('Custom'))

    const gridContainer = Array.from(container.querySelectorAll<HTMLElement>('[class]')).find((el) => {
      const cls = el.getAttribute('class') ?? ''
      return cls.includes('grid') && cls.includes('sm:grid-cols-')
    })
    expect(gridContainer).toBeDefined()
    expect(gridContainer!.getAttribute('class')).toContain('sm:items-center')
  })
})
