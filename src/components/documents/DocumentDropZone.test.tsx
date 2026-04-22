import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_FILE_SIZE, MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'
import { makeFile } from '@/test-utils/files'

// Entitlement mock: default to free tier so MAX_HOUSEHOLD_STORAGE (50 MB)
// stays the effective cap — preserves the existing test semantics.
// Mutable so individual tests can flip isLoading / tier.
const mockEntitlement = vi.hoisted(() => ({
  value: {
    entitlement: null as unknown,
    limits: {
      maxMembers: 1, maxStorageMB: 50, hasHouseholdInvites: false, hasAdvancedMortgage: false,
      hasBudget: false, hasExport: false, hasPrintSummary: false, hasMortgageWhatIf: false,
    },
    isPro: false,
    isLoading: false,
  },
}))
vi.mock('@/hooks/use-entitlement', () => ({
  useEntitlement: () => mockEntitlement.value,
}))

// DocumentDropZone now reads cross-feature storage via useStorageQuota ->
// useDocuments. Mock with default 0 bytes; tests that exercise quota flip
// this via mockDocuments.value.
const mockDocuments = vi.hoisted(() => ({ value: { totalStorageUsed: 0 } }))
vi.mock('@/context/DocumentContext', () => ({
  useDocuments: () => mockDocuments.value,
}))

// QuotaError reads useUpgradeDialog; mock it so tests don't need the provider.
// The tests verify rejection behavior, not CTA wiring — that's covered in QuotaError's own suite.
const mockOpenUpgrade = vi.fn()
vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({ open: mockOpenUpgrade, close: vi.fn(), isOpen: false, gate: null, product: 'pro' }),
}))

// QuotaError renders a <Link> from react-router (the "Manage files" CTA).
// Tests here don't exercise navigation — mock Link as a plain anchor so we
// don't have to wrap every render in MemoryRouter. Navigation behavior is
// covered by integration/route-level tests.
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) =>
      <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>,
  }
})

import { DocumentDropZone } from './DocumentDropZone'

// ── jsdom polyfills ──

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(() => {
  // Reset entitlement + document state to a known default between tests so
  // isLoading=true or a filled cap from one case can't leak into the next.
  mockEntitlement.value = {
    entitlement: null,
    limits: {
      maxMembers: 1, maxStorageMB: 50, hasHouseholdInvites: false, hasAdvancedMortgage: false,
      hasBudget: false, hasExport: false, hasPrintSummary: false, hasMortgageWhatIf: false,
    },
    isPro: false,
    isLoading: false,
  }
  mockDocuments.value = { totalStorageUsed: 0 }
  cleanup()
})

// ── Helpers ──

interface RenderDropZoneOverrides extends Partial<React.ComponentProps<typeof DocumentDropZone>> {
  /** Virtual household-storage bytes — routed into the useDocuments mock. */
  totalStorageUsed?: number
}

function renderDropZone(overrides: RenderDropZoneOverrides = {}) {
  const onFilesSelected = vi.fn()
  if (overrides.totalStorageUsed !== undefined) {
    mockDocuments.value = { totalStorageUsed: overrides.totalStorageUsed }
  }
  const result = render(
    <DocumentDropZone
      onFilesSelected={overrides.onFilesSelected ?? onFilesSelected}
      disabled={overrides.disabled}
    />
  )
  return { ...result, onFilesSelected }
}

// ── Tests ──

describe('DocumentDropZone', () => {
  describe('file validation', () => {
    it('rejects files with unsupported MIME type', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(
        <DocumentDropZone onFilesSelected={onFilesSelected} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const badFile = makeFile('script.exe', 'application/x-msdownload')
      fireEvent.change(input, { target: { files: [badFile] } })

      expect(onFilesSelected).not.toHaveBeenCalled()
      expect(screen.getByText(/not a supported file type/)).toBeDefined()
    })

    it('accepts valid image files', async () => {
      const onFilesSelected = vi.fn()
      const { container } = render(
        <DocumentDropZone onFilesSelected={onFilesSelected} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, makeFile('photo.png', 'image/png'))

      expect(onFilesSelected).toHaveBeenCalledOnce()
    })

    it('rejects files exceeding MAX_FILE_SIZE', async () => {
      const onFilesSelected = vi.fn()
      const { container } = render(
        <DocumentDropZone onFilesSelected={onFilesSelected} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, makeFile('huge.png', 'image/png', MAX_FILE_SIZE + 1))

      expect(onFilesSelected).not.toHaveBeenCalled()
      expect(screen.getByText(/exceeds 25 MB limit/)).toBeDefined()
    })
  })

  describe('storage quota', () => {
    it('shows upgrade CTA after free user hits quota on drop (converts instead of dead-ending)', async () => {
      // Just under cap — 500 bytes of headroom — so the dropzone still renders
      // (not the standing variant); drop a file that overflows and check the
      // inline upgrade appears. Past-cap scenarios are covered separately.
      mockDocuments.value = { totalStorageUsed: MAX_HOUSEHOLD_STORAGE - 500 }
      const onFilesSelected = vi.fn()
      const { container } = render(
        <DocumentDropZone onFilesSelected={onFilesSelected} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, makeFile('big.png', 'image/png', 1000))

      expect(onFilesSelected).not.toHaveBeenCalled()
      expect(screen.getByText('Upgrade storage')).toBeDefined()
    })

    it('opens upgrade dialog with storage gate when free user clicks CTA', async () => {
      mockOpenUpgrade.mockClear()
      renderDropZone({ totalStorageUsed: MAX_HOUSEHOLD_STORAGE })
      await userEvent.click(screen.getByRole('button', { name: 'Upgrade storage' }))
      expect(mockOpenUpgrade).toHaveBeenCalledWith('storage')
    })

    it('replaces dropzone with a standing upgrade CTA when free user is already at cap', () => {
      renderDropZone({ totalStorageUsed: MAX_HOUSEHOLD_STORAGE })
      // Standing variant shows the headline copy. The dropzone itself is not rendered.
      expect(screen.getByText("You're out of space")).toBeDefined()
    })
  })

  describe('entitlement loading state', () => {
    it('renders "preparing" copy + disabled input during entitlement cold-start', () => {
      mockEntitlement.value = {
        entitlement: null,
        limits: {
          maxMembers: 1, maxStorageMB: 50, hasHouseholdInvites: false, hasAdvancedMortgage: false,
          hasBudget: false, hasExport: false, hasPrintSummary: false, hasMortgageWhatIf: false,
        },
        isPro: false,
        isLoading: true,
      }
      const { container } = renderDropZone()
      expect(screen.getByText('Getting things ready…')).toBeDefined()
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      expect(input.disabled).toBe(true)
    })

    it('disables click/drag handlers during cold-start (user cannot trigger upload)', () => {
      mockEntitlement.value = {
        entitlement: null,
        limits: {
          maxMembers: 1, maxStorageMB: 50, hasHouseholdInvites: false, hasAdvancedMortgage: false,
          hasBudget: false, hasExport: false, hasPrintSummary: false, hasMortgageWhatIf: false,
        },
        isPro: false,
        isLoading: true,
      }
      const { container } = renderDropZone()
      // The dropzone carries the `cursor-not-allowed` affordance when disabled —
      // confirms click/drag handlers won't fire. Uses the exact class the
      // component applies so a future style refactor can't silently re-enable
      // the disabled branch without breaking this test.
      const zone = container.querySelector('[class*="cursor-not-allowed"]')
      expect(zone).not.toBeNull()
    })
  })

  describe('security trust messaging', () => {
    it('renders the security note inside the drop zone', () => {
      renderDropZone()
      expect(screen.getByText('Encrypted and visible only to your household')).toBeDefined()
    })

    it('renders the security note when explicitly disabled via prop', () => {
      renderDropZone({ disabled: true })
      expect(screen.getByText('Encrypted and visible only to your household')).toBeDefined()
    })
  })
})
