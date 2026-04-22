import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QuotaError } from './QuotaError'

const mockOpenUpgrade = vi.fn()
vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({ open: mockOpenUpgrade, close: vi.fn(), isOpen: false, gate: null, product: 'pro' }),
}))

// QuotaError contains a <Link to="/app/documents"> for the Manage files CTA,
// which requires a Router context. Wrap every render so tests don't each
// have to remember the boilerplate.
function renderQuotaError(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

afterEach(() => {
  mockOpenUpgrade.mockClear()
  cleanup()
})

describe('QuotaError — free tier', () => {
  it('inline variant: shows a free-tier cue next to the upgrade CTA', () => {
    renderQuotaError(<QuotaError isPro={false} variant="inline" />)
    expect(screen.getByText('Upgrade storage')).toBeDefined()
    // Copy intentionally names the plan (not a raw MB number) so each locale
    // can phrase the short inline banner idiomatically without a unit mismatch.
    expect(screen.getByText(/free plan/i)).toBeDefined()
  })

  it('standing variant: shows headline, body, and upgrade CTA (not the dropzone)', () => {
    renderQuotaError(<QuotaError isPro={false} variant="standing" />)
    expect(screen.getByText("You're out of space")).toBeDefined()
    expect(screen.getByRole('button', { name: 'Upgrade storage' })).toBeDefined()
  })

  it('clicking the upgrade CTA opens the dialog with the "storage" gate', async () => {
    renderQuotaError(<QuotaError isPro={false} variant="inline" />)
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade storage' }))
    expect(mockOpenUpgrade).toHaveBeenCalledWith('storage')
  })

  it('standing variant: exposes a secondary "Manage files" link pointing to /app/documents', () => {
    // Closes the loop when the user would rather clean up than upgrade.
    // Free-tier standing shows both: primary upgrade CTA + secondary manage-files link.
    renderQuotaError(<QuotaError isPro={false} variant="standing" />)
    const link = screen.getByRole('link', { name: /manage files/i })
    expect(link.getAttribute('href')).toBe('/app/documents')
  })
})

describe('QuotaError — pro tier', () => {
  it('inline variant: shows a delete-files notice instead of the upgrade CTA', () => {
    renderQuotaError(<QuotaError isPro={true} variant="inline" />)
    expect(screen.queryByText('Upgrade storage')).toBeNull()
    expect(screen.getByText(/500 MB/)).toBeDefined()
    expect(screen.getByText(/delete/i)).toBeDefined()
  })

  it('standing variant: same plain notice — no fake upgrade CTA for paying users', () => {
    renderQuotaError(<QuotaError isPro={true} variant="standing" />)
    expect(screen.queryByText('Upgrade storage')).toBeNull()
    expect(screen.getByText(/500 MB/)).toBeDefined()
  })

  it('exposes the "Manage files" link for Pro users (their ONLY next action since no upgrade path)', () => {
    // Pro users hitting the cap have no upgrade CTA — the manage-files link
    // is the only escape. This test would've caught a regression where the
    // link was gated on `!isPro` and Pro users got a notice with no action.
    renderQuotaError(<QuotaError isPro={true} variant="inline" />)
    const link = screen.getByRole('link', { name: /manage files/i })
    expect(link.getAttribute('href')).toBe('/app/documents')
  })
})
