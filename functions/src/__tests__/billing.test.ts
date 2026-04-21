import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import polarOrderPaidFixture from "./fixtures/polar-order-paid.json";

/**
 * Polar's signing scheme per their SDK (webhooks.js `validateEvent`):
 *   base64Secret = Buffer.from(secret, "utf-8").toString("base64")
 *   webhook = new Webhook(base64Secret)
 * Tests must sign the same way so what we verify in production matches what
 * we sign in tests.
 */
function polarSign(id: string, timestamp: Date, body: string, secret: string): string {
  const base64Secret = Buffer.from(secret, "utf-8").toString("base64");
  const wh = new Webhook(base64Secret);
  return wh.sign(id, timestamp, body);
}

// ── Mocks (must run before importing billing) ───────────────────────
//
// Firebase wrappers: capture the handler so we can invoke it directly
// in tests without actually deploying anything. `vi.hoisted` is required
// because `vi.mock` factories run before any top-level code in the file.

const { capturedHandlers, onCallState } = vi.hoisted(() => ({
  capturedHandlers: {} as Record<string, (req: unknown, res?: unknown) => Promise<unknown>>,
  onCallState: { count: 0 },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: unknown, handler: (req: unknown) => Promise<unknown>) => {
    onCallState.count += 1;
    // Order matches declaration order in billing.ts:
    //   1. createCheckoutSession
    //   2. reconcileOrder
    //   3. grandfatherExistingHouses
    const name =
      onCallState.count === 1
        ? "createCheckoutSession"
        : onCallState.count === 2
          ? "reconcileOrder"
          : "grandfatherExistingHouses";
    capturedHandlers[name] = handler as never;
    return handler;
  },
  onRequest: (
    _opts: unknown,
    handler: (req: unknown, res: unknown) => Promise<unknown>
  ) => {
    capturedHandlers["onPolarWebhook"] = handler as never;
    return handler;
  },
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message?: string) {
      super(message ?? code);
      this.name = "HttpsError";
    }
  },
}));

// Stub the secrets: .value() returns a deterministic string for the test.
// For POLAR_WEBHOOK_SECRET, we use a Polar-formatted secret (polar_whs_<...>)
// — the real format Polar emits — so tests sign the way Polar's SDK signs.
const TEST_WEBHOOK_SECRET = "polar_whs_testSecretValueForLocalUnitTests";

vi.mock("firebase-functions/params", () => ({
  defineSecret: (name: string) => ({
    value: () =>
      name === "POLAR_WEBHOOK_SECRET" ? TEST_WEBHOOK_SECRET : `test-${name}`,
    name,
  }),
}));

// Mock firebase-admin/firestore with a tiny in-memory store + FieldValue sentinel.
const { firestoreStore, fieldValueMock } = vi.hoisted(() => ({
  firestoreStore: { current: {} as Record<string, Record<string, unknown> | undefined> },
  fieldValueMock: { serverTimestamp: () => "SERVER_TIMESTAMP_SENTINEL" },
}));

vi.mock("firebase-admin/firestore", () => {
  function createRef(path: string) {
    return {
      path,
      get: async () => ({
        exists: firestoreStore.current[path] !== undefined,
        data: () => firestoreStore.current[path],
      }),
      set: async (
        data: Record<string, unknown>,
        options?: { merge: boolean }
      ) => {
        if (options?.merge) {
          firestoreStore.current[path] = {
            ...(firestoreStore.current[path] ?? {}),
            ...data,
          };
        } else {
          firestoreStore.current[path] = { ...data };
        }
      },
      update: async (data: Record<string, unknown>) => {
        firestoreStore.current[path] = {
          ...(firestoreStore.current[path] ?? {}),
          ...data,
        };
      },
    };
  }
  let autoIdCounter = 0;
  function collection(path: string) {
    return {
      get: async () => ({
        size: Object.keys(firestoreStore.current).filter((k) =>
          k.startsWith(path + "/")
        ).length,
        docs: Object.entries(firestoreStore.current)
          .filter(([k]) => {
            const parts = k.replace(path + "/", "").split("/");
            return k.startsWith(path + "/") && parts.length === 1;
          })
          .map(([k, v]) => ({
            id: k.slice(path.length + 1),
            data: () => v,
          })),
      }),
      // Firestore's collection.add() generates an auto-id and stores the doc.
      // Used by `writeWebhookAttempt` to append audit records.
      add: async (data: Record<string, unknown>) => {
        const id = `auto_${autoIdCounter++}`;
        const fullPath = `${path}/${id}`;
        firestoreStore.current[fullPath] = { ...data };
        return { id, path: fullPath };
      },
      // `collection(...).doc()` with no id — admin SDK generates a local
      // auto-id without a round-trip. Used by `provisionAdditionalHouse`
      // to reserve the new houseId up front so it can be referenced inside
      // the transaction's tx.set() calls. Admin SDK refs expose both
      // `.path` and `.id` — we need the latter.
      doc: (id?: string) => {
        const generated = id ?? `auto_${autoIdCounter++}`;
        const ref = createRef(`${path}/${generated}`);
        return { ...ref, id: generated };
      },
    };
  }
  // Minimal runTransaction shim: the test store is single-threaded in-memory
  // so we don't need real snapshot-isolation; we just need tx.get/.set/.update
  // to forward to the underlying refs and run the callback once. This is
  // enough to exercise the idempotency/provisioning logic end-to-end; the
  // true transactional guarantees are covered by the admin SDK itself.
  async function runTransaction<T>(
    cb: (tx: {
      get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
      set: (
        ref: {
          set: (data: Record<string, unknown>, opts?: { merge: boolean }) => Promise<void>;
        },
        data: Record<string, unknown>,
        opts?: { merge: boolean }
      ) => void;
      update: (
        ref: { update: (data: Record<string, unknown>) => Promise<void> },
        data: Record<string, unknown>
      ) => void;
    }) => Promise<T>
  ): Promise<T> {
    const tx = {
      get: (ref: { get: () => Promise<unknown> }) => ref.get(),
      set: (
        ref: {
          set: (data: Record<string, unknown>, opts?: { merge: boolean }) => Promise<void>;
        },
        data: Record<string, unknown>,
        opts?: { merge: boolean }
      ) => {
        void ref.set(data, opts);
      },
      update: (
        ref: { update: (data: Record<string, unknown>) => Promise<void> },
        data: Record<string, unknown>
      ) => {
        void ref.update(data);
      },
    };
    return cb(tx);
  }
  return {
    getFirestore: () => ({
      doc: createRef,
      collection,
      runTransaction,
    }),
    FieldValue: fieldValueMock,
  };
});

// Import AFTER mocks
import "../billing";

// Capture original fetch for the checkout session tests.
const originalFetch = globalThis.fetch;

// ── Helpers ──────────────────────────────────────────────────────────

function makeRes() {
  const headers: Record<string, string> = {};
  const state = { status: 0, body: undefined as unknown };
  return {
    status(code: number) {
      state.status = code;
      return this;
    },
    send(body: unknown) {
      state.body = body;
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    get _state() {
      return state;
    },
    get _headers() {
      return headers;
    },
  };
}

type SignedHeaders = Record<"webhook-id" | "webhook-timestamp" | "webhook-signature", string>;

/**
 * Produce a Standard Webhooks (Svix) signed-headers triple for a body using
 * the SAME library the production verifier uses. This means the test exercises
 * the real verification code path — if the library or spec changes, tests and
 * production stay in sync automatically.
 *
 * Accepts optional overrides for edge-case tests (stale timestamps,
 * tampered signatures, etc.).
 */
function signPayload(
  body: string,
  secret: string,
  overrides: Partial<SignedHeaders> = {}
): SignedHeaders {
  const webhookId =
    overrides["webhook-id"] ?? "evt_test_" + Math.random().toString(36).slice(2, 10);
  const webhookTimestamp =
    overrides["webhook-timestamp"] ?? Math.floor(Date.now() / 1000).toString();

  let signature = overrides["webhook-signature"];
  if (!signature) {
    // Sign exactly the way Polar signs (see polarSign above).
    signature = polarSign(
      webhookId,
      new Date(Number(webhookTimestamp) * 1000),
      body,
      secret
    );
  }

  return {
    "webhook-id": webhookId,
    "webhook-timestamp": webhookTimestamp,
    "webhook-signature": signature,
  };
}

function makeWebhookReq(payload: unknown, headers: SignedHeaders | string, method = "POST") {
  const raw = Buffer.from(JSON.stringify(payload));
  // Backwards-compat: some tests pass a raw signature string to exercise
  // "invalid signature" paths. Wrap it with dummy id/timestamp so only the
  // signature mismatch is tested.
  const final: SignedHeaders =
    typeof headers === "string"
      ? {
          "webhook-id": "evt_test_legacy",
          "webhook-timestamp": Math.floor(Date.now() / 1000).toString(),
          "webhook-signature": headers,
        }
      : headers;
  return {
    method,
    header: (name: string) => final[name as keyof SignedHeaders] ?? undefined,
    rawBody: raw,
    body: payload,
  };
}

beforeEach(() => {
  firestoreStore.current = {};
});

// ── Webhook tests ────────────────────────────────────────────────────

describe("onPolarWebhook", () => {
  // Same Standard Webhooks-compliant secret as the defineSecret mock so
  // sign-in-test and verify-in-production use identical material.
  const secret = TEST_WEBHOOK_SECRET;

  it("405s on non-POST methods", async () => {
    const res = makeRes();
    const req = makeWebhookReq({}, "sig", "GET");
    await capturedHandlers.onPolarWebhook(req, res as never);
    expect(res._state.status).toBe(405);
  });

  it("400s when any of the Standard Webhooks headers are missing", async () => {
    const res = makeRes();
    const req = {
      method: "POST",
      header: () => undefined, // no webhook-id, timestamp, or signature
      rawBody: Buffer.from("{}"),
      body: {},
    };
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(400);
  });

  it("401s when the signature is invalid (protects against forged payloads)", async () => {
    const res = makeRes();
    const payload = { type: "order.paid", data: { id: "o1", metadata: { houseId: "h1" } } };
    // Provide valid id+timestamp but a garbage signature — isolates the
    // signature-mismatch path.
    const req = makeWebhookReq(payload, {
      "webhook-id": "evt_test",
      "webhook-timestamp": Math.floor(Date.now() / 1000).toString(),
      "webhook-signature": "v1,ZGVhZGJlZWY=",
    });
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(401);
  });

  it("accepts a correctly-signed order.paid and writes the entitlement", async () => {
    // Use a fresh timestamp so replay protection (±5 min window) accepts the event.
    const freshNow = new Date().toISOString();
    const payload = {
      type: "order.paid",
      data: {
        id: "ord_abc123",
        amount: 4900,
        currency: "EUR",
        metadata: { houseId: "h1", uid: "alice", product: "pro" },
        created_at: freshNow,
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);

    expect(res._state.status).toBe(200);
    const written = firestoreStore.current["houses/h1/meta/entitlement"];
    expect(written?.tier).toBe("pro");
    expect(written?.polarOrderId).toBe("ord_abc123");
    expect(written?.amount).toBe(4900);
    expect(written?.currency).toBe("EUR");
    expect(written?.product).toBe("pro");
    expect(written?.purchasedAt).toBe(freshNow);
  });

  it("is idempotent: a duplicate webhook for the same polarOrderId is a no-op", async () => {
    firestoreStore.current["houses/h1/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_abc123",
    };
    const payload = {
      type: "order.paid",
      data: { id: "ord_abc123", metadata: { houseId: "h1" } },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);

    expect(res._state.status).toBe(200);
    expect(res._state.body).toMatch(/Already processed/);
    // The stored entitlement must not have been overwritten with different fields
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toEqual({
      tier: "pro",
      polarOrderId: "ord_abc123",
    });
  });

  it("ignores events with unrecognised types (defensive against Polar dashboard misconfig)", async () => {
    const payload = { type: "checkout.expired", data: { id: "o1" } };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(200);
    expect(res._state.body).toMatch(/Ignored/);
    // Nothing written
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toBeUndefined();
  });

  it("REJECTS webhook whose amount doesn't match the product's expected price (critical audit fix #2)", async () => {
    // A Polar product misconfigured at €1 must never grant Pro worth €49.
    const payload = {
      type: "order.paid",
      data: {
        id: "ord_bad",
        amount: 100, // €1 in cents — outside ±10% of €49 (4900)
        currency: "EUR",
        metadata: { houseId: "h1", uid: "alice", product: "pro" },
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(400);
    expect(res._state.body).toMatch(/Amount mismatch/i);
    // CRUCIALLY: no entitlement was written
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toBeUndefined();
  });

  it("accepts amounts within the ±10% tolerance (allows for VAT / currency rounding)", async () => {
    // €49 → 4900 cents. 10% band = [4410, 5390]. 5300 is within.
    const payload = {
      type: "order.paid",
      data: {
        id: "ord_in_band",
        amount: 5300,
        currency: "EUR",
        metadata: { houseId: "h1", uid: "alice", product: "pro" },
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(200);
    expect(firestoreStore.current["houses/h1/meta/entitlement"]?.tier).toBe("pro");
  });

  it("rejects a zero-amount event (free Pro granted via misconfiguration)", async () => {
    const payload = {
      type: "order.paid",
      data: {
        id: "ord_zero",
        amount: 0,
        currency: "EUR",
        metadata: { houseId: "h1", uid: "alice", product: "pro" },
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(400);
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toBeUndefined();
  });

  it("rejects stale webhooks (replay protection — webhook-timestamp older than 5 min)", async () => {
    // Standard Webhooks: replay protection is anchored on the signed
    // `webhook-timestamp` header (unix seconds), not anything in the body.
    // A tampered body would also invalidate the signature, so this is the
    // canonical defence.
    const staleTs = Math.floor(Date.now() / 1000 - 10 * 60).toString();
    const payload = {
      type: "order.paid",
      data: {
        id: "ord_stale",
        amount: 4900,
        currency: "EUR",
        metadata: { houseId: "h1", uid: "alice", product: "pro" },
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret, { "webhook-timestamp": staleTs });
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(400);
    expect(res._state.body).toMatch(/Stale/);
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toBeUndefined();
  });

  it("rejects when the webhook-timestamp header is missing entirely (required by spec)", async () => {
    const payload = { type: "order.paid", data: { id: "ord_x", metadata: { houseId: "h1" } } };
    const body = JSON.stringify(payload);
    // Signed normally, then wipe the timestamp header to simulate a bad sender.
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => (n === "webhook-timestamp" ? undefined : sig[n as keyof typeof sig] ?? undefined),
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(400);
  });

  it("accepts a webhook where the body has no created_at (we rely on the signed webhook-timestamp instead)", async () => {
    const payload = {
      type: "order.paid",
      data: {
        id: "ord_no_time",
        amount: 4900,
        currency: "EUR",
        metadata: { houseId: "h1", uid: "alice", product: "pro" },
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(200);
  });

  it("handles order.refunded by revoking the entitlement (audit trail preserved)", async () => {
    firestoreStore.current["houses/h1/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_paid_123",
      purchasedAt: "2026-01-01T00:00:00.000Z",
    };
    const payload = {
      type: "order.refunded",
      data: {
        id: "ord_paid_123",
        metadata: { houseId: "h1", uid: "alice", product: "pro" },
        created_at: new Date().toISOString(),
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(200);
    const ent = firestoreStore.current["houses/h1/meta/entitlement"];
    expect(ent?.tier).toBe("free");
    expect(ent?.revokedReason).toBe("order.refunded");
    expect(ent?.revokedPolarOrderId).toBe("ord_paid_123");
    // Audit: original purchase history is preserved via merge
    expect(ent?.purchasedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("refund event for a DIFFERENT orderId must NOT revoke an active entitlement (defence vs fraud)", async () => {
    firestoreStore.current["houses/h1/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_legit",
    };
    // Attacker-forged refund with a different orderId claiming to revoke Pro
    const payload = {
      type: "order.refunded",
      data: {
        id: "ord_different",
        metadata: { houseId: "h1" },
        created_at: new Date().toISOString(),
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    // Entitlement is NOT revoked — the refund didn't match the active order
    expect(firestoreStore.current["houses/h1/meta/entitlement"]?.tier).toBe("pro");
  });

  it("additional_house refund revokes the PROVISIONED house (not the paying house)", async () => {
    // Setup: a paying house (Pro from some prior purchase) and a newly
    // provisioned additional house. `polar_orders/{ord_addl}` points the
    // refund at the provisioned house — metadata.houseId on the refund
    // event still references the paying house (that's what was in the
    // checkout's metadata at purchase time).
    firestoreStore.current["houses/h_paying/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_original_pro",
    };
    firestoreStore.current["houses/h_provisioned/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_addl",
      product: "additional_house",
    };
    firestoreStore.current["polar_orders/ord_addl"] = {
      houseId: "h_provisioned",
      uid: "alice",
      product: "additional_house",
    };

    const payload = {
      type: "order.refunded",
      data: {
        id: "ord_addl",
        metadata: {
          houseId: "h_paying", // paying house, per checkout metadata
          uid: "alice",
          product: "additional_house",
        },
        created_at: new Date().toISOString(),
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);

    expect(res._state.status).toBe(200);
    // The PROVISIONED house got revoked.
    expect(firestoreStore.current["houses/h_provisioned/meta/entitlement"]?.tier).toBe(
      "free"
    );
    expect(
      firestoreStore.current["houses/h_provisioned/meta/entitlement"]?.revokedPolarOrderId
    ).toBe("ord_addl");
    // The paying house is UNTOUCHED — its original Pro purchase (different
    // polarOrderId) must never be collateral damage from an additional_house
    // refund.
    expect(firestoreStore.current["houses/h_paying/meta/entitlement"]?.tier).toBe("pro");
    expect(
      firestoreStore.current["houses/h_paying/meta/entitlement"]?.revokedReason
    ).toBeUndefined();
  });

  it("additional_house refund with a missing polar_orders marker safely does nothing (can't resolve target house)", async () => {
    // An extremely unlikely edge case: a refund arrives for a polarOrderId
    // we have no marker for. This would mean either (a) the provision
    // transaction never wrote the marker (bug), or (b) the marker was
    // deleted. Either way we must NOT revoke on the paying house —
    // because the paying house's entitlement would have a different
    // polarOrderId, the no-match guard below catches it. Test verifies
    // that guard still fires in the marker-missing case.
    firestoreStore.current["houses/h_paying/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_original_pro",
    };
    // No polar_orders/ord_orphan marker.

    const payload = {
      type: "order.refunded",
      data: {
        id: "ord_orphan",
        metadata: {
          houseId: "h_paying",
          uid: "alice",
          product: "additional_house",
        },
        created_at: new Date().toISOString(),
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);

    expect(res._state.status).toBe(200);
    // Paying house is NOT revoked — its polarOrderId doesn't match.
    expect(firestoreStore.current["houses/h_paying/meta/entitlement"]?.tier).toBe("pro");
  });

  it("ignores checkout.* and other non-order events (not our concern for entitlements)", async () => {
    // Polar sends many event types we've subscribed to (checkout.created/updated/expired,
    // customer.*, subscription.*). None should flip the entitlement.
    firestoreStore.current["houses/h1/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_kept",
    };
    for (const type of [
      "checkout.created",
      "checkout.updated",
      "checkout.expired",
      "customer.created",
      "customer.updated",
    ]) {
      const payload = {
        type,
        data: {
          id: "whatever",
          metadata: { houseId: "h1" },
          created_at: new Date().toISOString(),
        },
      };
      const body = JSON.stringify(payload);
      const sig = signPayload(body, secret);
      const req = {
        method: "POST",
        header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
        rawBody: Buffer.from(body),
        body: payload,
      };
      const res = makeRes();
      await capturedHandlers.onPolarWebhook(req as never, res as never);
      expect(res._state.status).toBe(200);
      // Entitlement untouched across every non-order event type
      expect(firestoreStore.current["houses/h1/meta/entitlement"]?.tier).toBe("pro");
    }
  });

  it("validates against total_amount (paid incl. tax), not amount (net of tax) — regression for tax-inclusive pricing", async () => {
    // Real Polar order.paid shape: product catalog price is €49 tax-inclusive,
    // split into subtotal_amount=4900, tax_amount=850, total_amount=4900,
    // amount=net_amount=4050. A naive validator comparing `amount` (4050)
    // against the expected €49 (4900) would wrongly report an underpayment.
    const payload = {
      type: "order.paid",
      data: {
        id: "ord_tax_inclusive",
        amount: 4050,          // net of tax — NOT the paid amount
        total_amount: 4900,    // what the customer paid (the one we should check)
        subtotal_amount: 4900,
        tax_amount: 850,
        net_amount: 4050,
        currency: "eur",
        metadata: { houseId: "h1", uid: "alice", product: "pro" },
      },
    };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(200);
    expect(firestoreStore.current["houses/h1/meta/entitlement"]?.tier).toBe("pro");
    // The stored amount should be the total_amount (what the user paid), not net.
    expect(firestoreStore.current["houses/h1/meta/entitlement"]?.amount).toBe(4900);
  });

  it("accepts additional_house at €29 but rejects €49 (price must match the declared product)", async () => {
    const base = {
      type: "order.paid",
      data: {
        id: "ord_x",
        currency: "EUR",
        metadata: { houseId: "h1", uid: "alice", product: "additional_house" },
      },
    };
    // €49 is WAY outside €29's ±10% band (2610–3190)
    const wrongBody = JSON.stringify({
      ...base,
      data: { ...base.data, amount: 4900 },
    });
    const wrongSig = signPayload(wrongBody, secret);
    const res1 = makeRes();
    await capturedHandlers.onPolarWebhook(
      {
        method: "POST",
        header: (n: string) => wrongSig[n as keyof typeof wrongSig] ?? undefined,
        rawBody: Buffer.from(wrongBody),
        body: JSON.parse(wrongBody),
      } as never,
      res1 as never,
    );
    expect(res1._state.status).toBe(400);

    // Correct €29 passes
    const rightBody = JSON.stringify({
      ...base,
      data: { ...base.data, id: "ord_ok", amount: 2900 },
    });
    const rightSig = signPayload(rightBody, secret);
    const res2 = makeRes();
    await capturedHandlers.onPolarWebhook(
      {
        method: "POST",
        header: (n: string) => rightSig[n as keyof typeof rightSig] ?? undefined,
        rawBody: Buffer.from(rightBody),
        body: JSON.parse(rightBody),
      } as never,
      res2 as never,
    );
    expect(res2._state.status).toBe(200);
  });

  it("ignores events missing houseId metadata (should never happen, but defensive)", async () => {
    const payload = { type: "order.paid", data: { id: "o1", metadata: {} } };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(200);
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toBeUndefined();
  });

  it("ignores events missing the order id (can't write without idempotency key)", async () => {
    const payload = { type: "order.paid", data: { metadata: { houseId: "h1" } } };
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    expect(res._state.status).toBe(200);
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toBeUndefined();
  });

  // ── Real Polar fixture test (end-to-end, catches schema drift) ─────
  //
  // Uses a captured real Polar sandbox `order.paid` payload from the
  // Deliveries tab (see fixtures/polar-order-paid.json). If Polar ever
  // renames `total_amount`, moves metadata, or restructures the event,
  // these tests fail in CI before the next real payment silently stops
  // working. Re-signed with the test secret — purpose is schema drift,
  // not signature replay.

  it("real Polar order.paid fixture round-trips: verifies + writes the expected entitlement", async () => {
    firestoreStore.current = {};
    const body = JSON.stringify(polarOrderPaidFixture);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: polarOrderPaidFixture,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);

    expect(res._state.status).toBe(200);
    const houseId = polarOrderPaidFixture.data.metadata.houseId;
    const written = firestoreStore.current[`houses/${houseId}/meta/entitlement`];
    expect(written?.tier).toBe("pro");
    expect(written?.polarOrderId).toBe(polarOrderPaidFixture.data.id);
    // Validates against total_amount (incl. tax), not `amount` (net of tax) —
    // the original production bug.
    expect(written?.amount).toBe(polarOrderPaidFixture.data.total_amount);
    expect(written?.product).toBe("pro");
  });

  it("real Polar fixture writes an accepted entry to webhook_attempts audit log", async () => {
    firestoreStore.current = {};
    const body = JSON.stringify(polarOrderPaidFixture);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: polarOrderPaidFixture,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);

    expect(res._state.status).toBe(200);
    const attempts = Object.entries(firestoreStore.current).filter(([k]) =>
      k.startsWith("webhook_attempts/")
    );
    expect(attempts.length).toBeGreaterThan(0);
    const [, record] = attempts[0];
    expect(record?.status).toBe("accepted");
    expect(record?.eventType).toBe("order.paid");
    expect(record?.polarOrderId).toBe(polarOrderPaidFixture.data.id);
    expect(record?.houseId).toBe(polarOrderPaidFixture.data.metadata.houseId);
  });

  it("webhook_attempts audit log also records rejection outcomes (signature mismatch)", async () => {
    firestoreStore.current = {};
    const body = JSON.stringify(polarOrderPaidFixture);
    const req = {
      method: "POST",
      header: (n: string) => {
        switch (n) {
          case "webhook-id": return "evt_test";
          case "webhook-timestamp": return Math.floor(Date.now() / 1000).toString();
          case "webhook-signature": return "v1,deadbeefnotavalidbase64sig=";
          default: return undefined;
        }
      },
      rawBody: Buffer.from(body),
      body: polarOrderPaidFixture,
    };
    const res = makeRes();
    await capturedHandlers.onPolarWebhook(req as never, res as never);

    expect(res._state.status).toBe(401);
    const attempts = Object.entries(firestoreStore.current).filter(([k]) =>
      k.startsWith("webhook_attempts/")
    );
    expect(attempts.length).toBeGreaterThan(0);
    const [, record] = attempts[0];
    expect(record?.status).toBe("rejected-signature");
  });

  // ── additional_house provisioning ────────────────────────────────
  //
  // Distinct from the pro path: the webhook doesn't write entitlement to
  // the *paying* house (that's already Pro) — it provisions a brand-new
  // house with the name from metadata.newHouseName, sets its entitlement
  // to Pro, and writes the polar_orders marker for idempotency.

  function additionalHousePayload(overrides: {
    id?: string;
    amount?: number;
    newHouseName?: string;
    payingHouseId?: string;
    uid?: string;
  } = {}) {
    return {
      type: "order.paid",
      data: {
        id: overrides.id ?? "ord_addl_1",
        amount: overrides.amount ?? 2900,
        currency: "EUR",
        metadata: {
          houseId: overrides.payingHouseId ?? "h_paying",
          uid: overrides.uid ?? "alice",
          product: "additional_house",
          newHouseName: overrides.newHouseName ?? "Lisbon apartment",
        },
        created_at: new Date().toISOString(),
      },
    };
  }

  async function postAdditionalHouseWebhook(payload: unknown, res = makeRes()) {
    const body = JSON.stringify(payload);
    const sig = signPayload(body, secret);
    const req = {
      method: "POST",
      header: (n: string) => sig[n as keyof typeof sig] ?? undefined,
      rawBody: Buffer.from(body),
      body: payload,
    };
    await capturedHandlers.onPolarWebhook(req as never, res as never);
    return res;
  }

  it("additional_house: provisions a brand-new house with name from metadata and tier=pro entitlement", async () => {
    // Seed the paying house so country/currency can be inherited.
    firestoreStore.current["houses/h_paying"] = {
      ownerId: "alice",
      country: "PT",
      currency: "EUR",
    };
    firestoreStore.current["users/alice"] = {
      displayName: "Alice",
      email: "alice@example.com",
    };

    const res = await postAdditionalHouseWebhook(additionalHousePayload());
    expect(res._state.status).toBe(200);

    // Find the provisioned house — it's any NEW houses/* doc other than the paying one.
    const houseDocs = Object.entries(firestoreStore.current).filter(
      ([k, v]) =>
        k.startsWith("houses/") &&
        k.split("/").length === 2 &&
        k !== "houses/h_paying" &&
        (v as { ownerId?: string })?.ownerId === "alice"
    );
    expect(houseDocs).toHaveLength(1);
    const [newHousePath, houseData] = houseDocs[0];
    const newHouseId = newHousePath.slice("houses/".length);

    expect(houseData).toMatchObject({
      name: "Lisbon apartment",
      ownerId: "alice",
      memberIds: ["alice"],
      country: "PT",
      currency: "EUR",
      createdFromPolarOrderId: "ord_addl_1",
    });

    // Member doc for the owner.
    const memberDoc = firestoreStore.current[
      `houses/${newHouseId}/members/alice`
    ] as Record<string, unknown> | undefined;
    expect(memberDoc?.role).toBe("owner");
    expect(memberDoc?.displayName).toBe("Alice");
    expect(memberDoc?.email).toBe("alice@example.com");

    // Entitlement on the NEW house, not the paying one.
    const newEnt = firestoreStore.current[
      `houses/${newHouseId}/meta/entitlement`
    ] as Record<string, unknown> | undefined;
    expect(newEnt?.tier).toBe("pro");
    expect(newEnt?.polarOrderId).toBe("ord_addl_1");
    expect(newEnt?.product).toBe("additional_house");
    expect(newEnt?.amount).toBe(2900);

    // Idempotency marker written.
    expect(
      firestoreStore.current["polar_orders/ord_addl_1"] as
        | Record<string, unknown>
        | undefined
    ).toMatchObject({
      houseId: newHouseId,
      uid: "alice",
      product: "additional_house",
    });

    // The paying house's entitlement is UNTOUCHED — critical, since a
    // misplaced write here would either leave a "purchased via additional"
    // fingerprint on the wrong house or (worse) overwrite the original
    // Pro purchase record.
    expect(firestoreStore.current["houses/h_paying/meta/entitlement"]).toBeUndefined();
  });

  it("additional_house: is idempotent — a replayed webhook for the same polarOrderId does not create a second house", async () => {
    firestoreStore.current["houses/h_paying"] = {
      ownerId: "alice",
      country: "PT",
      currency: "EUR",
    };
    firestoreStore.current["users/alice"] = {
      displayName: "Alice",
      email: "alice@example.com",
    };

    await postAdditionalHouseWebhook(additionalHousePayload({ id: "ord_replay" }));
    const afterFirst = Object.keys(firestoreStore.current).filter(
      (k) => k.startsWith("houses/") && k.split("/").length === 2
    );

    const res2 = await postAdditionalHouseWebhook(
      additionalHousePayload({ id: "ord_replay" })
    );
    expect(res2._state.status).toBe(200);
    expect(res2._state.body).toMatch(/Already processed/);

    const afterSecond = Object.keys(firestoreStore.current).filter(
      (k) => k.startsWith("houses/") && k.split("/").length === 2
    );
    // No new house doc got created on the retry.
    expect(afterSecond.length).toBe(afterFirst.length);
  });

  it("additional_house: rejects wrong amount (€49 sent for an additional_house purchase)", async () => {
    firestoreStore.current["houses/h_paying"] = { ownerId: "alice" };
    firestoreStore.current["users/alice"] = { displayName: "Alice", email: "a@x.com" };

    const res = await postAdditionalHouseWebhook(
      additionalHousePayload({ amount: 4900 }) // way outside €29's ±10% band
    );
    expect(res._state.status).toBe(400);
    // No house got provisioned despite a "successful" webhook payload.
    const houseDocs = Object.keys(firestoreStore.current).filter(
      (k) => k.startsWith("houses/") && k.split("/").length === 2
    );
    expect(houseDocs).toEqual(["houses/h_paying"]);
  });

  it("additional_house: provisions successfully even when paying house has no country/currency (writes house without those fields rather than throwing)", async () => {
    // Paying house doc lacks country/currency — possible for extremely
    // old pre-onboarding houses. The webhook must still provision rather
    // than bailing out with a type error. Missing fields are just absent
    // on the new house; user can set them via Settings.
    firestoreStore.current["houses/h_paying"] = { ownerId: "alice" };
    firestoreStore.current["users/alice"] = {
      displayName: "Alice",
      email: "a@x.com",
    };

    const res = await postAdditionalHouseWebhook(
      additionalHousePayload({ id: "ord_no_country" })
    );
    expect(res._state.status).toBe(200);

    const houseDocs = Object.entries(firestoreStore.current).filter(
      ([k]) =>
        k.startsWith("houses/") &&
        k.split("/").length === 2 &&
        k !== "houses/h_paying"
    );
    expect(houseDocs).toHaveLength(1);
    const [, houseData] = houseDocs[0];
    const house = houseData as Record<string, unknown>;
    // Core fields present; country/currency omitted (not null) — the UI
    // branches gracefully on absent fields so a null here would regress
    // mortgage/currency settings.
    expect(house.name).toBe("Lisbon apartment");
    expect(house.ownerId).toBe("alice");
    expect("country" in house).toBe(false);
    expect("currency" in house).toBe(false);
  });

  it("additional_house: falls back to 'You' when users/{uid} profile is missing (rare edge case)", async () => {
    firestoreStore.current["houses/h_paying"] = { ownerId: "alice", country: "PT", currency: "EUR" };
    // No users/alice profile doc.

    const res = await postAdditionalHouseWebhook(additionalHousePayload());
    expect(res._state.status).toBe(200);
    const memberDocs = Object.entries(firestoreStore.current).filter(
      ([k]) => k.endsWith("/members/alice") && !k.startsWith("houses/h_paying")
    );
    expect(memberDocs).toHaveLength(1);
    const [, member] = memberDocs[0];
    expect((member as Record<string, unknown>).displayName).toBe("You");
  });

  it("additional_house: ignores (200-acks) a webhook that's missing newHouseName metadata", async () => {
    // Simulate a pre-migration checkout or a malformed payload — we don't
    // want Polar to keep retrying, and we don't want to silently create a
    // nameless house either.
    firestoreStore.current["houses/h_paying"] = { ownerId: "alice" };
    const payload = {
      type: "order.paid",
      data: {
        id: "ord_nameless",
        amount: 2900,
        currency: "EUR",
        metadata: {
          houseId: "h_paying",
          uid: "alice",
          product: "additional_house",
          // newHouseName intentionally absent
        },
      },
    };
    const res = await postAdditionalHouseWebhook(payload);
    expect(res._state.status).toBe(200);
    expect(res._state.body).toMatch(/Ignored/i);
    const houseDocs = Object.keys(firestoreStore.current).filter(
      (k) => k.startsWith("houses/") && k.split("/").length === 2
    );
    expect(houseDocs).toEqual(["houses/h_paying"]);
  });

  it("additional_house: webhook_attempts record carries the PROVISIONED houseId (so support can trace 'where did my second house go?')", async () => {
    firestoreStore.current["houses/h_paying"] = { ownerId: "alice", country: "PT", currency: "EUR" };
    firestoreStore.current["users/alice"] = { displayName: "Alice", email: "a@x.com" };

    await postAdditionalHouseWebhook(additionalHousePayload({ id: "ord_audit" }));
    const attempts = Object.entries(firestoreStore.current).filter(([k]) =>
      k.startsWith("webhook_attempts/")
    );
    expect(attempts.length).toBeGreaterThan(0);
    const accepted = attempts
      .map(([, v]) => v as Record<string, unknown>)
      .find((v) => v.status === "accepted");
    expect(accepted).toBeDefined();
    // HouseId on the audit record is the NEW house, not the paying one.
    expect(accepted?.houseId).not.toBe("h_paying");
    expect(typeof accepted?.houseId).toBe("string");
  });
});

// ── Polar signing scheme parity (regression guard) ───────────────────
//
// Polar's actual signing scheme (per @polar-sh/sdk/webhooks.js) is NOT
// Standard-Webhooks-with-a-different-prefix. Instead, Polar takes the entire
// secret string (including the `polar_whs_` prefix), base64-encodes its UTF-8
// bytes, and feeds THAT to the Svix library. So the HMAC key is the UTF-8
// bytes of the full branded secret.
//
// This test pins that invariant: what we verify in production (via the Polar
// SDK's `validateEvent`) must match what test `signPayload()` / `polarSign()`
// produce — otherwise a test that "passes" here would still break against
// real Polar signatures in production.

describe("Polar signing scheme parity", () => {
  it("signatures produced with Polar's base64-of-utf8(secret) scheme verify when run through the same scheme on the receiving side", () => {
    const secret = "polar_whs_deterministic_test_secret_12345";
    const id = "evt_test";
    const timestampSec = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ type: "order.paid", data: { id: "o1" } });

    const signature = polarSign(id, new Date(Number(timestampSec) * 1000), body, secret);

    // Use the same base64-of-utf8 encoding on the verification side — this is
    // what production does in verifyPolarWebhook. If either side changes, the
    // round-trip breaks here before it breaks against real Polar signatures.
    const base64Secret = Buffer.from(secret, "utf-8").toString("base64");
    const wh = new Webhook(base64Secret);
    expect(() =>
      wh.verify(body, {
        "webhook-id": id,
        "webhook-timestamp": timestampSec,
        "webhook-signature": signature,
      })
    ).not.toThrow();
  });
});


// ── createCheckoutSession tests ──────────────────────────────────────

describe("createCheckoutSession", () => {
  beforeEach(() => {
    firestoreStore.current = {
      "houses/h1/members/alice": { role: "owner" },
      "houses/h1": { ownerId: "alice" },
    };
    // Mock fetch for the Polar API call.
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ url: "https://polar.example/checkout/xyz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as never;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws unauthenticated when called without auth", async () => {
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: null,
        data: { houseId: "h1", product: "pro" },
      })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects missing houseId / product with invalid-argument", async () => {
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: { uid: "alice", token: { email: "a@t.com" } },
        data: {},
      })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects users who are not a member of the house", async () => {
    // Outsider trying to buy Pro for someone else's house
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: { uid: "outsider", token: { email: "o@t.com" } },
        data: { houseId: "h1", product: "pro" },
      })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects non-owners trying to buy Pro for a house (only the owner can upgrade)", async () => {
    firestoreStore.current["houses/h1/members/bob"] = { role: "member" };
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: { uid: "bob", token: { email: "b@t.com" } },
        data: { houseId: "h1", product: "pro" },
      })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("returns the Polar checkout URL for the owner on the happy path", async () => {
    const result = await capturedHandlers.createCheckoutSession({
      auth: { uid: "alice", token: { email: "a@t.com" } },
      data: { houseId: "h1", product: "pro" },
    });
    expect(result).toEqual({ url: "https://polar.example/checkout/xyz" });
  });

  it("surfaces internal when Polar returns a non-2xx", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("Polar rate limit", { status: 429 })
    ) as never;
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: { uid: "alice", token: { email: "a@t.com" } },
        data: { houseId: "h1", product: "pro" },
      })
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("surfaces internal when Polar returns no url in the payload", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ wrong: "shape" }), { status: 200 })
    ) as never;
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: { uid: "alice", token: { email: "a@t.com" } },
        data: { houseId: "h1", product: "pro" },
      })
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("members (not owner) can still buy an additional_house for themselves", async () => {
    firestoreStore.current["houses/h1/members/bob"] = { role: "member" };
    const result = await capturedHandlers.createCheckoutSession({
      auth: { uid: "bob", token: { email: "b@t.com" } },
      data: {
        houseId: "h1",
        product: "additional_house",
        newHouseName: "Bob's second house",
      },
    });
    expect(result).toEqual({ url: "https://polar.example/checkout/xyz" });
  });

  it("rejects additional_house without a newHouseName (webhook would have nothing to provision)", async () => {
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: { uid: "alice", token: { email: "a@t.com" } },
        data: { houseId: "h1", product: "additional_house" },
      })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects additional_house when the newHouseName is only whitespace", async () => {
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: { uid: "alice", token: { email: "a@t.com" } },
        data: {
          houseId: "h1",
          product: "additional_house",
          newHouseName: "   ",
        },
      })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects Pro purchase when the house is already Pro (prevents double-pay — audit fix #11)", async () => {
    firestoreStore.current["houses/h1/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_existing",
    };
    await expect(
      capturedHandlers.createCheckoutSession({
        auth: { uid: "alice", token: { email: "a@t.com" } },
        data: { houseId: "h1", product: "pro" },
      })
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("allows additional_house purchase even when the paying house is already Pro (that's the whole point)", async () => {
    firestoreStore.current["houses/h1/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_existing",
    };
    const result = await capturedHandlers.createCheckoutSession({
      auth: { uid: "alice", token: { email: "a@t.com" } },
      data: {
        houseId: "h1",
        product: "additional_house",
        newHouseName: "Second home",
      },
    });
    expect(result).toEqual({ url: "https://polar.example/checkout/xyz" });
  });

  // ── Metadata forwarding to Polar (wire-level contract) ────────────
  //
  // The webhook reads `metadata.newHouseName` to name the provisioned
  // house. If the checkout endpoint doesn't actually forward the name to
  // Polar, the webhook has nothing to work with — and that failure only
  // surfaces in production. These two tests pin the contract.

  it("forwards newHouseName to Polar checkout metadata for additional_house (trimmed + capped at 80 chars)", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ url: "https://polar.example/checkout/xyz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const longName = "   " + "A".repeat(120) + "   ";
    await capturedHandlers.createCheckoutSession({
      auth: { uid: "alice", token: { email: "a@t.com" } },
      data: {
        houseId: "h1",
        product: "additional_house",
        newHouseName: longName,
      },
    });

    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      { body: string; method: string },
    ];
    const body = JSON.parse(init.body) as { metadata: Record<string, string> };
    // Exactly 80 A's — trim + slice, no whitespace leak, no trailing dots.
    expect(body.metadata.newHouseName).toBe("A".repeat(80));
    expect(body.metadata.product).toBe("additional_house");
    expect(body.metadata.uid).toBe("alice");
  });

  it("does NOT include newHouseName in Polar metadata for product=pro (even if caller tries to leak it)", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ url: "https://polar.example/checkout/xyz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await capturedHandlers.createCheckoutSession({
      auth: { uid: "alice", token: { email: "a@t.com" } },
      data: {
        houseId: "h1",
        product: "pro",
        // Malicious/buggy caller passes newHouseName for a pro product.
        // The endpoint must not forward it — otherwise the webhook would
        // wrongly provision a second house on top of the pro upgrade.
        newHouseName: "Not a real additional house",
      },
    });

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(init.body) as { metadata: Record<string, string> };
    expect(body.metadata.product).toBe("pro");
    expect("newHouseName" in body.metadata).toBe(false);
  });
});

// ── grandfatherExistingHouses tests ──────────────────────────────────

describe("grandfatherExistingHouses", () => {
  beforeEach(() => {
    firestoreStore.current = {};
    process.env.CASATAB_ADMIN_UIDS = "admin1,admin2";
  });

  it("denies non-admin callers", async () => {
    await expect(
      capturedHandlers.grandfatherExistingHouses({
        auth: { uid: "random", token: {} },
      })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("denies unauthenticated callers", async () => {
    await expect(
      capturedHandlers.grandfatherExistingHouses({ auth: null })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("skips soft-deleted houses", async () => {
    firestoreStore.current["houses/hA"] = { ownerId: "x", deletedAt: "2026-01-01" };
    firestoreStore.current["houses/hB"] = { ownerId: "y" };
    const result = await capturedHandlers.grandfatherExistingHouses({
      auth: { uid: "admin1", token: {} },
    });
    expect(result).toMatchObject({ updated: 1, skipped: 1 });
    expect(firestoreStore.current["houses/hA/meta/entitlement"]).toBeUndefined();
    expect(firestoreStore.current["houses/hB/meta/entitlement"]).toBeDefined();
  });

  it("skips houses that already have an entitlement (no overwrites)", async () => {
    firestoreStore.current["houses/hA"] = { ownerId: "x" };
    firestoreStore.current["houses/hA/meta/entitlement"] = {
      tier: "pro",
      polarOrderId: "ord_paid",
    };
    const result = await capturedHandlers.grandfatherExistingHouses({
      auth: { uid: "admin1", token: {} },
    });
    expect(result).toMatchObject({ updated: 0, skipped: 1 });
    // Existing entitlement unchanged
    expect(firestoreStore.current["houses/hA/meta/entitlement"]).toEqual({
      tier: "pro",
      polarOrderId: "ord_paid",
    });
  });

  it("writes tier=pro + grandfathered=true for eligible houses", async () => {
    firestoreStore.current["houses/hA"] = { ownerId: "x" };
    firestoreStore.current["houses/hB"] = { ownerId: "y" };
    await capturedHandlers.grandfatherExistingHouses({
      auth: { uid: "admin1", token: {} },
    });
    for (const id of ["hA", "hB"]) {
      const ent = firestoreStore.current[`houses/${id}/meta/entitlement`];
      expect(ent?.tier).toBe("pro");
      expect(ent?.grandfathered).toBe(true);
    }
  });

  it("writes a system run-marker every invocation (audit trail for admins — fix #13)", async () => {
    firestoreStore.current["houses/hA"] = { ownerId: "x" };
    await capturedHandlers.grandfatherExistingHouses({
      auth: { uid: "admin1", token: {} },
    });
    const marker = firestoreStore.current["system/grandfather-run"] as
      | { lastRun: string; lastRunBy: string; lastRunUpdated: number; runs: unknown[] }
      | undefined;
    expect(marker).toBeDefined();
    expect(marker?.lastRunBy).toBe("admin1");
    expect(marker?.lastRunUpdated).toBe(1);
    expect(Array.isArray(marker?.runs)).toBe(true);
    expect(marker?.runs.length).toBe(1);
  });

  it("appends to the runs log on re-runs (keeps the last 10 runs)", async () => {
    firestoreStore.current["houses/hA"] = { ownerId: "x" };
    await capturedHandlers.grandfatherExistingHouses({
      auth: { uid: "admin1", token: {} },
    });
    await capturedHandlers.grandfatherExistingHouses({
      auth: { uid: "admin2", token: {} },
    });
    const marker = firestoreStore.current["system/grandfather-run"] as
      | { runs: Array<{ by: string }> }
      | undefined;
    expect(marker?.runs.length).toBe(2);
    expect(marker?.runs[0].by).toBe("admin1");
    expect(marker?.runs[1].by).toBe("admin2");
  });
});

// ── reconcileOrder tests ─────────────────────────────────────────────
//
// `reconcileOrder` is the self-service "I paid but don't see Pro" path.
// It calls Polar's orders list API filtered by houseId metadata, and if a
// paid matching order exists, writes the entitlement. These tests verify the
// happy path, the idempotent/already-pro path, the no-match path, and the
// security/amount-validation guards.

describe("reconcileOrder", () => {
  beforeEach(() => {
    firestoreStore.current = {};
    globalThis.fetch = originalFetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects unauthenticated callers", async () => {
    await expect(
      capturedHandlers.reconcileOrder({ auth: null, data: { houseId: "h1" } })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("requires a houseId", async () => {
    await expect(
      capturedHandlers.reconcileOrder({
        auth: { uid: "alice", token: {} },
        data: {},
      })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects callers who are not members of the house", async () => {
    await expect(
      capturedHandlers.reconcileOrder({
        auth: { uid: "eve", token: {} },
        data: { houseId: "h1" },
      })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("returns already-pro without calling Polar when the house is already Pro", async () => {
    firestoreStore.current["houses/h1/members/alice"] = { role: "owner" };
    firestoreStore.current["houses/h1/meta/entitlement"] = { tier: "pro" };
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { houseId: "h1" },
    });
    // already-pro now echoes the houseId so ThanksPage can deep-link into
    // the correct house even when the reconcile is a no-op.
    expect(result).toEqual({ status: "already-pro", houseId: "h1" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes the entitlement and returns reconciled when Polar has a paid matching order", async () => {
    firestoreStore.current["houses/h1/members/alice"] = { role: "owner" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_abc",
            status: "paid",
            paid: true,
            total_amount: 4900,
            currency: "eur",
            created_at: "2026-04-20T10:00:00Z",
            metadata: { houseId: "h1", uid: "alice", product: "pro" },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { houseId: "h1" },
    });
    expect(result).toEqual({
      status: "reconciled",
      polarOrderId: "ord_abc",
      houseId: "h1",
    });

    const ent = firestoreStore.current["houses/h1/meta/entitlement"];
    expect(ent?.tier).toBe("pro");
    expect(ent?.polarOrderId).toBe("ord_abc");
    expect(ent?.reconciled).toBe(true);
    expect(ent?.amount).toBe(4900);
  });

  it("ignores orders whose metadata houseId does not match the requested house", async () => {
    firestoreStore.current["houses/h1/members/alice"] = { role: "owner" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_other",
            status: "paid",
            paid: true,
            total_amount: 4900,
            currency: "eur",
            metadata: { houseId: "someone-else", uid: "x", product: "pro" },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { houseId: "h1" },
    });
    expect(result).toEqual({ status: "no-order" });
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toBeUndefined();
  });

  it("ignores unpaid orders even if houseId metadata matches", async () => {
    firestoreStore.current["houses/h1/members/alice"] = { role: "owner" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_pending",
            status: "pending",
            paid: false,
            total_amount: 4900,
            currency: "eur",
            metadata: { houseId: "h1", uid: "alice", product: "pro" },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { houseId: "h1" },
    });
    expect(result).toEqual({ status: "no-order" });
  });

  it("rejects reconcile if the order amount does not match the product's expected price", async () => {
    firestoreStore.current["houses/h1/members/alice"] = { role: "owner" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_wrong",
            status: "paid",
            paid: true,
            total_amount: 100, // €1 — way off for a 'pro' product (expected ~€49)
            currency: "eur",
            metadata: { houseId: "h1", uid: "alice", product: "pro" },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    await expect(
      capturedHandlers.reconcileOrder({
        auth: { uid: "alice", token: {} },
        data: { houseId: "h1" },
      })
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(firestoreStore.current["houses/h1/meta/entitlement"]).toBeUndefined();
  });

  it("throws internal if Polar's orders API fails", async () => {
    firestoreStore.current["houses/h1/members/alice"] = { role: "owner" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Polar is down",
    }) as unknown as typeof fetch;

    await expect(
      capturedHandlers.reconcileOrder({
        auth: { uid: "alice", token: {} },
        data: { houseId: "h1" },
      })
    ).rejects.toMatchObject({ code: "internal" });
  });

  // ── mode='additional_house' ──────────────────────────────────────
  //
  // /thanks calls this without a houseId: the caller is the authenticated
  // user, and Polar is filtered by metadata.uid so another user's paid
  // orders can never surface. On success we return the new houseId for
  // the client to switch into.

  it("mode=additional_house: provisions the missing house and returns its id (webhook never fired)", async () => {
    firestoreStore.current["houses/h_paying"] = {
      ownerId: "alice",
      country: "PT",
      currency: "EUR",
    };
    firestoreStore.current["users/alice"] = { displayName: "Alice", email: "a@x.com" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_recon",
            status: "paid",
            paid: true,
            total_amount: 2900,
            currency: "eur",
            created_at: "2026-04-21T10:00:00Z",
            metadata: {
              houseId: "h_paying",
              uid: "alice",
              product: "additional_house",
              newHouseName: "Beach house",
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = (await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { mode: "additional_house" },
    })) as { status: string; polarOrderId?: string; houseId?: string };

    expect(result.status).toBe("reconciled");
    expect(result.polarOrderId).toBe("ord_recon");
    expect(typeof result.houseId).toBe("string");
    expect(result.houseId).not.toBe("h_paying");

    // Verify the house actually exists with the correct name + pro entitlement.
    const house = firestoreStore.current[`houses/${result.houseId}`] as
      | Record<string, unknown>
      | undefined;
    expect(house?.name).toBe("Beach house");
    const ent = firestoreStore.current[`houses/${result.houseId}/meta/entitlement`] as
      | Record<string, unknown>
      | undefined;
    expect(ent?.tier).toBe("pro");
  });

  it("mode=additional_house: returns already-pro with houseId when the webhook already provisioned (idempotent via polar_orders marker)", async () => {
    // Pre-seed the polar_orders marker as if the webhook ran first.
    firestoreStore.current["polar_orders/ord_first"] = {
      houseId: "h_existing_new",
      uid: "alice",
      product: "additional_house",
    };
    firestoreStore.current["houses/h_paying"] = {
      ownerId: "alice",
      country: "PT",
      currency: "EUR",
    };
    firestoreStore.current["users/alice"] = { displayName: "Alice", email: "a@x.com" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_first",
            status: "paid",
            paid: true,
            total_amount: 2900,
            currency: "eur",
            metadata: {
              houseId: "h_paying",
              uid: "alice",
              product: "additional_house",
              newHouseName: "Already provisioned",
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { mode: "additional_house" },
    });

    // already-pro echoes the EXISTING house from the marker; no duplicate
    // house is created.
    expect(result).toEqual({
      status: "already-pro",
      polarOrderId: "ord_first",
      houseId: "h_existing_new",
    });
  });

  it("mode=additional_house: returns no-order when Polar has no matching paid order (fresh checkout race)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch;

    const result = await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { mode: "additional_house" },
    });
    expect(result).toEqual({ status: "no-order" });
  });

  it("mode=additional_house: rejects wrong-amount orders (€49 sent for a €29 additional_house)", async () => {
    firestoreStore.current["houses/h_paying"] = { ownerId: "alice" };
    firestoreStore.current["users/alice"] = { displayName: "Alice", email: "a@x.com" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_badamount",
            status: "paid",
            paid: true,
            total_amount: 4900, // way off for €29
            currency: "eur",
            metadata: {
              houseId: "h_paying",
              uid: "alice",
              product: "additional_house",
              newHouseName: "Should not provision",
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    await expect(
      capturedHandlers.reconcileOrder({
        auth: { uid: "alice", token: {} },
        data: { mode: "additional_house" },
      })
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("mode=additional_house: Polar orders API 500 → internal error (matches pro-mode behaviour)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Polar is down",
    }) as unknown as typeof fetch;

    await expect(
      capturedHandlers.reconcileOrder({
        auth: { uid: "alice", token: {} },
        data: { mode: "additional_house" },
      })
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("mode=additional_house: matching order with missing newHouseName metadata → no-order (can't provision without it)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_pre_migration",
            status: "paid",
            paid: true,
            total_amount: 2900,
            currency: "eur",
            metadata: {
              houseId: "h_paying",
              uid: "alice",
              product: "additional_house",
              // newHouseName deliberately absent (pre-migration checkout)
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = (await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { mode: "additional_house" },
    })) as { status: string };
    // Can't auto-recover — no name to assign. /thanks falls through to
    // the contact-us flow, which is the right UX.
    expect(result.status).toBe("no-order");
    // Nothing provisioned either.
    const houseDocs = Object.keys(firestoreStore.current).filter(
      (k) => k.startsWith("houses/") && k.split("/").length === 2
    );
    expect(houseDocs).toEqual([]);
  });

  it("mode=additional_house: matching order with missing paying houseId metadata → no-order (can't inherit country/currency)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "ord_missing_paying",
            status: "paid",
            paid: true,
            total_amount: 2900,
            currency: "eur",
            metadata: {
              // houseId missing
              uid: "alice",
              product: "additional_house",
              newHouseName: "Orphan house",
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = (await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { mode: "additional_house" },
    })) as { status: string };
    expect(result.status).toBe("no-order");
  });

  it("mode=additional_house: does NOT require a houseId (important — /thanks has no houseId to pass)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch;

    // No data.houseId, no error. The 'pro' mode guards require one; this
    // mode explicitly does not.
    const result = (await capturedHandlers.reconcileOrder({
      auth: { uid: "alice", token: {} },
      data: { mode: "additional_house" },
    })) as { status: string };
    expect(result.status).toBe("no-order");
  });
});

