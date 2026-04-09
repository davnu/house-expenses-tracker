export const EXPENSE_CATEGORIES = [
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'notary', label: 'Notary' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'financial_advisor', label: 'Financial Advisor' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'renovations', label: 'Renovations' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'moving', label: 'Moving' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
] as const

export const CATEGORY_COLORS: Record<string, string> = {
  mortgage: '#e76e50',
  notary: '#2a9d90',
  taxes: '#274754',
  financial_advisor: '#e8c468',
  insurance: '#f4a462',
  renovations: '#8b5cf6',
  furniture: '#06b6d4',
  moving: '#ec4899',
  utilities: '#84cc16',
  maintenance: '#f97316',
  other: '#6b7280',
}

export const CATEGORY_COST_PHASE: Record<string, 'one-time' | 'ongoing'> = {
  mortgage: 'ongoing',
  notary: 'one-time',
  taxes: 'one-time',
  financial_advisor: 'one-time',
  insurance: 'ongoing',
  renovations: 'one-time',
  furniture: 'one-time',
  moving: 'one-time',
  utilities: 'ongoing',
  maintenance: 'ongoing',
  other: 'one-time',
}

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
