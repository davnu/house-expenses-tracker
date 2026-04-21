import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '@/data/firebase'
import i18n from '@/i18n'
import type { PaywallGate } from './entitlement-limits'

/**
 * Start a Polar checkout session for the given house.
 *
 * Calls the `createCheckoutSession` Cloud Function in europe-west1. Error
 * mapping is deliberate: Firebase callable codes like `functions/unauthenticated`
 * or `functions/internal` leak SDK internals to users. We map known codes into
 * either `CheckoutNotConfigured` (pre-launch, UI shows a friendly "coming soon"
 * banner) or a translated user-facing message thrown as a plain Error.
 *
 * The `gate` arg is reserved for future analytics attribution (which feature
 * triggered the upgrade); not currently forwarded to the backend.
 */
export class CheckoutNotConfigured extends Error {
  constructor() {
    super('Checkout is not yet configured')
    this.name = 'CheckoutNotConfigured'
  }
}

export type CheckoutProduct = 'pro' | 'additional_house'

export interface CheckoutOptions {
  /**
   * For `product === 'additional_house'`: the name of the new house to create
   * on payment success. The server stores this in Polar metadata and the
   * webhook uses it as the name when provisioning the new house doc. Required
   * for additional_house, ignored for other products.
   */
  newHouseName?: string
}

interface CheckoutResponse {
  url: string
}

export async function startCheckout(
  houseId: string,
  product: CheckoutProduct,
  gate?: PaywallGate,
  options?: CheckoutOptions,
): Promise<void> {
  try {
    const functions = getFunctions(app, 'europe-west1')
    const fn = httpsCallable<
      {
        houseId: string
        product: CheckoutProduct
        gate?: PaywallGate
        newHouseName?: string
      },
      CheckoutResponse
    >(functions, 'createCheckoutSession')
    const { data } = await fn({
      houseId,
      product,
      gate,
      newHouseName: options?.newHouseName,
    })
    if (!data?.url) throw new CheckoutNotConfigured()
    window.location.href = data.url
  } catch (err) {
    if (err instanceof CheckoutNotConfigured) throw err
    const code = (err as { code?: string } | null)?.code ?? ''

    // `not-found` / `unavailable` = the Cloud Function isn't deployed yet (or the
    // Polar product IDs haven't been wired). Show the friendly "coming soon" UI.
    if (code === 'functions/not-found' || code === 'functions/unavailable') {
      throw new CheckoutNotConfigured()
    }

    // `unauthenticated` = App Check rejected the request or the user's auth
    // token expired. Raw code would read "Unauthenticated" in the UI.
    if (code === 'functions/unauthenticated') {
      throw new Error(i18n.t('billing.errors.unauthenticated'))
    }

    // `internal` / `failed-precondition` = transient server problem. Ask the
    // user to retry instead of surfacing a raw stack-traced internal error.
    if (code === 'functions/internal' || code === 'functions/failed-precondition') {
      throw new Error(i18n.t('billing.errors.transient'))
    }

    // Any other error (network hiccup, unknown code) — generic friendly message
    // that doesn't claim anything specific about the cause.
    throw new Error(i18n.t('billing.errors.generic'))
  }
}

/**
 * Display prices — source of truth for the UI. Real charge is done server-side
 * via Polar product IDs; these must stay in sync with the Polar dashboard.
 *
 * No fake "anchor" prices here. Under EU consumer protection rules (DE/FR
 * price-display law, UCPD directive), a struck-through reference price must
 * reflect an actual prior price. Inventing one is misleading advertising.
 */
export const PRICES = {
  pro: { amount: 4900, currency: 'EUR', display: '€49' },
  additional_house: { amount: 2900, currency: 'EUR', display: '€29' },
} as const

/**
 * Ask the server to re-check Polar for a paid order and, if found, write the
 * entitlement (and, for `additional_house`, create the house doc). Used when
 * the webhook silently failed and the user is stuck after paying.
 *
 * Mode `pro` reconciles a specific house: the caller passes the `houseId`
 * they paid for. Mode `additional_house` reconciles by the authenticated user
 * instead — Polar is queried for orders whose metadata.uid matches the caller
 * and the missing house is created on the fly. This lets `/thanks` recover
 * the new houseId even when the webhook never fired.
 */
export type ReconcileStatus = 'already-pro' | 'reconciled' | 'no-order'

export interface ReconcileResult {
  status: ReconcileStatus
  polarOrderId?: string
  /**
   * Present on `reconciled` (and `already-pro` for the additional_house mode)
   * — the houseId the user's purchase resolved to. For mode=pro this is the
   * same as the input houseId; for mode=additional_house it's the newly
   * created house's id.
   */
  houseId?: string
}

export interface ReconcileOptions {
  /** Defaults to 'pro' to preserve the pre-existing callsites. */
  mode?: 'pro' | 'additional_house'
  /** Required for mode='pro'; ignored for mode='additional_house'. */
  houseId?: string
}

export async function reconcileOrder(
  input: string | ReconcileOptions,
): Promise<ReconcileResult> {
  const opts: ReconcileOptions =
    typeof input === 'string' ? { mode: 'pro', houseId: input } : input
  const functions = getFunctions(app, 'europe-west1')
  const fn = httpsCallable<
    { mode?: 'pro' | 'additional_house'; houseId?: string },
    ReconcileResult
  >(functions, 'reconcileOrder')
  try {
    const { data } = await fn({ mode: opts.mode ?? 'pro', houseId: opts.houseId })
    return data
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? ''
    if (code === 'functions/unauthenticated') {
      throw new Error(i18n.t('billing.errors.unauthenticated'))
    }
    if (code === 'functions/internal' || code === 'functions/failed-precondition') {
      throw new Error(i18n.t('billing.errors.transient'))
    }
    throw new Error(i18n.t('billing.errors.generic'))
  }
}
