import type { HouseDocument } from '@/types/document'

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
