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

vi.mock('@/context/DocumentContext', () => ({
  useDocuments: () => ({
    deleteDocument: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    getMemberName: () => 'Alice',
  }),
}))

import { DocumentCard } from './DocumentCard'
import type { HouseDocument } from '@/types/document'

afterEach(cleanup)

const baseDoc: HouseDocument = {
  id: 'doc1',
  name: 'contract.pdf',
  type: 'application/pdf',
  size: 102400,
  folderId: 'contracts',
  url: 'https://example.com/contract.pdf',
  uploadedBy: 'alice',
  uploadedAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
}

const defaultProps = {
  document: baseDoc,
  isPending: false,
  onRename: vi.fn(),
  onMove: vi.fn(),
  onPreview: vi.fn(),
  onNotesChange: vi.fn(),
}

describe('DocumentCard', () => {
  describe('mobile accessibility — actions always reachable', () => {
    it('action buttons use sm:opacity-0 pattern, not bare invisible', () => {
      const { container } = render(<DocumentCard {...defaultProps} />)

      // The actions wrapper should NOT have bare 'invisible' class
      const allEls = Array.from(container.querySelectorAll<HTMLElement>('[class]'))
      const bareInvisible = allEls.filter((el) => {
        const cls = el.getAttribute('class') ?? ''
        return /\binvisible\b/.test(cls) && !cls.includes('sm:invisible')
      })
      expect(bareInvisible).toHaveLength(0)
    })

    it('action buttons have responsive opacity classes for hover-on-desktop pattern', () => {
      const { container } = render(<DocumentCard {...defaultProps} />)

      const actionsWrapper = Array.from(container.querySelectorAll<HTMLElement>('[class]')).find((el) => {
        const cls = el.getAttribute('class') ?? ''
        return cls.includes('sm:opacity-0') && cls.includes('sm:group-hover:opacity-100')
      })
      expect(actionsWrapper).toBeDefined()
    })

    it('Download and More buttons are present in the DOM', () => {
      render(<DocumentCard {...defaultProps} />)

      expect(screen.getByTitle('Download')).toBeDefined()
      expect(screen.getByTitle('More')).toBeDefined()
    })
  })

  describe('dropdown menu', () => {
    it('clicking More button opens dropdown with Rename, Move, Delete', async () => {
      render(<DocumentCard {...defaultProps} />)

      await userEvent.click(screen.getByTitle('More'))

      expect(screen.getByText('Rename')).toBeDefined()
      expect(screen.getByText('Move to...')).toBeDefined()
      expect(screen.getByText('Delete')).toBeDefined()
    })

    it('clicking More button shows Add note option', async () => {
      render(<DocumentCard {...defaultProps} />)

      await userEvent.click(screen.getByTitle('More'))

      expect(screen.getByText('Add note')).toBeDefined()
    })

    it('shows Edit note when document has existing notes', async () => {
      const docWithNotes = { ...baseDoc, notes: 'Some note' }
      render(<DocumentCard {...defaultProps} document={docWithNotes} />)

      await userEvent.click(screen.getByTitle('More'))

      expect(screen.getByText('Edit note')).toBeDefined()
    })

    it('delete requires confirmation (two clicks)', async () => {
      render(<DocumentCard {...defaultProps} />)

      await userEvent.click(screen.getByTitle('More'))
      const deleteBtn = screen.getByText('Delete')
      await userEvent.click(deleteBtn)

      // First click shows confirmation
      expect(screen.getByText('Confirm delete')).toBeDefined()
    })

    it('hides menu actions in readOnly mode', () => {
      render(<DocumentCard {...defaultProps} readOnly />)

      // More button should not be rendered in readOnly mode
      expect(screen.queryByTitle('More')).toBeNull()
    })
  })

  describe('pending state', () => {
    it('hides action buttons when isPending is true', () => {
      render(<DocumentCard {...defaultProps} isPending />)

      expect(screen.queryByTitle('Download')).toBeNull()
      expect(screen.queryByTitle('More')).toBeNull()
    })
  })
})
