import { describe, it, expect } from 'vitest'
import { searchDocuments, getRecentDocuments } from './document-utils'
import type { HouseDocument } from '@/types/document'
import type { DocFolder } from '@/types/document'
import { DEFAULT_FOLDERS } from '@/types/document'

function makeDoc(overrides: Partial<HouseDocument> = {}): HouseDocument {
  return {
    id: crypto.randomUUID(),
    folderId: 'folder-1',
    name: 'test.pdf',
    type: 'application/pdf',
    size: 1024,
    url: 'https://example.com/test.pdf',
    uploadedBy: 'user-1',
    uploadedAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  }
}

// ── searchDocuments ─────────────────────────────────────────────────

describe('searchDocuments', () => {
  const docs: HouseDocument[] = [
    makeDoc({ name: 'Purchase Agreement.pdf', notes: 'Final signed version', uploadedAt: '2026-01-10T10:00:00.000Z' }),
    makeDoc({ name: 'Home Inspection Report.pdf', folderId: 'folder-2', uploadedAt: '2026-02-05T10:00:00.000Z' }),
    makeDoc({ name: 'insurance-policy.pdf', notes: 'Homeowner insurance from AXA', uploadedAt: '2026-03-01T10:00:00.000Z' }),
    makeDoc({ name: 'floor-plan.png', type: 'image/png', uploadedAt: '2026-01-20T10:00:00.000Z' }),
    makeDoc({ name: 'mortgage-approval.pdf', notes: 'Approved! Great rate', uploadedAt: '2026-04-01T10:00:00.000Z' }),
  ]

  it('returns null for empty query', () => {
    expect(searchDocuments(docs, '')).toBeNull()
    expect(searchDocuments(docs, '  ')).toBeNull()
  })

  it('searches by filename (case-insensitive)', () => {
    const results = searchDocuments(docs, 'insurance')!
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('insurance-policy.pdf')
  })

  it('searches by notes content', () => {
    const results = searchDocuments(docs, 'AXA')!
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('insurance-policy.pdf')
  })

  it('finds documents by note text that is not in the filename', () => {
    const results = searchDocuments(docs, 'signed')!
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Purchase Agreement.pdf')
    expect(results[0].notes).toContain('signed')
  })

  it('finds documents where note matches but name does not', () => {
    const results = searchDocuments(docs, 'Great rate')!
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('mortgage-approval.pdf')
  })

  it('is case-insensitive', () => {
    expect(searchDocuments(docs, 'PURCHASE')).toHaveLength(1)
    expect(searchDocuments(docs, 'purchase')).toHaveLength(1)
    expect(searchDocuments(docs, 'Purchase')).toHaveLength(1)
  })

  it('matches partial strings', () => {
    const results = searchDocuments(docs, 'inspect')!
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Home Inspection Report.pdf')
  })

  it('returns empty array for no matches', () => {
    const results = searchDocuments(docs, 'nonexistent')!
    expect(results).toHaveLength(0)
  })

  it('returns results sorted by uploadedAt descending (newest first)', () => {
    const results = searchDocuments(docs, 'pdf')!
    expect(results.length).toBeGreaterThan(1)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].uploadedAt >= results[i].uploadedAt).toBe(true)
    }
  })

  it('excludes placeholder documents (temp- IDs)', () => {
    const withPlaceholder = [...docs, makeDoc({ id: 'temp-abc-123', name: 'uploading.pdf' })]
    const results = searchDocuments(withPlaceholder, 'uploading')!
    expect(results).toHaveLength(0)
  })

  it('handles docs with no notes gracefully', () => {
    const docsNoNotes = [makeDoc({ name: 'no-notes.pdf', notes: undefined })]
    expect(searchDocuments(docsNoNotes, 'no-notes')).toHaveLength(1)
    expect(searchDocuments(docsNoNotes, 'random-note-text')).toHaveLength(0)
  })

  it('handles docs with empty string notes', () => {
    const docsEmptyNotes = [makeDoc({ name: 'empty-notes.pdf', notes: '' })]
    expect(searchDocuments(docsEmptyNotes, 'empty-notes')).toHaveLength(1)
    expect(searchDocuments(docsEmptyNotes, 'some note')).toHaveLength(0)
  })

  it('searches across multiple folders', () => {
    const results = searchDocuments(docs, '.pdf')!
    const folders = new Set(results.map((d) => d.folderId))
    expect(folders.size).toBeGreaterThanOrEqual(1)
    expect(results.every((d) => d.name.includes('.pdf'))).toBe(true)
  })

  it('handles special regex characters in search safely', () => {
    const docsWithSpecial = [makeDoc({ name: 'file (1).pdf' })]
    expect(searchDocuments(docsWithSpecial, '(1)')).toHaveLength(1)
    expect(searchDocuments(docsWithSpecial, 'file (')).toHaveLength(1)
  })

  it('returns a new array reference, not the original', () => {
    const results = searchDocuments(docs, 'pdf')!
    expect(results).not.toBe(docs)
  })

  it('handles empty document array', () => {
    expect(searchDocuments([], 'test')).toHaveLength(0)
  })

  it('matches query that appears in both name and notes (no duplicates)', () => {
    const docsOverlap = [makeDoc({ name: 'insurance.pdf', notes: 'insurance policy from AXA' })]
    const results = searchDocuments(docsOverlap, 'insurance')!
    expect(results).toHaveLength(1) // not 2
  })
})

// ── getRecentDocuments ──────────────────────────────────────────────

describe('getRecentDocuments', () => {
  it('returns the N most recent documents', () => {
    const docs = [
      makeDoc({ name: 'oldest.pdf', uploadedAt: '2026-01-01T00:00:00.000Z' }),
      makeDoc({ name: 'newest.pdf', uploadedAt: '2026-04-01T00:00:00.000Z' }),
      makeDoc({ name: 'middle.pdf', uploadedAt: '2026-02-15T00:00:00.000Z' }),
    ]
    const recent = getRecentDocuments(docs, 2)
    expect(recent).toHaveLength(2)
    expect(recent[0].name).toBe('newest.pdf')
    expect(recent[1].name).toBe('middle.pdf')
  })

  it('defaults to 5 documents', () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      makeDoc({ name: `doc-${i}.pdf`, uploadedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` })
    )
    const recent = getRecentDocuments(docs)
    expect(recent).toHaveLength(5)
  })

  it('returns all docs if fewer than count', () => {
    const docs = [
      makeDoc({ name: 'only-one.pdf' }),
    ]
    const recent = getRecentDocuments(docs, 5)
    expect(recent).toHaveLength(1)
    expect(recent[0].name).toBe('only-one.pdf')
  })

  it('returns empty array for no documents', () => {
    expect(getRecentDocuments([])).toHaveLength(0)
  })

  it('excludes placeholder documents (temp- IDs)', () => {
    const docs = [
      makeDoc({ id: 'temp-123', name: 'uploading.pdf', uploadedAt: '2026-04-01T00:00:00.000Z' }),
      makeDoc({ name: 'real.pdf', uploadedAt: '2026-03-01T00:00:00.000Z' }),
    ]
    const recent = getRecentDocuments(docs, 5)
    expect(recent).toHaveLength(1)
    expect(recent[0].name).toBe('real.pdf')
  })

  it('sorts by uploadedAt descending (newest first)', () => {
    const docs = [
      makeDoc({ name: 'jan.pdf', uploadedAt: '2026-01-01T00:00:00.000Z' }),
      makeDoc({ name: 'mar.pdf', uploadedAt: '2026-03-01T00:00:00.000Z' }),
      makeDoc({ name: 'feb.pdf', uploadedAt: '2026-02-01T00:00:00.000Z' }),
    ]
    const recent = getRecentDocuments(docs, 3)
    expect(recent.map((d) => d.name)).toEqual(['mar.pdf', 'feb.pdf', 'jan.pdf'])
  })

  it('includes documents from all folders', () => {
    const docs = [
      makeDoc({ folderId: 'folder-a', name: 'a.pdf', uploadedAt: '2026-01-01T00:00:00.000Z' }),
      makeDoc({ folderId: 'folder-b', name: 'b.pdf', uploadedAt: '2026-02-01T00:00:00.000Z' }),
      makeDoc({ folderId: 'folder-c', name: 'c.pdf', uploadedAt: '2026-03-01T00:00:00.000Z' }),
    ]
    const recent = getRecentDocuments(docs, 3)
    const folders = new Set(recent.map((d) => d.folderId))
    expect(folders.size).toBe(3)
  })

  it('does not mutate the input array', () => {
    const docs = [
      makeDoc({ name: 'b.pdf', uploadedAt: '2026-02-01T00:00:00.000Z' }),
      makeDoc({ name: 'a.pdf', uploadedAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const originalOrder = docs.map((d) => d.name)
    getRecentDocuments(docs, 2)
    expect(docs.map((d) => d.name)).toEqual(originalOrder)
  })
})

// ── DEFAULT_FOLDERS (descriptions) ──────────────────────────────────

describe('DEFAULT_FOLDERS', () => {
  it('has 6 default folders', () => {
    expect(DEFAULT_FOLDERS).toHaveLength(6)
  })

  it('every default folder has a description', () => {
    for (const folder of DEFAULT_FOLDERS) {
      expect(folder.description).toBeDefined()
      expect(typeof folder.description).toBe('string')
      expect(folder.description!.length).toBeGreaterThan(0)
    }
  })

  it('every default folder has a unique name', () => {
    const names = DEFAULT_FOLDERS.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every default folder has a unique order', () => {
    const orders = DEFAULT_FOLDERS.map((f) => f.order)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('orders are sequential starting from 0', () => {
    const orders = DEFAULT_FOLDERS.map((f) => f.order).sort((a, b) => a - b)
    expect(orders).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('every default folder has an emoji icon', () => {
    for (const folder of DEFAULT_FOLDERS) {
      expect(folder.icon).toBeDefined()
      expect(folder.icon.length).toBeGreaterThan(0)
    }
  })

  it('"Other" folder is last (highest order)', () => {
    const sorted = [...DEFAULT_FOLDERS].sort((a, b) => a.order - b.order)
    expect(sorted[sorted.length - 1].name).toBe('Other')
  })
})

// ── DocFolder type (description field) ──────────────────────────────

describe('DocFolder description field', () => {
  it('description is optional — folder without it is valid', () => {
    const folder: DocFolder = {
      id: 'test-1',
      name: 'Test Folder',
      icon: '📁',
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'user-1',
    }
    expect(folder.description).toBeUndefined()
  })

  it('description can be set', () => {
    const folder: DocFolder = {
      id: 'test-2',
      name: 'Test Folder',
      icon: '📁',
      description: 'A test folder for testing',
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'user-1',
    }
    expect(folder.description).toBe('A test folder for testing')
  })
})
