import i18next from 'i18next'

export const CATEGORY_VALUES = [
  'down_payment', 'taxes', 'notary_legal', 'real_estate_agent', 'financial_advisor',
  'valuation', 'home_inspection', 'title_registry', 'mortgage_fees', 'insurance',
  'renovations', 'furniture', 'moving', 'other',
] as const

/** Returns translated category objects -- call inside render so translations are reactive */
export function getExpenseCategories() {
  return CATEGORY_VALUES.map((value) => ({
    value,
    label: i18next.t(`categories.${value}.label`),
    hint: i18next.t(`categories.${value}.hint`),
  }))
}

/** Shorthand for getting a translated category label */
export function getCategoryLabel(value: string): string {
  return i18next.t(`categories.${value}.label`, { defaultValue: value })
}

/** Shorthand for getting a translated category hint */
export function getCategoryHint(value: string): string {
  return i18next.t(`categories.${value}.hint`, { defaultValue: '' })
}

// Keep EXPENSE_CATEGORIES as a static reference for backwards compatibility (values only)
export const EXPENSE_CATEGORIES = CATEGORY_VALUES.map((value) => ({
  value,
  get label() { return i18next.t(`categories.${value}.label`) },
  get hint() { return i18next.t(`categories.${value}.hint`) },
}))

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
export const MAX_HOUSEHOLD_STORAGE = 50 * 1024 * 1024 // 50 MB total per household

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
/** Translated "Shared" label -- call during render */
export function getSharedPayerLabel(): string { return i18next.t('common.shared') }
/** Translated "Former member" label -- call during render */
export function getFormerMemberLabel(): string { return i18next.t('common.formerMember') }

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
