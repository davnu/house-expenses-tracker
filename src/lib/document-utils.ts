import type { HouseDocument } from '@/types/document'
import type { Attachment, Expense } from '@/types/expense'
import { EXPENSE_CATEGORIES } from '@/lib/constants'

const categoryLabel = (val: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val

// ── Standalone document utilities ───────────────────────────────────

/**
 * Search documents across all folders by name and notes.
 * Returns null for empty queries (signals "not searching").
 * Excludes upload placeholders (temp- IDs).
 */
export function searchDocuments(documents: HouseDocument[], query: string): HouseDocument[] | null {
  if (!query.trim()) return null
  const q = query.toLowerCase()
  return documents
    .filter((d) => !d.id.startsWith('temp-'))
    .filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.notes?.toLowerCase().includes(q) ?? false)
    )
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}

/**
 * Get the N most recently uploaded documents across all folders.
 * Excludes upload placeholders (temp- IDs).
 */
export function getRecentDocuments(documents: HouseDocument[], count = 5): HouseDocument[] {
  return documents
    .filter((d) => !d.id.startsWith('temp-'))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, count)
}

// ── Unified search (documents + expense attachments) ────────────────

export type UnifiedSearchItem =
  | { source: 'document'; document: HouseDocument; sortDate: string }
  | { source: 'expense'; attachment: Attachment; expense: Expense; sortDate: string }

/**
 * Search both standalone documents AND expense attachments.
 * Returns null for empty queries. Results sorted by date descending.
 *
 * Documents: matches name + notes (same as searchDocuments)
 * Expense attachments: matches attachment name + expense description + category label
 */
export function searchUnified(
  documents: HouseDocument[],
  expenses: Expense[],
  query: string,
): UnifiedSearchItem[] | null {
  if (!query.trim()) return null
  const q = query.toLowerCase()

  const docResults: UnifiedSearchItem[] = documents
    .filter((d) => !d.id.startsWith('temp-'))
    .filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.notes?.toLowerCase().includes(q) ?? false)
    )
    .map((d) => ({ source: 'document' as const, document: d, sortDate: d.uploadedAt }))

  const attachmentResults: UnifiedSearchItem[] = []
  for (const expense of expenses) {
    if (!expense.attachments?.length) continue
    const catLabel = categoryLabel(expense.category).toLowerCase()
    const descLower = expense.description.toLowerCase()

    for (const att of expense.attachments) {
      if (!att.url) continue // skip pending uploads
      const nameMatch = att.name.toLowerCase().includes(q)
      const descMatch = descLower.includes(q)
      const catMatch = catLabel.includes(q)

      if (nameMatch || descMatch || catMatch) {
        attachmentResults.push({
          source: 'expense' as const,
          attachment: att,
          expense,
          sortDate: expense.date, // YYYY-MM-DD
        })
      }
    }
  }

  return [...docResults, ...attachmentResults]
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate))
}

// ── Adapter ─────────────────────────────────────────────────────────

/**
 * Convert an Attachment + Expense pair into a synthetic HouseDocument
 * so it can be rendered by DocumentCard.
 */
export function attachmentToHouseDocument(attachment: Attachment, expense: Expense): HouseDocument {
  return {
    id: attachment.id,
    folderId: '__expense__', // sentinel — never collides with a real folder
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    url: attachment.url ?? '',
    thumbnailUrl: attachment.thumbnailUrl,
    uploadedBy: expense.payer,
    uploadedAt: expense.date,
    updatedAt: expense.updatedAt,
  }
}

