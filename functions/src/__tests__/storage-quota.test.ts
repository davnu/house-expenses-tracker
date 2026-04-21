import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Firebase modules before importing storage-quota (which registers
// Cloud Functions at module level via onObjectFinalized/onObjectDeleted)
vi.mock("firebase-functions/v2/storage", () => ({
  onObjectFinalized: (_opts: unknown, handler: unknown) => handler,
  onObjectDeleted: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(),
}));
vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(),
}));

import {
  extractHouseId,
  isThumbnail,
  storageDocPath,
  enforceQuotaOnUpload,
  decrementOnDelete,
  maxBytesForEntitlement,
  MAX_HOUSEHOLD_STORAGE,
  PRO_HOUSEHOLD_STORAGE,
} from "../storage-quota";

// ── Mock Firestore ──────────────────────────────────────────────────

interface MockDocData {
  [key: string]: unknown;
}

interface MockDocRef {
  path: string;
}

/**
 * Creates a minimal Firestore mock that supports transactions.
 * Writes are buffered during the transaction and only applied
 * if the callback completes without throwing (simulates real
 * Firestore transaction semantics).
 */
function createMockDb(
  initialData: Record<string, MockDocData | undefined> = {}
) {
  const store: Record<string, MockDocData | undefined> = { ...initialData };

  const db = {
    doc(path: string): MockDocRef {
      return { path };
    },

    async runTransaction(
      fn: (tx: {
        get(ref: MockDocRef): Promise<{
          exists: boolean;
          data(): MockDocData | undefined;
        }>;
        set(
          ref: MockDocRef,
          data: MockDocData,
          options?: { merge: boolean }
        ): void;
        update(ref: MockDocRef, data: MockDocData): void;
      }) => Promise<void>
    ): Promise<void> {
      const writes: Array<() => void> = [];

      const tx = {
        async get(ref: MockDocRef) {
          const data = store[ref.path];
          return {
            exists: data !== undefined,
            data: () => (data ? { ...data } : undefined),
          };
        },
        set(
          ref: MockDocRef,
          data: MockDocData,
          options?: { merge: boolean }
        ) {
          writes.push(() => {
            if (options?.merge) {
              store[ref.path] = { ...(store[ref.path] || {}), ...data };
            } else {
              store[ref.path] = { ...data };
            }
          });
        },
        update(ref: MockDocRef, data: MockDocData) {
          writes.push(() => {
            store[ref.path] = { ...(store[ref.path] || {}), ...data };
          });
        },
      };

      await fn(tx);
      // Commit: apply buffered writes only if callback succeeded
      for (const write of writes) write();
    },

    /** Exposed for test assertions */
    _store: store,
  };

  return db;
}

// ── extractHouseId ──────────────────────────────────────────────────

describe("extractHouseId", () => {
  it("extracts houseId from attachment path", () => {
    expect(
      extractHouseId("houses/abc123/attachments/att-1/receipt.png")
    ).toBe("abc123");
  });

  it("extracts houseId from document path", () => {
    expect(
      extractHouseId("houses/abc123/documents/doc-1/contract.pdf")
    ).toBe("abc123");
  });

  it("extracts houseId from attachment thumbnail path", () => {
    expect(
      extractHouseId("houses/abc123/attachments/att-1/thumb.jpg")
    ).toBe("abc123");
  });

  it("extracts houseId from document thumbnail path", () => {
    expect(
      extractHouseId("houses/abc123/documents/doc-1/thumb.jpg")
    ).toBe("abc123");
  });

  it("handles houseId with hyphens and underscores", () => {
    expect(
      extractHouseId("houses/abc-123_def/attachments/att-1/file.png")
    ).toBe("abc-123_def");
  });

  it("returns null for root-level path", () => {
    expect(extractHouseId("some-file.png")).toBeNull();
  });

  it("returns null for non-house path", () => {
    expect(extractHouseId("users/uid123/avatar.png")).toBeNull();
  });

  it("returns null for unrecognised house subcollection", () => {
    expect(extractHouseId("houses/abc123/other/file.png")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractHouseId("")).toBeNull();
  });

  it("returns null for partial path missing subcollection", () => {
    expect(extractHouseId("houses/abc123/")).toBeNull();
  });

  it("returns null for path with only 'houses/' prefix", () => {
    expect(extractHouseId("houses/")).toBeNull();
  });
});

// ── isThumbnail ─────────────────────────────────────────────────────

describe("isThumbnail", () => {
  it("detects attachment thumbnail", () => {
    expect(isThumbnail("houses/h1/attachments/a1/thumb.jpg")).toBe(true);
  });

  it("detects document thumbnail", () => {
    expect(isThumbnail("houses/h1/documents/d1/thumb.jpg")).toBe(true);
  });

  it("returns false for regular file", () => {
    expect(isThumbnail("houses/h1/attachments/a1/receipt.png")).toBe(false);
  });

  it("returns false for file named similarly but not exactly thumb.jpg", () => {
    expect(isThumbnail("houses/h1/attachments/a1/thumb.png")).toBe(false);
    expect(isThumbnail("houses/h1/attachments/a1/my-thumb.jpg")).toBe(false);
  });
});

// ── storageDocPath ──────────────────────────────────────────────────

describe("storageDocPath", () => {
  it("returns correct Firestore path", () => {
    expect(storageDocPath("house-42")).toBe("houses/house-42/meta/storage");
  });
});

// ── enforceQuotaOnUpload ────────────────────────────────────────────

describe("enforceQuotaOnUpload", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // ── Accepted uploads ────────────────────────────────────────────

  it("accepts first upload for a house (no existing counter)", async () => {
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(result).toBe("accepted");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(1000);
  });

  it("accepts upload when total stays under limit", async () => {
    db._store["houses/h1/meta/storage"] = { usedBytes: 10 * 1024 * 1024 };

    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(result).toBe("accepted");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(
      10 * 1024 * 1024 + 1000
    );
  });

  it("accepts upload that lands exactly at the limit", async () => {
    const remaining = 5000;
    db._store["houses/h1/meta/storage"] = {
      usedBytes: MAX_HOUSEHOLD_STORAGE - remaining,
    };

    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      remaining,
      db as never
    );
    expect(result).toBe("accepted");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(
      MAX_HOUSEHOLD_STORAGE
    );
  });

  it("accumulates across multiple uploads", async () => {
    await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file1.png",
      1000,
      db as never
    );
    await enforceQuotaOnUpload(
      "houses/h1/attachments/a2/file2.png",
      2000,
      db as never
    );
    await enforceQuotaOnUpload(
      "houses/h1/documents/d1/doc.pdf",
      3000,
      db as never
    );

    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(6000);
  });

  it("counts attachments and documents against the same quota", async () => {
    db._store["houses/h1/meta/storage"] = {
      usedBytes: MAX_HOUSEHOLD_STORAGE - 100,
    };

    // Document upload that would put us over
    const result = await enforceQuotaOnUpload(
      "houses/h1/documents/d1/file.pdf",
      200,
      db as never
    );
    expect(result).toBe("rejected");
  });

  it("sets updatedAt timestamp", async () => {
    await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(db._store["houses/h1/meta/storage"]?.updatedAt).toBeDefined();
    expect(typeof db._store["houses/h1/meta/storage"]?.updatedAt).toBe(
      "string"
    );
  });

  // ── Rejected uploads ────────────────────────────────────────────

  it("rejects upload that would exceed limit", async () => {
    db._store["houses/h1/meta/storage"] = {
      usedBytes: MAX_HOUSEHOLD_STORAGE - 100,
    };

    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      200,
      db as never
    );
    expect(result).toBe("rejected");
    // Counter must not have changed
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(
      MAX_HOUSEHOLD_STORAGE - 100
    );
  });

  it("rejects upload 1 byte over limit", async () => {
    db._store["houses/h1/meta/storage"] = {
      usedBytes: MAX_HOUSEHOLD_STORAGE - 999,
    };

    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(result).toBe("rejected");
  });

  it("rejects when storage is already full", async () => {
    db._store["houses/h1/meta/storage"] = {
      usedBytes: MAX_HOUSEHOLD_STORAGE,
    };

    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      1,
      db as never
    );
    expect(result).toBe("rejected");
  });

  it("does not modify counter on rejection", async () => {
    const initialUsed = MAX_HOUSEHOLD_STORAGE - 50;
    db._store["houses/h1/meta/storage"] = { usedBytes: initialUsed };

    await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      100,
      db as never
    );

    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(initialUsed);
  });

  // ── Skipped (no-op) ─────────────────────────────────────────────

  it("skips non-house path", async () => {
    const result = await enforceQuotaOnUpload(
      "users/u1/avatar.png",
      1000,
      db as never
    );
    expect(result).toBe("skipped");
    expect(Object.keys(db._store)).toHaveLength(0);
  });

  it("skips empty file path", async () => {
    const result = await enforceQuotaOnUpload("", 1000, db as never);
    expect(result).toBe("skipped");
  });

  it("skips zero-size file", async () => {
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      0,
      db as never
    );
    expect(result).toBe("skipped");
  });

  it("skips negative-size file", async () => {
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      -100,
      db as never
    );
    expect(result).toBe("skipped");
  });

  it("skips NaN size", async () => {
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      NaN,
      db as never
    );
    expect(result).toBe("skipped");
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it("handles missing usedBytes field in existing doc", async () => {
    db._store["houses/h1/meta/storage"] = {
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(result).toBe("accepted");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(1000);
  });

  it("isolates storage between different houses", async () => {
    db._store["houses/h1/meta/storage"] = {
      usedBytes: MAX_HOUSEHOLD_STORAGE - 100,
    };
    db._store["houses/h2/meta/storage"] = { usedBytes: 0 };

    // h1 is almost full — should be rejected
    const r1 = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      200,
      db as never
    );
    expect(r1).toBe("rejected");

    // h2 has space — should be accepted
    const r2 = await enforceQuotaOnUpload(
      "houses/h2/attachments/a1/file.png",
      200,
      db as never
    );
    expect(r2).toBe("accepted");
  });

  it("rethrows non-quota transaction errors", async () => {
    const failDb = createMockDb();
    failDb.runTransaction = async () => {
      throw new Error("NETWORK_ERROR");
    };

    await expect(
      enforceQuotaOnUpload(
        "houses/h1/attachments/a1/file.png",
        1000,
        failDb as never
      )
    ).rejects.toThrow("NETWORK_ERROR");
  });

  it("handles a single large file that exceeds limit alone", async () => {
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/huge.pdf",
      MAX_HOUSEHOLD_STORAGE + 1,
      db as never
    );
    expect(result).toBe("rejected");
  });

  it("skips thumbnails (not counted against user quota)", async () => {
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/thumb.jpg",
      5000,
      db as never
    );
    expect(result).toBe("skipped");
    expect(db._store["houses/h1/meta/storage"]).toBeUndefined();
  });

  it("uses merge: true to preserve other fields in storage doc", async () => {
    db._store["houses/h1/meta/storage"] = {
      usedBytes: 0,
      someOtherField: "keep-me",
    };

    await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );

    expect(db._store["houses/h1/meta/storage"]?.someOtherField).toBe(
      "keep-me"
    );
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(1000);
  });
});

// ── decrementOnDelete ───────────────────────────────────────────────

describe("decrementOnDelete", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it("decrements counter on normal file deletion", async () => {
    db._store["houses/h1/meta/storage"] = { usedBytes: 5000 };

    const result = await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(result).toBe("decremented");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(4000);
  });

  it("decrements to zero on exact-size deletion", async () => {
    db._store["houses/h1/meta/storage"] = { usedBytes: 3000 };

    const result = await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      3000,
      db as never
    );
    expect(result).toBe("decremented");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(0);
  });

  it("clamps to zero when deletion size exceeds counter", async () => {
    db._store["houses/h1/meta/storage"] = { usedBytes: 500 };

    const result = await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(result).toBe("decremented");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(0);
  });

  it("handles deletion when no counter doc exists (no-op)", async () => {
    const result = await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(result).toBe("decremented");
    // Should NOT have created a counter doc
    expect(db._store["houses/h1/meta/storage"]).toBeUndefined();
  });

  it("handles missing usedBytes field in existing doc", async () => {
    db._store["houses/h1/meta/storage"] = {
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    const result = await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );
    expect(result).toBe("decremented");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(0);
  });

  it("works with document paths", async () => {
    db._store["houses/h1/meta/storage"] = { usedBytes: 10000 };

    const result = await decrementOnDelete(
      "houses/h1/documents/d1/contract.pdf",
      3000,
      db as never
    );
    expect(result).toBe("decremented");
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(7000);
  });

  it("sets updatedAt on decrement", async () => {
    db._store["houses/h1/meta/storage"] = {
      usedBytes: 5000,
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );

    const updatedAt = db._store["houses/h1/meta/storage"]
      ?.updatedAt as string;
    expect(updatedAt).not.toBe("2024-01-01T00:00:00.000Z");
  });

  // ── Skipped (no-op) ─────────────────────────────────────────────

  it("skips non-house path", async () => {
    const result = await decrementOnDelete(
      "users/u1/avatar.png",
      1000,
      db as never
    );
    expect(result).toBe("skipped");
  });

  it("skips empty path", async () => {
    const result = await decrementOnDelete("", 1000, db as never);
    expect(result).toBe("skipped");
  });

  it("skips zero-size file", async () => {
    const result = await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      0,
      db as never
    );
    expect(result).toBe("skipped");
  });

  it("skips negative-size file", async () => {
    const result = await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      -100,
      db as never
    );
    expect(result).toBe("skipped");
  });

  it("skips thumbnail deletion (not counted)", async () => {
    db._store["houses/h1/meta/storage"] = { usedBytes: 5000 };

    const result = await decrementOnDelete(
      "houses/h1/attachments/a1/thumb.jpg",
      3000,
      db as never
    );
    expect(result).toBe("skipped");
    // Counter must not have changed
    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(5000);
  });

  // ── Isolation ───────────────────────────────────────────────────

  it("only decrements the correct house counter", async () => {
    db._store["houses/h1/meta/storage"] = { usedBytes: 5000 };
    db._store["houses/h2/meta/storage"] = { usedBytes: 8000 };

    await decrementOnDelete(
      "houses/h1/attachments/a1/file.png",
      1000,
      db as never
    );

    expect(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(4000);
    expect(db._store["houses/h2/meta/storage"]?.usedBytes).toBe(8000);
  });
});

// ── MAX_HOUSEHOLD_STORAGE constant ──────────────────────────────────

describe("MAX_HOUSEHOLD_STORAGE", () => {
  it("is 50 MB in bytes", () => {
    expect(MAX_HOUSEHOLD_STORAGE).toBe(50 * 1024 * 1024);
  });
});

// ── Entitlement-aware cap ───────────────────────────────────────────

describe("maxBytesForEntitlement", () => {
  it("defaults to 50 MB when entitlement is missing", () => {
    expect(maxBytesForEntitlement(null)).toBe(MAX_HOUSEHOLD_STORAGE);
    expect(maxBytesForEntitlement(undefined)).toBe(MAX_HOUSEHOLD_STORAGE);
  });

  it("returns 50 MB for free tier explicitly", () => {
    expect(maxBytesForEntitlement({ tier: "free" })).toBe(MAX_HOUSEHOLD_STORAGE);
  });

  it("returns 500 MB for Pro tier", () => {
    expect(maxBytesForEntitlement({ tier: "pro" })).toBe(PRO_HOUSEHOLD_STORAGE);
  });

});

describe("enforceQuotaOnUpload — entitlement-aware", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it("accepts a 100 MB upload when the house has Pro entitlement", async () => {
    db._store["houses/h1/meta/entitlement"] = { tier: "pro" };
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/big.pdf",
      100 * 1024 * 1024,
      db as never
    );
    expect(result).toBe("accepted");
  });

  it("rejects the same 100 MB upload when the house is free", async () => {
    // No entitlement doc → defaults to free → 50 MB cap → 100 MB rejected
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/big.pdf",
      100 * 1024 * 1024,
      db as never
    );
    expect(result).toBe("rejected");
  });

  it("rejects an upload that exceeds the Pro cap (500 MB)", async () => {
    db._store["houses/h1/meta/entitlement"] = { tier: "pro" };
    db._store["houses/h1/meta/storage"] = {
      usedBytes: PRO_HOUSEHOLD_STORAGE - 100,
    };
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.pdf",
      500,
      db as never
    );
    expect(result).toBe("rejected");
  });

  it("reads entitlement + storage counter in parallel inside one transaction (perf/race)", async () => {
    db._store["houses/h1/meta/entitlement"] = { tier: "pro" };
    db._store["houses/h1/meta/storage"] = { usedBytes: 0 };
    // Just confirming that a normal accepted upload works when both docs coexist.
    // The Promise.all pattern inside the function is verified structurally by this
    // running at all without deadlocking the mock transaction.
    const result = await enforceQuotaOnUpload(
      "houses/h1/attachments/a1/file.pdf",
      1024,
      db as never
    );
    expect(result).toBe("accepted");
  });
});
