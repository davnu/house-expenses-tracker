import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }))

vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({ isOpen: false, gate: null, open: openMock, close: vi.fn() }),
}))

vi.mock('@/lib/billing', () => ({
  PRICES: { pro: { amount: 4900, currency: 'EUR', display: '€49' } },
}))

import { LockOverlay } from './LockOverlay'

beforeEach(() => openMock.mockClear())
afterEach(cleanup)

describe('LockOverlay', () => {
  it('renders children untouched when inactive (no overlay, no blur wrapper)', () => {
    const { container } = render(
      <LockOverlay gate="invite" active={false}>
        <button>Invite someone</button>
      </LockOverlay>
    )
    // The active overlay wraps children in a `relative` div with a blur layer.
    // When inactive, the wrapper is absent.
    expect(container.querySelector('.blur-\\[2px\\]')).toBeNull()
    expect(screen.getByRole('button', { name: /Invite someone/i })).toBeTruthy()
  })

  it('shows an Unlock pill over the blurred children when active', () => {
    render(
      <LockOverlay gate="invite" active={true}>
        <button>Original feature</button>
      </LockOverlay>
    )
    // Default label uses the Pro price
    expect(screen.getByText(/Unlock for €49/i)).toBeTruthy()
    // The underlying children are still in the DOM (blurred, but present —
    // this is important because it teases the real value to free users).
    expect(screen.getByText('Original feature')).toBeTruthy()
  })

  it('clicking the pill calls openUpgrade with the provided gate', async () => {
    const user = userEvent.setup()
    render(
      <LockOverlay gate="advanced_mortgage" active={true}>
        <div>advanced card</div>
      </LockOverlay>
    )
    await user.click(screen.getByText(/Unlock for €49/i))
    expect(openMock).toHaveBeenCalledWith('advanced_mortgage')
  })

  it('accepts a custom label that overrides the default price copy', () => {
    render(
      <LockOverlay gate="invite" active={true} label="Go Pro">
        <div>x</div>
      </LockOverlay>
    )
    expect(screen.getByText('Go Pro')).toBeTruthy()
    expect(screen.queryByText(/Unlock for €49/i)).toBeNull()
  })

  it('renders a smaller compact pill when compact is true', () => {
    render(
      <LockOverlay gate="invite" active={true} compact>
        <div>x</div>
      </LockOverlay>
    )
    const pill = screen.getByText(/Unlock for €49/i)
    // Compact pill uses smaller text class
    expect(pill.className).toMatch(/text-xs/)
  })

  it('blurred children are aria-hidden so screen-readers skip the teaser state', () => {
    const { container } = render(
      <LockOverlay gate="invite" active={true}>
        <div>should be hidden from a11y</div>
      </LockOverlay>
    )
    const hidden = container.querySelector('[aria-hidden="true"]')
    expect(hidden).not.toBeNull()
    expect(hidden?.textContent).toContain('should be hidden from a11y')
  })

  it('blurred children are also `inert` — prevents keyboard users from tabbing into locked features (a11y fix)', () => {
    const { container } = render(
      <LockOverlay gate="invite" active={true}>
        <button>focusable inner button</button>
      </LockOverlay>
    )
    const blurredLayer = container.querySelector('[aria-hidden="true"]')
    expect(blurredLayer).not.toBeNull()
    // The inert attribute — widely supported since 2023 — takes the whole subtree
    // out of the focus/tab order, closing the gap that aria-hidden alone leaves.
    expect(blurredLayer?.hasAttribute('inert')).toBe(true)
  })

  it('the unlock pill has an accessible name (screen readers announce "Unlock for €49")', () => {
    render(
      <LockOverlay gate="invite" active={true}>
        <div>x</div>
      </LockOverlay>
    )
    // Button accessible via aria-label for screen readers
    expect(screen.getByRole('button', { name: /Unlock for €49/i })).toBeTruthy()
  })
})
