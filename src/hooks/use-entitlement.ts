import { FREE_LIMITS } from '@/lib/entitlement-limits'
import { useEntitlementContext, type EntitlementContextValue } from '@/context/EntitlementContext'

/**
 * Read the current house's entitlement.
 *
 * This is a thin reader over `EntitlementContext` — the actual Firestore
 * subscription is hoisted into `EntitlementProvider` so every component in
 * the tree shares one listener, one loading state, and one consistent tier.
 *
 * If the hook is called outside the provider (or in a test that hasn't wired
 * the provider / mocked this module), it returns a safe "loading, free" state
 * so the caller renders the conservative branch rather than throwing.
 */
export function useEntitlement(): EntitlementContextValue {
  const ctx = useEntitlementContext()
  if (ctx) return ctx
  return { entitlement: null, limits: FREE_LIMITS, isPro: false, isLoading: true }
}
