import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }))
vi.mock('@/lib/analytics', () => ({
  track: trackMock,
  isAppRoute: (p: string) => p.startsWith('/app'),
}))

import { PricingPage } from './PricingPage'

beforeEach(() => trackMock.mockReset())
afterEach(cleanup)

function renderPage() {
  return render(<MemoryRouter><PricingPage /></MemoryRouter>)
}

describe('PricingPage', () => {
  it('fires the `pricing_view` analytics event on mount (public route)', () => {
    renderPage()
    expect(trackMock).toHaveBeenCalledWith('pricing_view')
  })

  it('shows free + Pro tiers with prices (€0 and €49)', () => {
    renderPage()
    expect(screen.getByText('€0')).toBeTruthy()
    expect(screen.getByText('€49')).toBeTruthy()
  })

  it('surfaces the price-context microcopy (no subscription reassurance)', () => {
    renderPage()
    expect(screen.getByText(/Less than the notary signing fee/i)).toBeTruthy()
  })

  it('shows the additional-house add-on with its price', () => {
    renderPage()
    expect(screen.getByText(/Additional house — €29/i)).toBeTruthy()
  })

  it('has an FAQ section answering the most common questions', () => {
    renderPage()
    expect(screen.getByText(/Questions, answered/i)).toBeTruthy()
    // The three FAQ questions that cover the audit-flagged buyer concerns
    expect(screen.getByText(/really one-time/i)).toBeTruthy()
    expect(screen.getByText(/not sure yet/i)).toBeTruthy()
    expect(screen.getByText(/second house/i)).toBeTruthy()
  })

  it('fires `pricing_cta_click` with plan name when the Pro CTA is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('link', { name: /Get Pro/i }))
    expect(trackMock).toHaveBeenCalledWith('pricing_cta_click', { plan: 'pro' })
  })

  it('fires `pricing_cta_click` with plan "free" when the free CTA is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('link', { name: /Start tracking for free/i }))
    expect(trackMock).toHaveBeenCalledWith('pricing_cta_click', { plan: 'free' })
  })

  it('has a link to the privacy page in the footer (SEO + trust)', () => {
    renderPage()
    const privacy = screen.getByRole('link', { name: /Privacy Policy/i })
    expect((privacy as HTMLAnchorElement).getAttribute('href')).toBe('/privacy')
  })

  it('CTAs route to /login (new user signup flow)', () => {
    renderPage()
    const proLink = screen.getByRole('link', { name: /Get Pro/i })
    expect((proLink as HTMLAnchorElement).getAttribute('href')).toBe('/login')
  })
})
