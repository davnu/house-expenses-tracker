import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentDropZone } from './DocumentDropZone'
import { MAX_FILE_SIZE, MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'
import { makeFile } from '@/test-utils/files'

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

function renderDropZone(overrides: Partial<React.ComponentProps<typeof DocumentDropZone>> = {}) {
  const onFilesSelected = vi.fn()
  const result = render(
    <DocumentDropZone
      onFilesSelected={overrides.onFilesSelected ?? onFilesSelected}
      totalStorageUsed={overrides.totalStorageUsed ?? 0}
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
        <DocumentDropZone onFilesSelected={onFilesSelected} totalStorageUsed={0} />
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
        <DocumentDropZone onFilesSelected={onFilesSelected} totalStorageUsed={0} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, makeFile('photo.png', 'image/png'))

      expect(onFilesSelected).toHaveBeenCalledOnce()
    })

    it('rejects files exceeding MAX_FILE_SIZE', async () => {
      const onFilesSelected = vi.fn()
      const { container } = render(
        <DocumentDropZone onFilesSelected={onFilesSelected} totalStorageUsed={0} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, makeFile('huge.png', 'image/png', MAX_FILE_SIZE + 1))

      expect(onFilesSelected).not.toHaveBeenCalled()
      expect(screen.getByText(/exceeds 10 MB limit/)).toBeDefined()
    })
  })

  describe('storage quota', () => {
    it('rejects files when household storage limit would be exceeded', async () => {
      const almostFull = MAX_HOUSEHOLD_STORAGE - 500
      const onFilesSelected = vi.fn()
      const { container } = render(
        <DocumentDropZone onFilesSelected={onFilesSelected} totalStorageUsed={almostFull} />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, makeFile('big.png', 'image/png', 1000))

      expect(onFilesSelected).not.toHaveBeenCalled()
      expect(screen.getByText(/storage limit reached/i)).toBeDefined()
    })

    it('disables drop zone when storage is full', () => {
      renderDropZone({ totalStorageUsed: MAX_HOUSEHOLD_STORAGE })
      expect(screen.getByText('Storage limit reached')).toBeDefined()
    })
  })

  describe('security trust messaging', () => {
    it('renders the security note inside the drop zone', () => {
      renderDropZone()
      expect(screen.getByText('Encrypted and visible only to your household')).toBeDefined()
    })

    it('renders the security note when disabled', () => {
      renderDropZone({ totalStorageUsed: MAX_HOUSEHOLD_STORAGE })
      expect(screen.getByText('Encrypted and visible only to your household')).toBeDefined()
    })

    it('renders the security note when explicitly disabled via prop', () => {
      renderDropZone({ disabled: true })
      expect(screen.getByText('Encrypted and visible only to your household')).toBeDefined()
    })
  })
})
