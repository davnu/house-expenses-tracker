export interface DocFolder {
  id: string
  name: string
  icon: string // emoji
  description?: string
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
  notes?: string
  uploadedBy: string // uid
  uploadedAt: string
  updatedAt: string
}

/** Pre-created folders when a household first uses the Documents feature */
export const DEFAULT_FOLDERS: Omit<DocFolder, 'id' | 'createdAt' | 'createdBy'>[] = [
  { name: 'Purchase & Legal', icon: '📋', order: 0, description: 'Contracts, title deeds, settlement statements' },
  { name: 'Mortgage', icon: '🏦', order: 1, description: 'Pre-approval, loan documents, rate lock letters' },
  { name: 'Insurance', icon: '🛡️', order: 2, description: 'Homeowner, title, and life insurance policies' },
  { name: 'Inspections', icon: '🔍', order: 3, description: 'Home inspection, appraisal, pest reports' },
  { name: 'Renovations', icon: '🔨', order: 4, description: 'Permits, contractor quotes, floor plans' },
  { name: 'Other', icon: '📁', order: 5, description: 'Warranties, utility setup, miscellaneous' },
]
