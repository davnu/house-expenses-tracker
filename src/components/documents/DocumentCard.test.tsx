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

  describe('thumbnail rendering', () => {
    it('renders thumbnail image when thumbnailUrl is present', () => {
      const docWithThumb = { ...baseDoc, type: 'image/jpeg', thumbnailUrl: 'https://example.com/thumb.jpg' }
      const { container } = render(<DocumentCard {...defaultProps} document={docWithThumb} />)

      const img = container.querySelector('img')
      expect(img).toBeDefined()
      expect(img?.getAttribute('src')).toBe('https://example.com/thumb.jpg')
    })

    it('renders file-type icon when thumbnailUrl is absent on an image document', () => {
      const imageDocNoThumb = { ...baseDoc, type: 'image/jpeg', name: 'photo.jpg' }
      const { container } = render(<DocumentCard {...defaultProps} document={imageDocNoThumb} />)

      // Should NOT render an <img> element (no full-URL download)
      const img = container.querySelector('img')
      expect(img).toBeNull()
    })

    it('renders file-type icon for non-image documents regardless of thumbnailUrl', () => {
      // PDF without thumbnailUrl — should show icon, not image
      const { container } = render(<DocumentCard {...defaultProps} />)

      const img = container.querySelector('img')
      expect(img).toBeNull()
    })

    it('always applies background color on icon container (loading placeholder)', () => {
      const docWithThumb = { ...baseDoc, type: 'image/jpeg', thumbnailUrl: 'https://example.com/thumb.jpg' }
      const { container } = render(<DocumentCard {...defaultProps} document={docWithThumb} />)

      // The icon container should have a bg color even when thumbnail is present (acts as loading backdrop)
      const iconContainer = container.querySelector('.h-11.w-11')
      const classes = iconContainer?.getAttribute('class') ?? ''
      expect(classes).toContain('bg-')
    })

    it('hides extension badge when thumbnailUrl is present', () => {
      const docWithThumb = { ...baseDoc, type: 'image/jpeg', name: 'photo.jpg', thumbnailUrl: 'https://example.com/thumb.jpg' }
      render(<DocumentCard {...defaultProps} document={docWithThumb} />)

      // "JPG" badge should NOT be rendered when thumbnail is visible
      expect(screen.queryByText('JPG')).toBeNull()
    })

    it('shows extension badge when thumbnailUrl is absent', () => {
      render(<DocumentCard {...defaultProps} />)

      // "PDF" badge should be shown for PDF without thumbnail
      expect(screen.getByText('PDF')).toBeDefined()
    })
  })

  describe('smart date formatting', () => {
    it('shows relative date for recent uploads', () => {
      const recentDoc = { ...baseDoc, uploadedAt: new Date().toISOString() }
      render(<DocumentCard {...defaultProps} document={recentDoc} />)

      // Should show "less than a minute ago" or similar
      expect(screen.getByText(/ago/)).toBeDefined()
    })

    it('shows exact date for older uploads', () => {
      // baseDoc.uploadedAt is '2026-04-01T00:00:00Z' — more than 7 days ago from "today" (2026-04-13)
      render(<DocumentCard {...defaultProps} />)

      // Should show "Apr 1, 2026" format
      expect(screen.getByText(/Apr 1, 2026/)).toBeDefined()
    })
  })

  describe('file metadata display', () => {
    it('shows file size', () => {
      render(<DocumentCard {...defaultProps} />)
      expect(screen.getByText(/100\.0 KB/)).toBeDefined()
    })

    it('shows uploader name', () => {
      render(<DocumentCard {...defaultProps} />)
      expect(screen.getByText(/Alice/)).toBeDefined()
    })

    it('shows filename', () => {
      render(<DocumentCard {...defaultProps} />)
      expect(screen.getByText('contract.pdf')).toBeDefined()
    })
  })
})
