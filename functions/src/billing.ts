import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Webhook, WebhookVerificationError } from "standardwebhooks";

/**
 * Polar.sh Merchant-of-Record billing integration — one-time purchases per house.
 *
 * Flow:
 *   1. Client calls `createCheckoutSession({ houseId, product })`
 *   2. This function creates a Polar checkout session, returns the hosted URL
 *   3. User pays on Polar's hosted page
 *   4. Polar redirects user to `/thanks` and POSTs `onPolarWebhook`
 *   5. `onPolarWebhook` verifies signature, writes entitlement to Firestore
 *
 * Entitlement is stored at `houses/{houseId}/meta/entitlement` — once written,
 * every member of that house experiences Pro via the client-side `useEntitlement`
 * hook (house members already have `meta/*` read access via Firestore rules).
 *
 * Webhook idempotency: keyed on `polarOrderId`. If a duplicate webhook arrives,
 * we no-op (Polar retries failed deliveries).
 */

const POLAR_API_KEY = defineSecret("POLAR_API_KEY");
const POLAR_WEBHOOK_SECRET = defineSecret("POLAR_WEBHOOK_SECRET");
const POLAR_PRODUCT_ID_PRO = defineSecret("POLAR_PRODUCT_ID_PRO");
const POLAR_PRODUCT_ID_ADDITIONAL = defineSecret(
  "POLAR_PRODUCT_ID_ADDITIONAL_HOUSE"
);

// Env-driven configuration — prod defaults are safe. Override via function
// runtime env vars for sandbox testing (see `.env.example`).
const POLAR_API_BASE =
  process.env.POLAR_API_BASE ?? "https://api.polar.sh/v1";
const APP_ORIGIN =
  process.env.CASATAB_ORIGIN ?? "https://casatab.com";

/**
 * Toggle verbose per-delivery diagnostic logging. Defaults to off (production
 * behaviour). Flip to `WEBHOOK_DEBUG=true` on the Cloud Function env when
 * diagnosing a signature or metadata issue; flip back off once resolved.
 * Errors are always logged regardless — they're actionable.
 */
const WEBHOOK_DEBUG = process.env.WEBHOOK_DEBUG === "true";

type CheckoutProduct = "pro" | "additional_house";

/**
 * Expected charge amount in cents per product. The webhook rejects any
 * incoming Polar event whose amount lies outside a tight tolerance around
 * these values — defence against misconfigured Polar products silently
 * granting Pro for €0 or promo-priced events being treated as full purchases.
 *
 * Must stay in sync with src/lib/billing.ts PRICES on the client.
 */
const EXPECTED_AMOUNTS_CENTS: Record<CheckoutProduct, number> = {
  pro: 4900,
  additional_house: 2900,
};

/** Accept amounts within ±10% to allow for regional rounding / VAT display. */
const AMOUNT_TOLERANCE = 0.1;

function isAmountAcceptable(actualCents: number, product: CheckoutProduct): boolean {
  const expected = EXPECTED_AMOUNTS_CENTS[product];
  if (!expected || actualCents <= 0) return false;
  const min = expected * (1 - AMOUNT_TOLERANCE);
  const max = expected * (1 + AMOUNT_TOLERANCE);
  return actualCents >= min && actualCents <= max;
}

/**
 * Paywall gate identifier — mirrors `PaywallGate` on the client. Stored in
 * Polar metadata and passed back via the success URL query string so the
 * `/thanks` page can route the user to the feature they were trying to
 * unlock rather than always dumping them at the invite dialog.
 */
type PaywallGate =
  | "invite"
  | "advanced_mortgage"
  | "budget"
  | "export"
  | "print"
  | "what_if"
  | "storage"
  | "create_house"
  | "generic";

const KNOWN_GATES: readonly PaywallGate[] = [
  "invite",
  "advanced_mortgage",
  "budget",
  "export",
  "print",
  "what_if",
  "storage",
  "create_house",
  "generic",
] as const;

function normaliseGate(input: unknown): PaywallGate {
  return typeof input === "string" && (KNOWN_GATES as readonly string[]).includes(input)
    ? (input as PaywallGate)
    : "generic";
}

interface CheckoutRequest {
  houseId: string;
  product: CheckoutProduct;
  gate?: PaywallGate;
  /**
   * For `product === 'additional_house'` only: the name of the house to
   * provision on payment success. Required in that case; ignored otherwise.
   * Stored in Polar metadata so the webhook (or reconcile path) can create
   * the house server-side after the payment succeeds.
   */
  newHouseName?: string;
}

const MAX_HOUSE_NAME_LEN = 80;

function sanitizeHouseName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_HOUSE_NAME_LEN);
}

interface CheckoutResponse {
  url: string;
}

function productToId(product: CheckoutProduct): string {
  switch (product) {
    case "pro":
      return POLAR_PRODUCT_ID_PRO.value();
    case "additional_house":
      return POLAR_PRODUCT_ID_ADDITIONAL.value();
  }
}

// App Check enforcement — OPT-IN via `ENFORCE_APP_CHECK=true`.
//
// Why opt-in and not "secure by default": enforcement only works when App
// Check is also wired up client-side (reCAPTCHA v3 site key registered in
// Firebase console + `VITE_APPCHECK_SITE_KEY` set in the client build). If
// the server enforces but the client has no token, every legitimate call
// gets 401'd. Opting in means the flag matches your real config state —
// flip it on once App Check is fully configured, not before.
//
// Abuse risk if off: the checkout endpoint only creates Polar URLs (no
// data leakage) and Polar itself rate-limits, so script-based abuse is
// low-impact. Still recommended to enable once App Check is configured.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === "true";

export const createCheckoutSession = onCall<CheckoutRequest, Promise<CheckoutResponse>>(
  {
    region: "europe-west1",
    enforceAppCheck: ENFORCE_APP_CHECK,
    secrets: [
      POLAR_API_KEY,
      POLAR_PRODUCT_ID_PRO,
      POLAR_PRODUCT_ID_ADDITIONAL,
    ],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to purchase");
    }
    const { houseId, product } = request.data;
    if (!houseId || !product) {
      throw new HttpsError("invalid-argument", "houseId and product are required");
    }

    // Verify the caller is a member of this house — prevents buying Pro for
    // someone else's house using a known houseId.
    const db = getFirestore();
    const memberDoc = await db
      .doc(`houses/${houseId}/members/${request.auth.uid}`)
      .get();
    if (!memberDoc.exists) {
      throw new HttpsError("permission-denied", "Not a member of this house");
    }

    // For the "pro" product, only the house owner should be able to pay, and
    // the house must not already be Pro (preventing accidental double-purchase).
    // For "additional_house", any member can transact.
    if (product === "pro") {
      const houseDoc = await db.doc(`houses/${houseId}`).get();
      if (houseDoc.data()?.ownerId !== request.auth.uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the house owner can upgrade this house"
        );
      }
      const entSnap = await db.doc(`houses/${houseId}/meta/entitlement`).get();
      if (entSnap.exists && entSnap.data()?.tier === "pro") {
        throw new HttpsError(
          "failed-precondition",
          "This house is already Pro"
        );
      }
    }

    // additional_house requires a name — without it the webhook can't provision
    // the new house doc. Validate here so we fail fast with a 400 rather than
    // taking the user through a full Polar checkout only to get stuck later.
    let sanitizedHouseName: string | null = null;
    if (product === "additional_house") {
      sanitizedHouseName = sanitizeHouseName(request.data.newHouseName);
      if (!sanitizedHouseName) {
        throw new HttpsError(
          "invalid-argument",
          "A name for the new house is required"
        );
      }
    }

    const productId = productToId(product);
    const gate = normaliseGate(request.data.gate);
    const metadata: Record<string, string> = {
      houseId,
      uid: request.auth.uid,
      product,
      gate,
    };
    if (sanitizedHouseName) {
      metadata.newHouseName = sanitizedHouseName;
    }

    // Thread the gate through the success URL so `/thanks` can deep-link the
    // user to the feature they were trying to unlock (e.g. mortgage for
    // `advanced_mortgage`, documents for `storage`). Polar preserves the URL.
    const thanksUrl = new URL(`${APP_ORIGIN}/thanks`);
    thanksUrl.searchParams.set("gate", gate);
    thanksUrl.searchParams.set("product", product);

    const response = await fetch(`${POLAR_API_BASE}/checkouts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${POLAR_API_KEY.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id: productId,
        success_url: thanksUrl.toString(),
        metadata,
        customer_email: request.auth.token.email ?? undefined,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Polar checkout creation failed:", response.status, errText);
      throw new HttpsError("internal", "Failed to create checkout session");
    }

    const data = (await response.json()) as { url?: string };
    if (!data.url) {
      throw new HttpsError("internal", "Polar response missing checkout URL");
    }
    return { url: data.url };
  }
);

/**
 * Verify a Polar webhook signature.
 *
 * Polar's signing scheme (per `@polar-sh/sdk/webhooks.js` `validateEvent`):
 *   1. Take the whole branded secret `polar_whs_<…>` as a UTF-8 string.
 *   2. Encode its bytes as base64.
 *   3. Hand that string to `new Webhook(base64Secret)` from `standardwebhooks`,
 *      which uses base64-decode to recover the original UTF-8 bytes and uses
 *      THOSE as the HMAC-SHA256 key.
 *
 * Net effect: the HMAC key is the UTF-8 bytes of the entire branded secret.
 *
 * We intentionally skip Polar SDK's full `validateEvent` because that also
 * strict-schema-validates the payload against Polar's current event types —
 * a new Polar event field would start throwing SDKValidationError here
 * even though the signature is valid. Signature-only verification is more
 * future-proof; we parse the body ourselves with a tolerant shape.
 *
 * Throws `WebhookVerificationError` on bad signature / stale timestamp.
 */
function verifyPolarWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string
): void {
  const base64Secret = Buffer.from(secret, "utf-8").toString("base64");
  const wh = new Webhook(base64Secret);
  wh.verify(rawBody, headers);
}

/**
 * Append-only audit log for every webhook delivery we've processed.
 *
 * Every outcome (accepted, rejected, ignored) writes a row to
 * `webhook_attempts/{autoId}`. This is the single source of truth when
 * diagnosing "I paid but nothing happened" reports — we can answer
 * instantly whether Polar reached us, whether the signature verified,
 * whether the amount matched, whether we wrote the entitlement, etc.
 *
 * Firestore rules (`firestore.rules`) deny all client reads + writes on
 * this collection — it's server-only, inspect via Firebase console.
 *
 * Best-effort: a Firestore outage here should not cause us to return 500
 * and trigger a Polar retry, so we swallow write errors.
 */
type WebhookAttemptStatus =
  | "accepted"
  | "revoked"
  | "already-processed"
  | "rejected-signature"
  | "rejected-stale"
  | "rejected-amount"
  | "ignored-type"
  | "ignored-missing-metadata";

interface WebhookAttemptRecord {
  webhookId: string;
  polarOrderId: string | undefined;
  eventType: string;
  status: WebhookAttemptStatus;
  houseId: string | undefined;
  reason?: string;
  payloadSnippet?: string;
}

async function writeWebhookAttempt(record: WebhookAttemptRecord): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection("webhook_attempts").add({
      ...record,
      receivedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Never surface this as a 500 — it would make Polar retry forever.
    console.warn("Failed to write webhook_attempts audit record:", err);
  }
}

/**
 * First color in `MEMBER_COLOR_PALETTE` (src/lib/constants.ts). The webhook
 * provisions the new house with exactly one member (the owner), so we always
 * pick index 0 — matches what the client's `createHouse()` does for new-house
 * first-member assignment.
 */
const FIRST_MEMBER_COLOR = "#2a9d90";

interface ProvisionAdditionalHouseInput {
  uid: string;
  payingHouseId: string;
  polarOrderId: string;
  newHouseName: string;
  purchasedAt: string;
  amount: number | null;
  currency: string | null;
}

interface ProvisionAdditionalHouseResult {
  houseId: string;
  created: boolean;
}

/**
 * Provision a brand-new house from a paid `additional_house` Polar order.
 *
 * Idempotency strategy: `polar_orders/{polarOrderId}` acts as the lock. The
 * transaction reads that doc first; if it already resolves to a houseId we
 * return it and do nothing else, so duplicate webhook deliveries and an
 * overlapping `reconcileOrder` call converge on the same house.
 *
 * Inherits country + currency from the paying house. That keeps the modal
 * tiny (name only) and matches the common case where someone tracks a second
 * property in the same locale; the user can change the country on the new
 * house from Settings if they need to.
 *
 * Member profile fields (displayName, email) are read from `users/{uid}`.
 * If that doc is missing (rare edge case where a user paid without a
 * Firestore profile ever materialising), we fall back to safe generic values
 * — the house is usable, the user can update their profile later.
 */
async function provisionAdditionalHouse(
  input: ProvisionAdditionalHouseInput
): Promise<ProvisionAdditionalHouseResult> {
  const db = getFirestore();
  const orderMarkerRef = db.doc(`polar_orders/${input.polarOrderId}`);
  const payingHouseRef = db.doc(`houses/${input.payingHouseId}`);
  const userProfileRef = db.doc(`users/${input.uid}`);

  // Generate the new houseId up front so it's referenceable inside the
  // transaction. Admin SDK's `.doc()` without a path auto-generates an id
  // locally without a round-trip.
  const newHouseRef = db.collection("houses").doc();
  const newHouseId = newHouseRef.id;

  return db.runTransaction(async (tx) => {
    const [existingMarker, payingHouseSnap, userProfileSnap] =
      await Promise.all([
        tx.get(orderMarkerRef),
        tx.get(payingHouseRef),
        tx.get(userProfileRef),
      ]);

    if (existingMarker.exists) {
      const markerHouseId = existingMarker.data()?.houseId;
      if (typeof markerHouseId === "string" && markerHouseId.length > 0) {
        return { houseId: markerHouseId, created: false };
      }
    }

    const payingHouse = payingHouseSnap.data() ?? {};
    const country =
      typeof payingHouse.country === "string" ? payingHouse.country : null;
    const currency =
      typeof payingHouse.currency === "string" ? payingHouse.currency : null;

    const profile = userProfileSnap.data() ?? {};
    const displayName =
      typeof profile.displayName === "string" && profile.displayName.trim()
        ? profile.displayName
        : "You";
    const email = typeof profile.email === "string" ? profile.email : "";

    const nowIso = new Date().toISOString();

    const houseDoc: Record<string, unknown> = {
      name: input.newHouseName,
      ownerId: input.uid,
      memberIds: [input.uid],
      createdAt: nowIso,
      createdFromPolarOrderId: input.polarOrderId,
    };
    if (country) houseDoc.country = country;
    if (currency) houseDoc.currency = currency;

    const memberDoc = {
      displayName,
      email,
      color: FIRST_MEMBER_COLOR,
      role: "owner",
      joinedAt: nowIso,
    };

    const entitlementDoc: Record<string, unknown> = {
      tier: "pro",
      purchasedAt: input.purchasedAt,
      polarOrderId: input.polarOrderId,
      product: "additional_house",
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.amount != null) entitlementDoc.amount = input.amount;
    if (input.currency) entitlementDoc.currency = input.currency;

    tx.set(newHouseRef, houseDoc);
    tx.set(
      db.doc(`houses/${newHouseId}/members/${input.uid}`),
      memberDoc
    );
    tx.set(
      db.doc(`houses/${newHouseId}/meta/entitlement`),
      entitlementDoc
    );
    tx.set(orderMarkerRef, {
      houseId: newHouseId,
      uid: input.uid,
      product: "additional_house",
      createdAt: FieldValue.serverTimestamp(),
    });

    return { houseId: newHouseId, created: true };
  });
}

export const onPolarWebhook = onRequest(
  {
    region: "europe-west1",
    secrets: [POLAR_WEBHOOK_SECRET],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Standard Webhooks (Svix) headers — Polar sends all three.
    const webhookId = req.header("webhook-id");
    const webhookTimestamp = req.header("webhook-timestamp");
    const signature = req.header("webhook-signature");
    if (!webhookId || !webhookTimestamp || !signature) {
      console.warn(
        `Missing Standard Webhooks headers (id=${!!webhookId}, timestamp=${!!webhookTimestamp}, signature=${!!signature})`
      );
      res.status(400).send("Missing webhook headers");
      return;
    }

    // Firebase Functions v2 gives us `rawBody` — required for signature check.
    // The cast is intentional: Firebase's TS types don't expose `rawBody` on
    // the Express request object, but the runtime does set it for HTTP
    // functions that need raw-body access (e.g. signature verification).
    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
    const secretValue = POLAR_WEBHOOK_SECRET.value();

    if (WEBHOOK_DEBUG) {
      const sigPreview = signature.length > 30 ? signature.slice(0, 30) + "…" : signature;
      const secretPrefix = secretValue.slice(0, Math.min(12, secretValue.length));
      console.log(
        `[polar-webhook][pre-verify] ` +
          `bodyBytes=${rawBody?.length ?? 0} ` +
          `id=${webhookId} ts=${webhookTimestamp} ` +
          `sig="${sigPreview}" sigFullLen=${signature.length} ` +
          `secretPrefix="${secretPrefix}" secretLen=${secretValue.length}`
      );
    }

    // Verify + reply-window check via the standardwebhooks library.
    // It throws with a typed error (e.g. "Invalid signature", "Message timestamp too old").
    try {
      verifyPolarWebhook(
        rawBody.toString("utf8"),
        {
          "webhook-id": webhookId,
          "webhook-timestamp": webhookTimestamp,
          "webhook-signature": signature,
        },
        secretValue
      );
    } catch (err) {
      const e = err as Error;
      const isVerifyErr = e instanceof WebhookVerificationError;
      // Always log failures — they're actionable (secret drift, attacker, stale event).
      console.error(
        `[polar-webhook][verify-failed] ` +
          `name=${e.name} isWebhookVerificationError=${isVerifyErr} ` +
          `message=${e.message} id=${webhookId} ts=${webhookTimestamp}`
      );
      const message = e.message ?? "verification failed";
      const isStale = /timestamp/i.test(message) || /old/i.test(message);
      await writeWebhookAttempt({
        webhookId,
        polarOrderId: undefined,
        eventType: "unknown",
        status: isStale ? "rejected-stale" : "rejected-signature",
        houseId: undefined,
        reason: message,
      });
      if (isStale) {
        res.status(400).send("Stale event");
      } else {
        res.status(401).send("Invalid signature");
      }
      return;
    }

    const event = req.body as {
      type: string;
      data?: {
        id?: string;
        status?: string;
        // Polar order events expose several amount fields. Use `total_amount`
        // for validation — that's what the customer actually paid, including
        // tax. `amount` on order events is net-of-tax (e.g. 4050 cents for a
        // €49 product where tax is 850/4900 ≈ 17%), which wrongly looks like
        // an underpayment to a naive validator.
        amount?: number;
        total_amount?: number;
        subtotal_amount?: number;
        tax_amount?: number;
        net_amount?: number;
        currency?: string;
        metadata?: Record<string, unknown> & {
          houseId?: string;
          uid?: string;
          product?: CheckoutProduct;
        };
        // Polar can attach metadata at several paths depending on the event
        // type. Keep these as optional reads for robustness.
        custom_field_data?: Record<string, unknown>;
        checkout?: { metadata?: Record<string, unknown> };
        created_at?: string;
      };
    };

    if (WEBHOOK_DEBUG) {
      console.log(
        `[polar-webhook][event] type=${event.type} id=${event.data?.id} ` +
          `payload=${JSON.stringify(event).slice(0, 2000)}`
      );
    }

    // Event routing — mapped to Polar's actual event catalog:
    //   Grant Pro: order.paid (primary), order.created, order.updated
    //   Revoke Pro: order.refunded (Polar handles chargebacks via this event too)
    //
    // Any other event type (checkout.*, customer.*, subscription.*, …) is
    // acknowledged with 200 but otherwise a no-op, so Polar's dashboard stays
    // clean of failed-delivery noise.
    const isGrantEvent =
      event.type === "order.paid" ||
      event.type === "order.created" ||
      event.type === "order.updated";
    const isRevokeEvent = event.type === "order.refunded";

    if (!isGrantEvent && !isRevokeEvent) {
      await writeWebhookAttempt({
        webhookId,
        polarOrderId: event.data?.id,
        eventType: event.type,
        status: "ignored-type",
        houseId: undefined,
      });
      res.status(200).send("Ignored");
      return;
    }

    const data = event.data;
    // Metadata-path tolerance: Polar's shape has evolved across API versions.
    // Check known locations in priority order. Values are all strings, so pick
    // the first path that yields a non-empty `houseId`.
    const metaCandidates: Array<Record<string, unknown> | undefined> = [
      data?.metadata,
      data?.checkout?.metadata,
      data?.custom_field_data,
    ];
    const resolvedMeta = metaCandidates.find(
      (m) => m && typeof (m as { houseId?: unknown }).houseId === "string"
    ) as
      | {
          houseId?: string;
          uid?: string;
          product?: CheckoutProduct;
          newHouseName?: string;
        }
      | undefined;

    if (!resolvedMeta?.houseId || !data?.id) {
      console.warn(
        `Webhook missing houseId or order id. event.type=${event.type} ` +
          `event.data.id=${data?.id}`
      );
      await writeWebhookAttempt({
        webhookId,
        polarOrderId: data?.id,
        eventType: event.type,
        status: "ignored-missing-metadata",
        houseId: undefined,
        reason:
          "No houseId found in data.metadata, data.checkout.metadata, or data.custom_field_data",
      });
      res.status(200).send("Ignored (missing metadata)");
      return;
    }

    const { houseId, product } = resolvedMeta;
    const polarOrderId = data.id;

    // ── Revocation path ────────────────────────────────────────────────
    //
    // Resolve the house whose entitlement we should actually touch. For
    // product=pro, metadata.houseId is correct (the purchase upgraded that
    // same house). For product=additional_house, metadata.houseId points
    // at the *paying* house — the PROVISIONED house is stored in the
    // `polar_orders/{polarOrderId}` marker written when we first accepted
    // the payment. Without this lookup, refunded additional houses would
    // silently keep Pro because polarOrderId never matches the paying
    // house's entitlement.
    if (isRevokeEvent) {
      const db = getFirestore();
      const orderMarker = await db.doc(`polar_orders/${polarOrderId}`).get();
      const markerHouseId = orderMarker.exists
        ? (orderMarker.data()?.houseId as string | undefined)
        : undefined;
      const revokeTargetHouseId =
        typeof markerHouseId === "string" && markerHouseId.length > 0
          ? markerHouseId
          : houseId;

      const entitlementRef = db.doc(
        `houses/${revokeTargetHouseId}/meta/entitlement`
      );
      const existing = await entitlementRef.get();
      // Only revoke the entitlement if it was actually granted for this specific
      // order — prevents a fraudulent refund event for a different order from
      // nuking a legitimately-paid Pro grant.
      if (existing.exists && existing.data()?.polarOrderId === polarOrderId) {
        await entitlementRef.set(
          {
            tier: "free",
            revokedAt: data.created_at ?? new Date().toISOString(),
            revokedReason: event.type,
            revokedPolarOrderId: polarOrderId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        console.log(
          `Entitlement REVOKED for house ${revokeTargetHouseId} (order ${polarOrderId}, event ${event.type})`
        );
        await writeWebhookAttempt({
          webhookId,
          polarOrderId,
          eventType: event.type,
          status: "revoked",
          houseId: revokeTargetHouseId,
        });
      } else {
        console.warn(
          `Revoke event ${event.type} for house ${revokeTargetHouseId} / order ${polarOrderId} — no matching entitlement, ignored`
        );
        await writeWebhookAttempt({
          webhookId,
          polarOrderId,
          eventType: event.type,
          status: "ignored-type",
          houseId: revokeTargetHouseId,
          reason: "Revoke for order that doesn't match stored entitlement",
        });
      }
      res.status(200).send("Revoked");
      return;
    }

    // Defence: reject amounts that don't match the expected product price.
    // Protects against misconfigured Polar products (wrong price), staging
    // product IDs leaking to prod, and promo events mistakenly routed to the
    // main webhook.
    //
    // Which field to validate? Polar order events expose both `amount` (net
    // of tax) and `total_amount` (what the customer actually paid, incl. tax).
    // For price enforcement we compare against `total_amount` — that's the
    // number matching the catalog price the customer agreed to. Falling back
    // to `amount` keeps older API shapes / non-order events working.
    // We still accept within a ±10% band for VAT/currency drift.
    const productKey = (product ?? "pro") as CheckoutProduct;
    const amountForValidation =
      data.total_amount ?? data.subtotal_amount ?? data.amount ?? null;
    if (
      amountForValidation != null &&
      !isAmountAcceptable(amountForValidation, productKey)
    ) {
      console.error(
        `Rejecting webhook for order ${polarOrderId}: ` +
          `total_amount=${data.total_amount} subtotal=${data.subtotal_amount} amount=${data.amount} ` +
          `— chosen for validation: ${amountForValidation}, expected product=${productKey}`
      );
      await writeWebhookAttempt({
        webhookId,
        polarOrderId,
        eventType: event.type,
        status: "rejected-amount",
        houseId,
        reason: `Validated ${amountForValidation} for product=${productKey}`,
      });
      res.status(400).send("Amount mismatch");
      return;
    }

    const db = getFirestore();
    const purchasedAt = data.created_at ?? new Date().toISOString();
    const paidAmount = data.total_amount ?? data.amount ?? null;
    const paidCurrency = data.currency ?? null;

    // ── additional_house branch ──────────────────────────────────────
    // Instead of writing to the paying house's entitlement (which is
    // already Pro), provision a brand-new house from the metadata. The
    // `polar_orders/{polarOrderId}` marker inside the transaction makes
    // this idempotent across webhook retries + reconcile concurrency.
    if (productKey === "additional_house") {
      const newHouseName =
        typeof resolvedMeta?.newHouseName === "string"
          ? resolvedMeta.newHouseName.trim()
          : "";
      const uid = typeof resolvedMeta?.uid === "string" ? resolvedMeta.uid : "";
      if (!newHouseName || !uid) {
        // Defensive: createCheckoutSession validates newHouseName at request
        // time, so reaching this branch implies either an old checkout from
        // before this version shipped, or a deliberately malformed metadata
        // blob. Record it and 200-ack (don't trigger Polar retries).
        console.warn(
          `additional_house webhook missing newHouseName or uid (order=${polarOrderId})`
        );
        await writeWebhookAttempt({
          webhookId,
          polarOrderId,
          eventType: event.type,
          status: "ignored-missing-metadata",
          houseId,
          reason: "additional_house missing newHouseName or uid",
        });
        res.status(200).send("Ignored (missing additional_house metadata)");
        return;
      }

      const { houseId: provisionedHouseId, created } =
        await provisionAdditionalHouse({
          uid,
          payingHouseId: houseId,
          polarOrderId,
          newHouseName,
          purchasedAt,
          amount: paidAmount,
          currency: paidCurrency,
        });

      if (created) {
        console.log(
          `additional_house provisioned: new house ${provisionedHouseId} for uid=${uid} order=${polarOrderId}`
        );
      }
      await writeWebhookAttempt({
        webhookId,
        polarOrderId,
        eventType: event.type,
        status: created ? "accepted" : "already-processed",
        // Record the *provisioned* houseId here — it's what support cares
        // about when diagnosing "I paid for a second house but don't see it".
        houseId: provisionedHouseId,
      });
      res.status(200).send(created ? "OK" : "Already processed");
      return;
    }

    // ── pro branch (existing behaviour) ──────────────────────────────
    const entitlementRef = db.doc(`houses/${houseId}/meta/entitlement`);

    // Idempotency: if this order has already been written, skip.
    const existing = await entitlementRef.get();
    if (existing.exists && existing.data()?.polarOrderId === polarOrderId) {
      await writeWebhookAttempt({
        webhookId,
        polarOrderId,
        eventType: event.type,
        status: "already-processed",
        houseId,
      });
      res.status(200).send("Already processed");
      return;
    }

    await entitlementRef.set(
      {
        tier: "pro",
        purchasedAt,
        polarOrderId,
        // Record the actual paid amount (total_amount) for auditability.
        amount: paidAmount,
        currency: paidCurrency,
        product: product ?? "pro",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`Entitlement written for house ${houseId} (order ${polarOrderId})`);
    await writeWebhookAttempt({
      webhookId,
      polarOrderId,
      eventType: event.type,
      status: "accepted",
      houseId,
    });
    res.status(200).send("OK");
  }
);

/**
 * Self-service webhook reconciliation.
 *
 * The happy path is: user pays → Polar POSTs `order.paid` → we write the
 * entitlement (and, for additional_house, provision the new house). In rare
 * cases the webhook never reaches us (network blip, Polar temporarily
 * disabled the endpoint, signature mismatch during a secret rotation, etc.)
 * and the user ends up stuck after paying.
 *
 * Two modes:
 *
 *   mode='pro' (default, legacy callers)
 *     Caller passes `houseId`. Queries Polar for paid orders matching that
 *     house and writes the entitlement. Idempotent with the webhook via the
 *     shared polarOrderId on the entitlement doc.
 *
 *   mode='additional_house'
 *     Caller passes nothing beyond the mode; we filter Polar by the
 *     authenticated uid and provision the missing house. Idempotent via the
 *     `polar_orders/{polarOrderId}` marker read inside the provisioning
 *     transaction, so an overlapping webhook and reconcile call converge on
 *     the same new house.
 *
 * Security:
 *   - mode='pro': caller must be a member of the named house, and only
 *     Polar orders whose metadata.houseId matches are accepted.
 *   - mode='additional_house': Polar orders are filtered by metadata.uid
 *     so another user's paid orders can never surface.
 */
type ReconcileMode = "pro" | "additional_house";

interface ReconcileRequest {
  mode?: ReconcileMode;
  houseId?: string;
}

type ReconcileStatus =
  | "already-pro"
  | "reconciled"
  | "no-order";

interface ReconcileResponse {
  status: ReconcileStatus;
  polarOrderId?: string;
  /**
   * The house the purchase resolved to. For mode='pro' it's the same as the
   * input `houseId`. For mode='additional_house' it's the newly provisioned
   * (or previously provisioned, if this is a retry) house id.
   */
  houseId?: string;
}

interface PolarOrderListItem {
  id: string;
  status: string;
  paid?: boolean;
  total_amount?: number;
  subtotal_amount?: number;
  amount?: number;
  currency?: string;
  created_at?: string;
  metadata?: {
    houseId?: string;
    uid?: string;
    product?: CheckoutProduct;
    newHouseName?: string;
  };
}

async function fetchPolarOrdersByMetadata(
  metadataPairs: Array<[string, string]>
): Promise<PolarOrderListItem[]> {
  const params = new URLSearchParams();
  for (const [key, value] of metadataPairs) {
    params.append("metadata", `${key}:${value}`);
  }
  params.set("limit", "20");

  const resp = await fetch(`${POLAR_API_BASE}/orders/?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${POLAR_API_KEY.value()}`,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error(
      `Polar orders list failed: ${resp.status} body=${text.slice(0, 500)}`
    );
    throw new HttpsError("internal", "Could not query order history");
  }
  const json = (await resp.json()) as { items?: PolarOrderListItem[] };
  return json.items ?? [];
}

export const reconcileOrder = onCall<ReconcileRequest, Promise<ReconcileResponse>>(
  {
    region: "europe-west1",
    enforceAppCheck: ENFORCE_APP_CHECK,
    secrets: [POLAR_API_KEY],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to reconcile");
    }
    const mode: ReconcileMode = request.data?.mode ?? "pro";
    const db = getFirestore();

    // ── additional_house mode ────────────────────────────────────────
    if (mode === "additional_house") {
      const items = await fetchPolarOrdersByMetadata([
        ["uid", request.auth.uid],
        ["product", "additional_house"],
      ]);

      // Most-recent-first (Polar's default). Pick the newest paid order so a
      // user with many past additional_house purchases always resolves to
      // their freshest checkout.
      const matching = items.find(
        (o) =>
          o.metadata?.uid === request.auth!.uid &&
          o.metadata?.product === "additional_house" &&
          (o.paid === true || o.status === "paid")
      );

      if (!matching) return { status: "no-order" };

      const amountForValidation =
        matching.total_amount ?? matching.subtotal_amount ?? matching.amount ?? null;
      if (
        amountForValidation != null &&
        !isAmountAcceptable(amountForValidation, "additional_house")
      ) {
        console.error(
          `Rejecting reconcile for order ${matching.id}: amount=${amountForValidation} ` +
            `does not match expected for product=additional_house`
        );
        throw new HttpsError(
          "failed-precondition",
          "Order amount does not match the expected product price"
        );
      }

      const newHouseName =
        typeof matching.metadata?.newHouseName === "string"
          ? matching.metadata.newHouseName.trim()
          : "";
      const payingHouseId =
        typeof matching.metadata?.houseId === "string"
          ? matching.metadata.houseId
          : null;
      if (!newHouseName || !payingHouseId) {
        // This would only happen for a pre-migration checkout. Nothing we can
        // do automatically; return no-order so /thanks falls through to the
        // contact-us flow.
        console.warn(
          `Reconcile: order ${matching.id} has incomplete metadata (newHouseName or paying houseId missing)`
        );
        return { status: "no-order" };
      }

      const { houseId: resolvedHouseId, created } =
        await provisionAdditionalHouse({
          uid: request.auth.uid,
          payingHouseId,
          polarOrderId: matching.id,
          newHouseName,
          purchasedAt: matching.created_at ?? new Date().toISOString(),
          amount: matching.total_amount ?? matching.amount ?? null,
          currency: matching.currency ?? null,
        });

      console.log(
        `Reconcile: additional_house ${created ? "created" : "already-present"} ` +
          `house=${resolvedHouseId} order=${matching.id} uid=${request.auth.uid}`
      );
      return {
        status: created ? "reconciled" : "already-pro",
        polarOrderId: matching.id,
        houseId: resolvedHouseId,
      };
    }

    // ── pro mode (default) ───────────────────────────────────────────
    const { houseId } = request.data;
    if (!houseId) {
      throw new HttpsError("invalid-argument", "houseId required");
    }

    const memberDoc = await db
      .doc(`houses/${houseId}/members/${request.auth.uid}`)
      .get();
    if (!memberDoc.exists) {
      throw new HttpsError("permission-denied", "Not a member of this house");
    }

    const entitlementRef = db.doc(`houses/${houseId}/meta/entitlement`);
    const existing = await entitlementRef.get();
    if (existing.exists && existing.data()?.tier === "pro") {
      return { status: "already-pro", houseId };
    }

    const items = await fetchPolarOrdersByMetadata([["houseId", houseId]]);

    // Pick the most recent paid order whose metadata matches this house.
    const matching = items.find(
      (o) =>
        o.metadata?.houseId === houseId &&
        (o.paid === true || o.status === "paid")
    );

    if (!matching) {
      return { status: "no-order" };
    }

    const product = (matching.metadata?.product ?? "pro") as CheckoutProduct;

    const amountForValidation =
      matching.total_amount ?? matching.subtotal_amount ?? matching.amount ?? null;
    if (
      amountForValidation != null &&
      !isAmountAcceptable(amountForValidation, product)
    ) {
      console.error(
        `Rejecting reconcile for order ${matching.id}: amount=${amountForValidation} ` +
          `does not match expected for product=${product}`
      );
      throw new HttpsError(
        "failed-precondition",
        "Order amount does not match the expected product price"
      );
    }

    await entitlementRef.set(
      {
        tier: "pro",
        purchasedAt: matching.created_at ?? new Date().toISOString(),
        polarOrderId: matching.id,
        amount: matching.total_amount ?? matching.amount ?? null,
        currency: matching.currency ?? null,
        product,
        reconciled: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(
      `Entitlement reconciled for house ${houseId} from order ${matching.id} ` +
        `(caller uid=${request.auth.uid})`
    );

    return { status: "reconciled", polarOrderId: matching.id, houseId };
  }
);

/**
 * One-time grandfather migration. Run once at launch from the Firebase console
 * via `gcloud functions call grandfatherExistingHouses`.
 *
 * Writes `{ tier: 'pro', grandfathered: true }` on every active house so no
 * existing user gets silently downgraded.
 */
export const grandfatherExistingHouses = onCall(
  {
    region: "europe-west1",
  },
  async (request) => {
    // Only project admins can run this — check against a hard-coded admin UID
    // list in env. Set CASATAB_ADMIN_UIDS to a comma-separated list.
    const adminUids = (process.env.CASATAB_ADMIN_UIDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!request.auth || !adminUids.includes(request.auth.uid)) {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const db = getFirestore();
    const runMarkerRef = db.doc("system/grandfather-run");
    const existingMarker = await runMarkerRef.get();
    const previousRuns = existingMarker.exists
      ? ((existingMarker.data()?.runs as Array<unknown>) ?? [])
      : [];

    const houses = await db.collection("houses").get();
    let updated = 0;
    let skipped = 0;

    for (const doc of houses.docs) {
      if (doc.data().deletedAt) {
        skipped++;
        continue;
      }
      const ref = db.doc(`houses/${doc.id}/meta/entitlement`);
      const existing = await ref.get();
      if (existing.exists) {
        skipped++;
        continue;
      }
      await ref.set({
        tier: "pro",
        purchasedAt: new Date().toISOString(),
        grandfathered: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated++;
    }

    // Record the execution — an audit trail for admins. The first run matters
    // most (that's when everyone gets grandfathered); subsequent runs should
    // be near-zero `updated` counts, which is a useful sanity check.
    await runMarkerRef.set({
      lastRun: new Date().toISOString(),
      lastRunBy: request.auth.uid,
      lastRunUpdated: updated,
      lastRunSkipped: skipped,
      lastRunTotal: houses.size,
      runs: [
        ...previousRuns,
        {
          at: new Date().toISOString(),
          by: request.auth.uid,
          updated,
          skipped,
          total: houses.size,
        },
      ].slice(-10), // keep last 10 runs
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { updated, skipped, total: houses.size };
  }
);
