import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InfoTooltip } from './info-tooltip'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(cleanup)

describe('InfoTooltip', () => {
  it('renders the info icon button', () => {
    const { container } = render(<InfoTooltip text="Test tooltip" />)
    const button = container.querySelector('button')
    expect(button).not.toBeNull()
  })

  it('does not show tooltip text by default', () => {
    render(<InfoTooltip text="Test tooltip" />)
    expect(screen.queryByText('Test tooltip')).toBeNull()
  })

  it('shows tooltip text on click', async () => {
    const { container } = render(<InfoTooltip text="Test tooltip" />)
    const button = container.querySelector('button')!
    await userEvent.click(button)
    expect(screen.getByText('Test tooltip')).toBeDefined()
  })

  it('hides tooltip text on second click', async () => {
    const { container } = render(<InfoTooltip text="Test tooltip" />)
    const button = container.querySelector('button')!
    await userEvent.click(button)
    expect(screen.getByText('Test tooltip')).toBeDefined()
    await userEvent.click(button)
    expect(screen.queryByText('Test tooltip')).toBeNull()
  })

  describe('position="top" (default)', () => {
    it('renders tooltip above the trigger with bottom-full positioning', async () => {
      const { container } = render(<InfoTooltip text="Top tooltip" />)
      const button = container.querySelector('button')!
      await userEvent.click(button)

      const tooltip = screen.getByText('Top tooltip').closest('span[class*="absolute"]')
      expect(tooltip?.className).toContain('bottom-full')
      expect(tooltip?.className).toContain('mb-1.5')
    })

    it('renders arrow pointing down (border-t)', async () => {
      const { container } = render(<InfoTooltip text="Top tooltip" />)
      const button = container.querySelector('button')!
      await userEvent.click(button)

      const tooltip = screen.getByText('Top tooltip').closest('span[class*="absolute"]')
      const arrow = tooltip?.querySelector('span[class*="border-t-foreground"]')
      expect(arrow).not.toBeNull()
    })
  })

  describe('position="bottom"', () => {
    it('renders tooltip below the trigger with top-full positioning', async () => {
      const { container } = render(<InfoTooltip text="Bottom tooltip" position="bottom" />)
      const button = container.querySelector('button')!
      await userEvent.click(button)

      const tooltip = screen.getByText('Bottom tooltip').closest('span[class*="absolute"]')
      expect(tooltip?.className).toContain('top-full')
      expect(tooltip?.className).toContain('mt-1.5')
    })

    it('renders arrow pointing up (border-b)', async () => {
      const { container } = render(<InfoTooltip text="Bottom tooltip" position="bottom" />)
      const button = container.querySelector('button')!
      await userEvent.click(button)

      const tooltip = screen.getByText('Bottom tooltip').closest('span[class*="absolute"]')
      const arrow = tooltip?.querySelector('span[class*="border-b-foreground"]')
      expect(arrow).not.toBeNull()
    })
  })
})
