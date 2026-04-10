export type ExpenseCategory =
  | 'down_payment'
  | 'taxes'
  | 'notary_legal'
  | 'real_estate_agent'
  | 'financial_advisor'
  | 'valuation'
  | 'home_inspection'
  | 'title_registry'
  | 'mortgage_fees'
  | 'insurance'
  | 'renovations'
  | 'furniture'
  | 'moving'
  | 'other'

export interface Attachment {
  id: string
  name: string
  type: string // MIME type
  size: number // bytes
  url?: string // Firebase Storage download URL
}

export interface Expense {
  id: string
  amount: number // cents
  category: ExpenseCategory
  payer: string // uid of household member
  description: string
  date: string // YYYY-MM-DD
  attachments?: Attachment[]
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  currency: string
}

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  houseId: string | null
  createdAt: string
}

export interface House {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  country?: string // ISO 3166-1 alpha-2 (e.g. 'ES', 'GB', 'US')
  currency?: string // ISO 4217 (e.g. 'EUR', 'GBP', 'USD')
  createdAt: string
}

export interface HouseMember {
  uid: string
  displayName: string
  email: string
  color: string
  role: 'owner' | 'member'
  joinedAt: string
}

export interface Invite {
  id: string
  houseId: string
  houseName: string
  createdBy: string
  createdAt: string
  expiresAt: string
  usedBy?: string
  usedAt?: string
}
