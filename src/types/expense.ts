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
  thumbnailUrl?: string // Small JPEG thumbnail URL (generated client-side at upload)
}

/** Per-member allocation of a single expense's cost. sum(shareCents) must equal Expense.amount. */
export interface ExpenseSplit {
  uid: string
  shareCents: number
}

export interface Expense {
  id: string
  amount: number // cents
  category: ExpenseCategory
  payer: string // uid of household member, or 'shared' for jointly-paid expenses
  /** Per-member cost allocation. If omitted, the household default ratio applies at read time. */
  splits?: ExpenseSplit[]
  description: string
  date: string // YYYY-MM-DD
  paid?: boolean // defaults to true; false = planned/expected cost not yet paid
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
  consentedAt?: string
  createdAt: string
}

/** Household ownership ratio. Shares are in basis points (10000 = 100%) and must sum to 10000. */
export interface CostSplitShare {
  uid: string
  shareBps: number
}

export interface House {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  country?: string // ISO 3166-1 alpha-2 (e.g. 'ES', 'GB', 'US')
  currency?: string // ISO 4217 (e.g. 'EUR', 'GBP', 'USD')
  /** Optional household-wide cost allocation ratio. Omitted = split equally across current members. */
  costSplit?: CostSplitShare[]
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
