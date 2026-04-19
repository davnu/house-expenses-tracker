import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileDropZone } from './FileDropZone'
import { MAX_FILE_SIZE, MAX_FILES_PER_EXPENSE, MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'

// ── jsdom polyfills ──

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(cleanup)

// ── Helpers ──

function makeFile(name: string, type: string, size = 1024): File {
  const buffer = new ArrayBuffer(size)
  return new File([buffer], name, { type })
}

function renderDropZone(overrides: Partial<React.ComponentProps<typeof FileDropZone>> = {}) {
  const onChange = vi.fn()
  const result = render(
    <FileDropZone
      files={overrides.files ?? []}
      onChange={overrides.onChange ?? onChange}
      existingCount={overrides.existingCount}
      householdStorageUsed={overrides.householdStorageUsed}
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
      expect(screen.getByText(/exceeds 10 MB limit/)).toBeDefined()
    })

    it('rejects file at exactly MAX_FILE_SIZE to match server-side strict `<` rule', async () => {
      // storage.rules uses `request.resource.size < 10 * 1024 * 1024`, so a
      // file of exactly 10 MB would pass client but fail server with a 403.
      // The client now matches the server to surface a specific message.
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const exactFile = makeFile('exact.png', 'image/png', MAX_FILE_SIZE)
      await userEvent.upload(input, exactFile)

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByText(/exceeds 10 MB limit/)).toBeDefined()
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

  describe('storage quota', () => {
    it('rejects files when household storage limit would be exceeded', async () => {
      const almostFull = MAX_HOUSEHOLD_STORAGE - 500 // 500 bytes left
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} householdStorageUsed={almostFull} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const bigFile = makeFile('big.png', 'image/png', 1000) // 1000 > 500 remaining
      await userEvent.upload(input, bigFile)

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByText(/storage limit reached/i)).toBeDefined()
    })

    it('disables drop zone when storage is already full', () => {
      renderDropZone({ householdStorageUsed: MAX_HOUSEHOLD_STORAGE })
      expect(screen.getByText('Storage limit reached')).toBeDefined()
    })

    it('accumulates pending file sizes in quota check', async () => {
      // 100 bytes left — try adding two 60-byte files
      const almostFull = MAX_HOUSEHOLD_STORAGE - 100
      const onChange = vi.fn()
      const { container } = render(
        <FileDropZone files={[]} onChange={onChange} householdStorageUsed={almostFull} />
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

    it('renders the security note when drop zone is disabled', () => {
      renderDropZone({ householdStorageUsed: MAX_HOUSEHOLD_STORAGE })
      expect(screen.getByText('Encrypted and visible only to your household')).toBeDefined()
    })
  })
})
