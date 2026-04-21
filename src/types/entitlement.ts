/**
 * Entitlement stored at `houses/{houseId}/meta/entitlement`.
 * One entitlement per house — paying for a house unlocks Pro for every member.
 * Written only by Cloud Functions (admin SDK) after a verified Polar webhook.
 */
export type EntitlementTier = 'free' | 'pro'

export interface HouseEntitlement {
  tier: EntitlementTier
  /** ISO timestamp of purchase, or of grandfathering. */
  purchasedAt?: string
  /** Polar order ID — used for webhook idempotency and receipt lookup. */
  polarOrderId?: string
  /** Amount paid in cents, in the currency actually charged (for audit). */
  amount?: number
  /** Currency charged (e.g. 'EUR', 'USD'). */
  currency?: string
  /** True if this house was grandfathered (existing user at launch, got Pro free). */
  grandfathered?: boolean
  /** ISO timestamp when Pro was revoked (refund, chargeback). */
  revokedAt?: string
  /** Polar event type that triggered the revocation (e.g. 'order.refunded'). */
  revokedReason?: string
  /** Polar order ID that was revoked — for audit trail. */
  revokedPolarOrderId?: string
}
