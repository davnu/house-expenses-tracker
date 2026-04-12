export const EXPENSE_CATEGORIES = [
  { value: 'down_payment', label: 'Down Payment', hint: 'Deposit paid to the seller' },
  { value: 'taxes', label: 'Taxes & Stamp Duty', hint: 'Property transfer tax, stamp duty, VAT' },
  { value: 'notary_legal', label: 'Notary & Legal', hint: 'Notary, solicitor, lawyer, conveyancing' },
  { value: 'real_estate_agent', label: 'Real Estate Agent', hint: 'Agent or broker commission' },
  { value: 'financial_advisor', label: 'Financial Advisor', hint: 'Independent financial advice' },
  { value: 'valuation', label: 'Valuation & Appraisal', hint: 'Bank valuation, property appraisal' },
  { value: 'home_inspection', label: 'Home Inspection & Survey', hint: 'Structural survey, pest inspection' },
  { value: 'title_registry', label: 'Title & Registry', hint: 'Title insurance, title search, land registry' },
  { value: 'mortgage_fees', label: 'Mortgage Fees', hint: 'Arrangement fee, origination fee, bank charges' },
  { value: 'insurance', label: 'Insurance', hint: 'Homeowner\'s insurance, life insurance for mortgage' },
  { value: 'renovations', label: 'Renovations', hint: 'Repairs, improvements, remodeling' },
  { value: 'furniture', label: 'Furniture & Appliances', hint: 'Furnishing and equipping the home' },
  { value: 'moving', label: 'Moving Costs', hint: 'Moving company, transport, storage' },
  { value: 'other', label: 'Other', hint: 'Energy certificate, permits, miscellaneous' },
] as const

export const CATEGORY_COLORS: Record<string, string> = {
  down_payment: '#dc2626',
  taxes: '#274754',
  notary_legal: '#2a9d90',
  real_estate_agent: '#7c3aed',
  financial_advisor: '#e8c468',
  valuation: '#0ea5e9',
  home_inspection: '#0d9488',
  title_registry: '#6366f1',
  mortgage_fees: '#f59e0b',
  insurance: '#f4a462',
  renovations: '#8b5cf6',
  furniture: '#06b6d4',
  moving: '#ec4899',
  other: '#6b7280',
}

// Attachment limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB per file
export const MAX_FILES_PER_EXPENSE = 10
export const MAX_HOUSEHOLD_STORAGE = 500 * 1024 * 1024 // 500 MB total per household

// Document limits (shared with attachment quota)
export const MAX_DOCUMENTS_PER_FOLDER = 50

export const ACCEPTED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

// Shared payer sentinel — used instead of a uid when an expense is paid jointly
export const SHARED_PAYER = 'shared' as const
export const SHARED_PAYER_COLOR = '#6366f1'
export const SHARED_PAYER_LABEL = 'Shared'

export const MEMBER_COLOR_PALETTE = [
  '#2a9d90',
  '#e76e50',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f97316',
  '#84cc16',
  '#e8c468',
]
