export const EXPENSE_CATEGORIES = [
  { value: 'down_payment', label: 'Down Payment' },
  { value: 'notary', label: 'Notary & Legal Fees' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'financial_advisor', label: 'Financial Advisor / Broker' },
  { value: 'renovations', label: 'Renovations' },
  { value: 'furniture', label: 'Furniture & Appliances' },
  { value: 'moving', label: 'Moving Costs' },
  { value: 'home_inspection', label: 'Home Inspection' },
  { value: 'insurance_setup', label: 'Insurance Setup' },
  { value: 'fees_commissions', label: 'Fees & Commissions' },
  { value: 'other', label: 'Other' },
] as const

export const CATEGORY_COLORS: Record<string, string> = {
  down_payment: '#dc2626',
  notary: '#2a9d90',
  taxes: '#274754',
  financial_advisor: '#e8c468',
  renovations: '#8b5cf6',
  furniture: '#06b6d4',
  moving: '#ec4899',
  home_inspection: '#0ea5e9',
  insurance_setup: '#f4a462',
  fees_commissions: '#84cc16',
  other: '#6b7280',
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
