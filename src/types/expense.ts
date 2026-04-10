export type ExpenseCategory =
  | 'down_payment'
  | 'notary'
  | 'taxes'
  | 'financial_advisor'
  | 'renovations'
  | 'furniture'
  | 'moving'
  | 'home_inspection'
  | 'insurance_setup'
  | 'fees_commissions'
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
