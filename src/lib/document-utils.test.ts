import { describe, it, expect } from 'vitest'
import {
  searchDocuments,
  getRecentDocuments,
  searchUnified,
  attachmentToHouseDocument,
} from './document-utils'
import type { HouseDocument, DocFolder } from '@/types/document'
import { DEFAULT_FOLDERS } from '@/types/document'
import type { Attachment, Expense } from '@/types/expense'

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

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: crypto.randomUUID(),
    amount: 150000, // €1,500
    category: 'notary_legal',
    payer: 'user-1',
    description: 'Notary fees',
    date: '2026-02-15',
    createdAt: '2026-02-15T10:00:00.000Z',
    updatedAt: '2026-02-15T10:00:00.000Z',
    ...overrides,
  }
}

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: crypto.randomUUID(),
    name: 'receipt.pdf',
    type: 'application/pdf',
    size: 512,
    url: 'https://example.com/receipt.pdf',
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

  it('searches by filename', () => {
    expect(searchDocuments(docs, 'insurance')).toHaveLength(1)
  })

  it('searches by notes content', () => {
    expect(searchDocuments(docs, 'AXA')).toHaveLength(1)
  })

  it('is case-insensitive', () => {
    expect(searchDocuments(docs, 'PURCHASE')).toHaveLength(1)
    expect(searchDocuments(docs, 'purchase')).toHaveLength(1)
  })

  it('excludes temp- IDs', () => {
    const withTemp = [...docs, makeDoc({ id: 'temp-123', name: 'uploading.pdf' })]
    expect(searchDocuments(withTemp, 'uploading')).toHaveLength(0)
  })

  it('returns results sorted newest first', () => {
    const results = searchDocuments(docs, 'pdf')!
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].uploadedAt >= results[i].uploadedAt).toBe(true)
    }
  })

  it('handles empty array', () => {
    expect(searchDocuments([], 'test')).toHaveLength(0)
  })

  it('handles special regex characters', () => {
    const special = [makeDoc({ name: 'file (1).pdf' })]
    expect(searchDocuments(special, '(1)')).toHaveLength(1)
  })

  it('handles docs with undefined notes', () => {
    const noNotes = [makeDoc({ notes: undefined })]
    expect(searchDocuments(noNotes, 'test')).toHaveLength(1) // matches name
    expect(searchDocuments(noNotes, 'nonexistent')).toHaveLength(0)
  })
})

// ── getRecentDocuments ──────────────────────────────────────────────

describe('getRecentDocuments', () => {
  it('returns N most recent, sorted newest first', () => {
    const docs = [
      makeDoc({ name: 'old.pdf', uploadedAt: '2026-01-01T00:00:00.000Z' }),
      makeDoc({ name: 'new.pdf', uploadedAt: '2026-04-01T00:00:00.000Z' }),
      makeDoc({ name: 'mid.pdf', uploadedAt: '2026-02-15T00:00:00.000Z' }),
    ]
    const recent = getRecentDocuments(docs, 2)
    expect(recent).toHaveLength(2)
    expect(recent[0].name).toBe('new.pdf')
    expect(recent[1].name).toBe('mid.pdf')
  })

  it('defaults to 5', () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      makeDoc({ uploadedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` })
    )
    expect(getRecentDocuments(docs)).toHaveLength(5)
  })

  it('excludes temp- IDs', () => {
    const docs = [makeDoc({ id: 'temp-x', name: 'pending.pdf' }), makeDoc({ name: 'real.pdf' })]
    expect(getRecentDocuments(docs)).toHaveLength(1)
  })

  it('does not mutate input', () => {
    const docs = [makeDoc({ name: 'b.pdf', uploadedAt: '2026-02-01' }), makeDoc({ name: 'a.pdf', uploadedAt: '2026-01-01' })]
    const original = docs.map((d) => d.name)
    getRecentDocuments(docs)
    expect(docs.map((d) => d.name)).toEqual(original)
  })
})

// ── searchUnified ───────────────────────────────────────────────────

describe('searchUnified', () => {
  const docs = [
    makeDoc({ name: 'notary-contract.pdf', notes: 'Signed at closing', uploadedAt: '2026-03-01T10:00:00.000Z' }),
    makeDoc({ name: 'insurance-policy.pdf', uploadedAt: '2026-02-01T10:00:00.000Z' }),
  ]

  const att1 = makeAttachment({ name: 'notary-receipt.pdf' })
  const att2 = makeAttachment({ name: 'insurance-invoice.jpg', type: 'image/jpeg' })
  const expenses = [
    makeExpense({ category: 'notary_legal', description: 'Notary appointment', date: '2026-03-10', attachments: [att1] }),
    makeExpense({ category: 'insurance', description: 'Home insurance premium', date: '2026-01-20', attachments: [att2] }),
    makeExpense({ category: 'taxes', description: 'Property tax', date: '2026-04-01' }), // no attachments
  ]

  it('returns null for empty query', () => {
    expect(searchUnified(docs, expenses, '')).toBeNull()
    expect(searchUnified(docs, expenses, '   ')).toBeNull()
  })

  it('finds standalone documents by name', () => {
    const results = searchUnified(docs, expenses, 'insurance-policy')!
    const docResults = results.filter((r) => r.source === 'document')
    expect(docResults).toHaveLength(1)
  })

  it('finds expense attachments by filename', () => {
    const results = searchUnified(docs, expenses, 'notary-receipt')!
    const expResults = results.filter((r) => r.source === 'expense')
    expect(expResults).toHaveLength(1)
  })

  it('finds expense attachments by expense description', () => {
    const results = searchUnified(docs, expenses, 'appointment')!
    expect(results).toHaveLength(1)
    expect(results[0].source).toBe('expense')
  })

  it('finds expense attachments by category label', () => {
    // "notary" matches "Notary & Legal" category label
    const results = searchUnified(docs, expenses, 'notary')!
    // Should find: notary-contract.pdf (doc), notary-receipt.pdf (attachment via name), and attachment via category
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  it('returns mixed results sorted by date descending', () => {
    const results = searchUnified(docs, expenses, 'notary')!
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].sortDate >= results[i].sortDate).toBe(true)
    }
  })

  it('excludes temp- document IDs', () => {
    const docsWithTemp = [...docs, makeDoc({ id: 'temp-abc', name: 'notary-temp.pdf' })]
    const results = searchUnified(docsWithTemp, expenses, 'notary')!
    const hasTemp = results.some((r) => r.source === 'document' && r.document.id === 'temp-abc')
    expect(hasTemp).toBe(false)
  })

  it('excludes attachments without URL (pending uploads)', () => {
    const pendingAtt = makeAttachment({ name: 'notary-pending.pdf', url: undefined })
    const expWithPending = [makeExpense({ category: 'notary_legal', attachments: [pendingAtt] })]
    const results = searchUnified([], expWithPending, 'notary')!
    expect(results).toHaveLength(0)
  })

  it('handles expenses with no attachments', () => {
    const results = searchUnified([], expenses, 'property tax')!
    // "Property tax" matches description but expense has no attachments
    expect(results).toHaveLength(0)
  })

  it('handles empty inputs', () => {
    expect(searchUnified([], [], 'test')).toHaveLength(0)
  })

  it('finds by notes on standalone document', () => {
    const results = searchUnified(docs, expenses, 'closing')!
    expect(results).toHaveLength(1)
    expect(results[0].source).toBe('document')
  })

  it('does not duplicate when attachment name and category both match', () => {
    const att = makeAttachment({ name: 'insurance-receipt.pdf' })
    const exp = [makeExpense({ category: 'insurance', attachments: [att] })]
    const results = searchUnified([], exp, 'insurance')!
    // One attachment, even though both name and category match
    expect(results).toHaveLength(1)
  })
})

// ── attachmentToHouseDocument ───────────────────────────────────────

describe('attachmentToHouseDocument', () => {
  it('maps all fields correctly', () => {
    const att = makeAttachment({ id: 'att-1', name: 'receipt.pdf', type: 'application/pdf', size: 2048, url: 'https://example.com/file' })
    const expense = makeExpense({ payer: 'alice', date: '2026-05-01', updatedAt: '2026-05-01T12:00:00.000Z' })
    const doc = attachmentToHouseDocument(att, expense)

    expect(doc.id).toBe('att-1')
    expect(doc.folderId).toBe('__expense__')
    expect(doc.name).toBe('receipt.pdf')
    expect(doc.type).toBe('application/pdf')
    expect(doc.size).toBe(2048)
    expect(doc.url).toBe('https://example.com/file')
    expect(doc.uploadedBy).toBe('alice')
    expect(doc.uploadedAt).toBe('2026-05-01')
    expect(doc.updatedAt).toBe('2026-05-01T12:00:00.000Z')
  })

  it('passes through thumbnailUrl when present', () => {
    const att = makeAttachment({ thumbnailUrl: 'https://example.com/thumb.jpg' })
    const doc = attachmentToHouseDocument(att, makeExpense())
    expect(doc.thumbnailUrl).toBe('https://example.com/thumb.jpg')
  })

  it('passes through undefined thumbnailUrl when absent', () => {
    const att = makeAttachment()
    const doc = attachmentToHouseDocument(att, makeExpense())
    expect(doc.thumbnailUrl).toBeUndefined()
  })

  it('uses __expense__ sentinel folderId', () => {
    const doc = attachmentToHouseDocument(makeAttachment(), makeExpense())
    expect(doc.folderId).toBe('__expense__')
  })

  it('handles missing URL (defaults to empty string)', () => {
    const att = makeAttachment({ url: undefined })
    const doc = attachmentToHouseDocument(att, makeExpense())
    expect(doc.url).toBe('')
  })
})

// ── DEFAULT_FOLDERS ─────────────────────────────────────────────────

describe('DEFAULT_FOLDERS', () => {
  it('has 7 default folders with descriptions', () => {
    expect(DEFAULT_FOLDERS).toHaveLength(7)
    for (const f of DEFAULT_FOLDERS) {
      expect(f.description).toBeDefined()
      expect(f.description!.length).toBeGreaterThan(0)
    }
  })

  it('has unique names and sequential orders', () => {
    const names = DEFAULT_FOLDERS.map((f) => f.name)
    expect(new Set(names).size).toBe(7)
    const orders = DEFAULT_FOLDERS.map((f) => f.order).sort((a, b) => a - b)
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('"Other" is last', () => {
    const sorted = [...DEFAULT_FOLDERS].sort((a, b) => a.order - b.order)
    expect(sorted[6].icon).toBe('📁')
  })

  it('every default folder has a translationKey', () => {
    for (const f of DEFAULT_FOLDERS) {
      expect(f.translationKey).toBeDefined()
      expect(typeof f.translationKey).toBe('string')
      expect(f.translationKey!.length).toBeGreaterThan(0)
    }
  })

  it('translationKeys are unique across all folders', () => {
    const keys = DEFAULT_FOLDERS.map((f) => f.translationKey)
    expect(new Set(keys).size).toBe(7)
  })

  it('translationKeys match expected set', () => {
    const keys = DEFAULT_FOLDERS.map((f) => f.translationKey).sort()
    expect(keys).toEqual(['inspections', 'insurance', 'mortgage', 'other', 'property', 'purchase', 'tax'])
  })
})

// ── DocFolder description field ─────────────────────────────────────

describe('DocFolder description field', () => {
  it('is optional', () => {
    const folder: DocFolder = { id: 'x', name: 'Test', icon: '📁', order: 0, createdAt: '', createdBy: '' }
    expect(folder.description).toBeUndefined()
  })

  it('can be set', () => {
    const folder: DocFolder = { id: 'x', name: 'Test', icon: '📁', description: 'A description', order: 0, createdAt: '', createdBy: '' }
    expect(folder.description).toBe('A description')
  })
})
