import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_FILE_SIZE, MAX_FILES_PER_EXPENSE, MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'
import { makeFile } from '@/test-utils/files'

// Entitlement mock: default to free tier so MAX_HOUSEHOLD_STORAGE (50 MB)
// stays the effective cap. Mutable so tests can flip isLoading.
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

// useStorageQuota pulls totalStorageUsed from DocumentContext. Mock it so
// tests can dial in how much household storage is already consumed without
// standing up the provider tree. This is the key to testing the cross-
// feature quota: the number here = expense bytes + document bytes.
const mockDocuments = vi.hoisted(() => ({ value: { totalStorageUsed: 0 } }))
vi.mock('@/context/DocumentContext', () => ({
  useDocuments: () => mockDocuments.value,
}))

// QuotaError reads useUpgradeDialog; mock it so tests don't need the provider.
const mockOpenUpgrade = vi.fn()
vi.mock('@/context/UpgradeDialogContext', () => ({
  useUpgradeDialog: () => ({ open: mockOpenUpgrade, close: vi.fn(), isOpen: false, gate: null, product: 'pro' }),
}))

// QuotaError renders a <Link> from react-router ("Manage files" CTA). Mock
// as a plain anchor — these tests don't exercise navigation.
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) =>
      <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>,
  }
})

import { FileDropZone } from './FileDropZone'

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
  // Reset entitlement between tests so a flipped isLoading / tier can't leak.
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

interface RenderDropZoneOverrides extends Partial<React.ComponentProps<typeof FileDropZone>> {
  /** Virtual household-storage bytes — fed into the useDocuments mock via useStorageQuota. */
  householdStorageUsed?: number
}

function renderDropZone(overrides: RenderDropZoneOverrides = {}) {
  const onChange = vi.fn()
  if (overrides.householdStorageUsed !== undefined) {
    mockDocuments.value = { totalStorageUsed: overrides.householdStorageUsed }
  }
  const result = render(
    <FileDropZone
      files={overrides.files ?? []}
      onChange={overrides.onChange ?? onChange}
      existingCount={overrides.existingCount}
    />
  )
  return { ...result, onChange }
}

// ── Tests ──

describe('FileDropZone', () => {
  describe('file validation', () => {
    it('rejects files with unsupported MIME type (e.g. via drag-and-drop)', () => {
      // userEvent.upload respects the accept attribute, but drag-and-drop doesn't.
      // Use fireEvent.change to simulate an unfiltered file reaching addFiles.
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const badFile = makeFile('script.exe', 'application/x-msdownload')
      fireEvent.change(input, { target: { files: [badFile] } })

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByText(/not a supported file type/)).toBeDefined()
    })

    it('accepts valid image files', async () => {
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const goodFile = makeFile('photo.png', 'image/png')
      await userEvent.upload(input, goodFile)

      expect(onChange).toHaveBeenCalledOnce()
      expect(onChange.mock.calls[0][0]).toHaveLength(1)
      expect(onChange.mock.calls[0][0][0].name).toBe('photo.png')
    })

    it('accepts valid PDF files', async () => {
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, makeFile('doc.pdf', 'application/pdf'))

      expect(onChange).toHaveBeenCalledOnce()
    })

    it('rejects files exceeding MAX_FILE_SIZE', async () => {
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const bigFile = makeFile('huge.png', 'image/png', MAX_FILE_SIZE + 1)
      await userEvent.upload(input, bigFile)

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByText(/exceeds 25 MB limit/)).toBeDefined()
    })

    it('rejects file at exactly MAX_FILE_SIZE to match server-side strict `<` rule', async () => {
      // storage.rules uses `request.resource.size < 25 * 1024 * 1024`, so a
      // file of exactly 25 MB would pass client but fail server with a 403.
      // The client now matches the server to surface a specific message.
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const exactFile = makeFile('exact.png', 'image/png', MAX_FILE_SIZE)
      await userEvent.upload(input, exactFile)

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByText(/exceeds 25 MB limit/)).toBeDefined()
    })

    it('accepts file at MAX_FILE_SIZE - 1 byte', async () => {
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const justUnder = makeFile('almost.png', 'image/png', MAX_FILE_SIZE - 1)
      await userEvent.upload(input, justUnder)

      expect(onChange).toHaveBeenCalledOnce()
    })
  })

  describe('duplicate detection', () => {
    it('silently skips files with same name and size', async () => {
      const existing = makeFile('receipt.pdf', 'application/pdf', 5000)
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[existing]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const duplicate = makeFile('receipt.pdf', 'application/pdf', 5000)
      await userEvent.upload(input, duplicate)

      // onChange should not be called since the only file was a duplicate
      expect(onChange).not.toHaveBeenCalled()
    })

    it('allows files with same name but different size', async () => {
      const existing = makeFile('receipt.pdf', 'application/pdf', 5000)
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[existing]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const different = makeFile('receipt.pdf', 'application/pdf', 6000)
      await userEvent.upload(input, different)

      expect(onChange).toHaveBeenCalledOnce()
    })
  })

  describe('file count limit', () => {
    it('rejects files when per-expense count is at limit', async () => {
      const existingFiles = Array.from({ length: MAX_FILES_PER_EXPENSE }, (_, i) =>
        makeFile(`file${i}.png`, 'image/png')
      )
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={existingFiles} onChange={onChange} />
      )

      // Should show "File limit reached"
      expect(screen.getByText('File limit reached')).toBeDefined()

      // Input should be disabled
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      expect(input.disabled).toBe(true)
    })

    it('counts existingCount toward the limit', async () => {
      // 9 existing on server + 0 local = 9 total, 1 slot left
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} existingCount={MAX_FILES_PER_EXPENSE - 1} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const file1 = makeFile('one.png', 'image/png')
      const file2 = makeFile('two.png', 'image/png')
      await userEvent.upload(input, [file1, file2])

      // Should accept 1 file, reject the 2nd
      expect(onChange).toHaveBeenCalledOnce()
      expect(onChange.mock.calls[0][0]).toHaveLength(1)
      expect(screen.getByText(/Maximum/)).toBeDefined()
    })
  })

  describe('storage quota (cross-feature: expense attachments + documents share the cap)', () => {
    it('rejects files + shows upgrade CTA when household storage would be exceeded', async () => {
      // Household bytes mocked via useDocuments — covers both expense
      // attachment bytes AND document bytes. Filling the cap from either
      // source blocks the expense dropzone, which is the cross-feature fix.
      mockDocuments.value = { totalStorageUsed: MAX_HOUSEHOLD_STORAGE - 500 }
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const bigFile = makeFile('big.png', 'image/png', 1000) // 1000 > 500 remaining
      await userEvent.upload(input, bigFile)

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByText('Upgrade storage')).toBeDefined()
    })

    it('opens upgrade dialog with storage gate when CTA is clicked', async () => {
      mockOpenUpgrade.mockClear()
      mockDocuments.value = { totalStorageUsed: MAX_HOUSEHOLD_STORAGE - 500 }
      const { container } = render(
        <FileDropZone files={[]} onChange={vi.fn()} />
      )
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, makeFile('big.png', 'image/png', 1000))
      await userEvent.click(screen.getByRole('button', { name: 'Upgrade storage' }))
      expect(mockOpenUpgrade).toHaveBeenCalledWith('storage')
    })

    it('replaces dropzone with standing upgrade CTA when at cap (no files staged)', () => {
      // Post-fix: the expense-form dropzone mirrors the document dropzone —
      // at-cap renders the big-CTA standing QuotaError, not a greyed box.
      renderDropZone({ householdStorageUsed: MAX_HOUSEHOLD_STORAGE })
      expect(screen.getByText("You're out of space")).toBeDefined()
      expect(screen.getByRole('button', { name: 'Upgrade storage' })).toBeDefined()
    })

    it('keeps the dropzone visible when at cap but the user has already staged files', () => {
      // If the user already has staged files in the form, they need to be able
      // to remove them — hiding the dropzone entirely would hide the file list.
      // Standing variant only shows when `files.length === 0`.
      mockDocuments.value = { totalStorageUsed: MAX_HOUSEHOLD_STORAGE }
      const staged = [makeFile('already-picked.png', 'image/png', 100)]
      renderDropZone({ files: staged })
      // No standing banner; falls through to the classic (disabled) dropzone.
      expect(screen.queryByText("You're out of space")).toBeNull()
      // But the subtext acknowledges the cap state.
      expect(screen.getByText('Storage limit reached')).toBeDefined()
    })

    it('expense dropzone is blocked when ONLY documents have filled the cap (regression)', () => {
      // Scenario from the bug report: user has zero expense attachments but
      // documents already at 50/50. Pre-fix, the expense dropzone saw 0 used
      // and allowed more uploads. Post-fix, useStorageQuota sees the combined
      // bytes from DocumentContext (expenses: 0 + docs: 50 MB = 50 MB), and
      // the dropzone replaces itself with the standing upgrade CTA.
      mockDocuments.value = { totalStorageUsed: MAX_HOUSEHOLD_STORAGE }
      renderDropZone()
      expect(screen.getByText("You're out of space")).toBeDefined()
      expect(screen.getByRole('button', { name: 'Upgrade storage' })).toBeDefined()
    })

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

    it('accumulates pending file sizes in quota check', async () => {
      mockDocuments.value = { totalStorageUsed: MAX_HOUSEHOLD_STORAGE - 100 }
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const file1 = makeFile('a.png', 'image/png', 60)
      const file2 = makeFile('b.png', 'image/png', 60)
      await userEvent.upload(input, [file1, file2])

      // First file (60) fits within 100 remaining, second (60+60=120) exceeds
      expect(onChange).toHaveBeenCalledOnce()
      expect(onChange.mock.calls[0][0]).toHaveLength(1)
      expect(onChange.mock.calls[0][0][0].name).toBe('a.png')
    })
  })

  describe('file list display', () => {
    it('renders file names in the list', () => {
      const files = [makeFile('contract.pdf', 'application/pdf', 50000)]
      renderDropZone({ files })

      expect(screen.getByText('contract.pdf')).toBeDefined()
    })

    it('renders file sizes formatted correctly', () => {
      const files = [makeFile('photo.png', 'image/png', 2048)]
      renderDropZone({ files })

      expect(screen.getByText('2.0 KB')).toBeDefined()
    })

    it('renders extension badge for known types', () => {
      const files = [makeFile('doc.pdf', 'application/pdf')]
      renderDropZone({ files })

      expect(screen.getByText('PDF')).toBeDefined()
    })

    it('renders remove button for each file', () => {
      const files = [
        makeFile('a.pdf', 'application/pdf'),
        makeFile('b.png', 'image/png'),
      ]
      const onChange = vi.fn()
      render(<FileDropZone files={files} onChange={onChange} />)

      // Each file has a remove button (X icon inside a button)
      const buttons = screen.getAllByRole('button')
      // 2 remove buttons (the drop zone itself is a div, not a button)
      const removeButtons = buttons.filter((b) => b.querySelector('svg'))
      expect(removeButtons.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('counter display', () => {
    it('shows correct file count with existingCount', () => {
      renderDropZone({ existingCount: 3, files: [makeFile('a.png', 'image/png')] })

      // 3 existing + 1 local = 4/10
      expect(screen.getByText(/4\/10 files/)).toBeDefined()
    })
  })

  describe('security trust messaging', () => {
    it('renders the security note inside the drop zone', () => {
      renderDropZone()
      expect(screen.getByText('Encrypted and visible only to your household')).toBeDefined()
    })

    it('renders the security note even when files are present', () => {
      renderDropZone({ files: [makeFile('a.png', 'image/png')] })
      expect(screen.getByText('Encrypted and visible only to your household')).toBeDefined()
    })

    // NOTE: the "security note when disabled" case used to apply to the
    // grey dropzone that appeared at cap. Post-fix, the at-cap state renders
    // the standing QuotaError (no security note) — intentional: the security
    // pitch matters when the user CAN upload, not when they're blocked.
  })
})
