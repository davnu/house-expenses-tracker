import type { EntitlementTier, HouseEntitlement } from '@/types/entitlement'

export interface TierLimits {
  maxMembers: number
  maxStorageMB: number
  hasHouseholdInvites: boolean
  hasAdvancedMortgage: boolean
  hasBudget: boolean
  hasExport: boolean
  hasPrintSummary: boolean
  hasMortgageWhatIf: boolean
}

// The Documents hub is NOT gated. Storage is: free users get the same 50 MB
// attachment + documents quota they have today; Pro bumps to 500 MB. The
// 50 MB cliff becomes the pressure point during an active house purchase
// (deeds, contracts, renovation photos fill it fast), which converts better
// than a feature wall on a page the user deliberately navigated to.
export const FREE_LIMITS: TierLimits = {
  maxMembers: 1,
  maxStorageMB: 50,
  hasHouseholdInvites: false,
  hasAdvancedMortgage: false,
  hasBudget: false,
  hasExport: false,
  hasPrintSummary: false,
  hasMortgageWhatIf: false,
}

export const PRO_LIMITS: TierLimits = {
  maxMembers: Number.POSITIVE_INFINITY,
  maxStorageMB: 500,
  hasHouseholdInvites: true,
  hasAdvancedMortgage: true,
  hasBudget: true,
  hasExport: true,
  hasPrintSummary: true,
  hasMortgageWhatIf: true,
}

export function limitsForTier(tier: EntitlementTier): TierLimits {
  return tier === 'pro' ? PRO_LIMITS : FREE_LIMITS
}

/**
 * Resolve effective limits for a house given its entitlement doc.
 * When `entitlement` is undefined (doc not yet loaded or missing), defaults to free.
 */
export function resolveLimits(entitlement?: HouseEntitlement | null): TierLimits {
  return limitsForTier(entitlement?.tier ?? 'free')
}

/** Canonical bytes conversion so no caller re-derives `maxStorageMB * 1024 * 1024`. */
export function maxBytesForLimits(limits: TierLimits): number {
  return limits.maxStorageMB * 1024 * 1024
}

/** Gate identifier — used by the upgrade modal to show context-specific copy and analytics. */
export type PaywallGate =
  | 'invite'
  | 'advanced_mortgage'
  | 'budget'
  | 'export'
  | 'print'
  | 'what_if'
  | 'storage'
  | 'create_house'
  | 'generic'

export class PaywallRequired extends Error {
  readonly gate: PaywallGate
  constructor(gate: PaywallGate, message?: string) {
    super(message ?? `Pro required: ${gate}`)
    this.name = 'PaywallRequired'
    this.gate = gate
  }
}
