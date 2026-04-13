import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import _userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

// ── jsdom polyfills ───────────────────────────────────

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

// ── Hoisted mock data ─────────────────────────────────

const { mockFolders, mockDocuments } = vi.hoisted(() => ({
  mockFolders: {
    current: [] as Array<{
      id: string; name: string; icon: string; description?: string; order: number; createdAt: string; createdBy: string
    }>,
  },
  mockDocuments: {
    current: [] as Array<{
      id: string; folderId: string; name: string; type: string; size: number; url: string;
      uploadedBy: string; uploadedAt: string; updatedAt: string
    }>,
  },
}))

// ── Mocks ─────────────────────────────────────────────

vi.mock('@/context/DocumentContext', () => ({
  useDocuments: () => ({
    folders: mockFolders.current,
    documents: mockDocuments.current,
    loading: false,
    totalStorageUsed: 0,
    pendingDocumentIds: new Set(),
    moveDocument: vi.fn(),
    uploadDocuments: vi.fn(),
    updateDocumentNotes: vi.fn(),
    deleteDocument: vi.fn(),
  }),
}))

vi.mock('@/context/ExpenseContext', () => ({
  useExpenses: () => ({
    expenses: [],
    loading: false,
  }),
}))

vi.mock('@/context/HouseholdContext', () => ({
  useHousehold: () => ({
    getMemberName: () => 'Alice',
    getMemberColor: () => '#3b82f6',
  }),
}))

import { DocumentsPage } from './DocumentsPage'
import { getFolderIconBg } from '@/lib/file-type-info'

afterEach(cleanup)

function renderPage() {
  const { container } = render(
    <MemoryRouter>
      <DocumentsPage />
    </MemoryRouter>
  )
  return container
}

const testFolders = [
  { id: 'f1', name: 'Purchase & Legal', icon: '📋', description: 'Contracts and deeds', order: 0, createdAt: '', createdBy: 'alice' },
  { id: 'f2', name: 'Mortgage', icon: '🏦', description: 'Loan documents', order: 1, createdAt: '', createdBy: 'alice' },
  { id: 'f3', name: 'Other', icon: '📁', order: 2, createdAt: '', createdBy: 'alice' },
]

// ── Tests ─────────────────────────────────────────────

describe('DocumentsPage', () => {
  beforeEach(() => {
    mockFolders.current = []
    mockDocuments.current = []
  })

  describe('empty state', () => {
    it('shows invitation to create folders when none exist', () => {
      renderPage()
      expect(screen.getByText('Organize your house documents')).toBeDefined()
      expect(screen.getByText('Create First Folder')).toBeDefined()
    })

    it('does not render folder grid when empty', () => {
      const container = renderPage()
      // No folder cards rendered — only the "Create First Folder" button (which is a <button>, not role="button")
      expect(container.querySelectorAll('[role="button"]')).toHaveLength(0)
    })
  })

  describe('folder grid', () => {
    beforeEach(() => {
      mockFolders.current = testFolders
    })

    it('renders a card for each folder plus "New Folder"', () => {
      const container = renderPage()
      const cards = container.querySelectorAll('[role="button"]')
      // 3 folders + 1 "New Folder" card
      expect(cards).toHaveLength(4)
    })

    it('shows folder names', () => {
      renderPage()
      expect(screen.getByText('Purchase & Legal')).toBeDefined()
      expect(screen.getByText('Mortgage')).toBeDefined()
      expect(screen.getByText('Other')).toBeDefined()
    })

    it('shows "New Folder" action card in the grid', () => {
      const container = renderPage()
      // "New Folder" text appears in both the header button and the grid card
      const newFolderTexts = container.querySelectorAll('[role="button"]')
      const lastCard = newFolderTexts[newFolderTexts.length - 1]
      expect(lastCard.textContent).toContain('New Folder')
    })

    it('shows file count per folder', () => {
      mockDocuments.current = [
        { id: 'd1', folderId: 'f1', name: 'deed.pdf', type: 'application/pdf', size: 1000, url: 'https://x.com/a', uploadedBy: 'alice', uploadedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'd2', folderId: 'f1', name: 'contract.pdf', type: 'application/pdf', size: 2000, url: 'https://x.com/b', uploadedBy: 'alice', uploadedAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
      ]
      const container = renderPage()
      expect(screen.getByText('2 files')).toBeDefined()
      // f2 and f3 both empty — use querySelectorAll since there are multiple
      const emptyLabels = Array.from(container.querySelectorAll('*')).filter(
        (el) => el.textContent === 'Empty' && el.childElementCount === 0
      )
      expect(emptyLabels.length).toBeGreaterThanOrEqual(2)
    })

    it('folders are keyboard accessible', async () => {
      const container = renderPage()
      const firstCard = container.querySelectorAll('[role="button"]')[0] as HTMLElement
      expect(firstCard.getAttribute('tabindex')).toBe('0')
    })
  })

  describe('folder card icon containers', () => {
    beforeEach(() => {
      mockFolders.current = testFolders
    })

    it('wraps each folder emoji in a colored container', () => {
      const container = renderPage()
      // Icon containers: h-12 w-12 rounded-2xl with a bg- class
      const iconContainers = container.querySelectorAll('.rounded-2xl')
      // 3 folder icon containers + 1 "New Folder" icon container = 4
      expect(iconContainers.length).toBe(4)
    })

    it('each folder icon container has a color-coded background', () => {
      const container = renderPage()
      const iconContainers = Array.from(container.querySelectorAll('.rounded-2xl'))

      // First folder (📋) should have amber bg
      const firstContainer = iconContainers[0]
      const classes = firstContainer.getAttribute('class') ?? ''
      expect(classes).toContain(getFolderIconBg('📋').split(' ')[0]) // light mode class
    })

    it('"New Folder" icon container matches folder card sizing', () => {
      const container = renderPage()
      const iconContainers = Array.from(container.querySelectorAll('.rounded-2xl'))
      // All should have h-12 w-12
      for (const el of iconContainers) {
        const cls = el.getAttribute('class') ?? ''
        expect(cls).toContain('h-12')
        expect(cls).toContain('w-12')
      }
    })
  })

  describe('hover and focus styles', () => {
    beforeEach(() => {
      mockFolders.current = testFolders
    })

    it('folder cards have hover elevation classes', () => {
      const container = renderPage()
      const cards = Array.from(container.querySelectorAll('[role="button"]'))

      // Folder cards (not "New Folder") should have hover shadow + translate
      const folderCard = cards[0]
      const cls = folderCard.getAttribute('class') ?? ''
      expect(cls).toContain('hover:shadow-md')
      expect(cls).toContain('hover:-translate-y-0.5')
    })

    it('"New Folder" card has matching hover elevation', () => {
      const container = renderPage()
      const cards = Array.from(container.querySelectorAll('[role="button"]'))
      const newFolderCard = cards[cards.length - 1]
      const cls = newFolderCard.getAttribute('class') ?? ''
      expect(cls).toContain('hover:shadow-md')
      expect(cls).toContain('hover:-translate-y-0.5')
    })

    it('folder cards have focus-visible ring for keyboard navigation', () => {
      const container = renderPage()
      const cards = Array.from(container.querySelectorAll('[role="button"]'))

      for (const card of cards) {
        const cls = card.getAttribute('class') ?? ''
        expect(cls).toContain('focus-visible:ring-2')
        expect(cls).toContain('focus-visible:ring-primary')
      }
    })

    it('uses scoped transition (not transition-all)', () => {
      const container = renderPage()
      const cards = Array.from(container.querySelectorAll('[role="button"]'))

      const folderCard = cards[0]
      const cls = folderCard.getAttribute('class') ?? ''
      expect(cls).toContain('transition-[transform,box-shadow]')
      expect(cls).not.toContain('transition-all')
    })
  })

  describe('grid height consistency', () => {
    beforeEach(() => {
      mockFolders.current = testFolders
    })

    it('description row always renders with min-h even when folder has no description', () => {
      const container = renderPage()
      // folder f3 ("Other") has no description
      // The description <p> should still exist with min-h-[1em] for consistent card height
      const descriptionRows = container.querySelectorAll('.min-h-\\[1em\\]')
      // One per folder card (3 total)
      expect(descriptionRows.length).toBe(3)
    })

    it('renders actual description text when present', () => {
      renderPage()
      expect(screen.getByText('Contracts and deeds')).toBeDefined()
      expect(screen.getByText('Loan documents')).toBeDefined()
    })
  })
})
