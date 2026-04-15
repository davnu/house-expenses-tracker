import i18next from 'i18next'

export interface DocFolder {
  id: string
  name: string
  icon: string // emoji
  description?: string
  translationKey?: string | null // key into defaultFolders.* for dynamic i18n
  order: number
  createdAt: string
  createdBy: string
}

export interface HouseDocument {
  id: string
  folderId: string
  name: string
  type: string // MIME type
  size: number // bytes
  url: string // Firebase Storage download URL
  thumbnailUrl?: string // Small JPEG thumbnail URL (generated client-side at upload)
  notes?: string
  uploadedBy: string // uid
  uploadedAt: string
  updatedAt: string
}

const FOLDER_DEFS = [
  { key: 'purchase', icon: '📋', order: 0 },
  { key: 'mortgage', icon: '🏦', order: 1 },
  { key: 'property', icon: '🏠', order: 2 },
  { key: 'tax',      icon: '📊', order: 3 },
  { key: 'insurance', icon: '🛡️', order: 4 },
  { key: 'inspections', icon: '🔍', order: 5 },
  { key: 'other',    icon: '📁', order: 6 },
] as const

/** Returns translated default folders — call at runtime when i18next is ready */
export function getDefaultFolders(): Omit<DocFolder, 'id' | 'createdAt' | 'createdBy'>[] {
  return FOLDER_DEFS.map(({ key, icon, order }) => ({
    name: i18next.t(`defaultFolders.${key}.name`),
    icon,
    order,
    description: i18next.t(`defaultFolders.${key}.description`),
    translationKey: key,
  }))
}

/** @deprecated Use getDefaultFolders() for translated names */
export const DEFAULT_FOLDERS = getDefaultFolders()
