"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Mock Firebase modules before importing storage-quota (which registers
// Cloud Functions at module level via onObjectFinalized/onObjectDeleted)
vitest_1.vi.mock("firebase-functions/v2/storage", () => ({
    onObjectFinalized: (_opts, handler) => handler,
    onObjectDeleted: (_opts, handler) => handler,
}));
vitest_1.vi.mock("firebase-admin/firestore", () => ({
    getFirestore: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("firebase-admin/storage", () => ({
    getStorage: vitest_1.vi.fn(),
}));
const storage_quota_1 = require("../storage-quota");
/**
 * Creates a minimal Firestore mock that supports transactions.
 * Writes are buffered during the transaction and only applied
 * if the callback completes without throwing (simulates real
 * Firestore transaction semantics).
 */
function createMockDb(initialData = {}) {
    const store = { ...initialData };
    const db = {
        doc(path) {
            return { path };
        },
        async runTransaction(fn) {
            const writes = [];
            const tx = {
                async get(ref) {
                    const data = store[ref.path];
                    return {
                        exists: data !== undefined,
                        data: () => (data ? { ...data } : undefined),
                    };
                },
                set(ref, data, options) {
                    writes.push(() => {
                        if (options?.merge) {
                            store[ref.path] = { ...(store[ref.path] || {}), ...data };
                        }
                        else {
                            store[ref.path] = { ...data };
                        }
                    });
                },
                update(ref, data) {
                    writes.push(() => {
                        store[ref.path] = { ...(store[ref.path] || {}), ...data };
                    });
                },
            };
            await fn(tx);
            // Commit: apply buffered writes only if callback succeeded
            for (const write of writes)
                write();
        },
        /** Exposed for test assertions */
        _store: store,
    };
    return db;
}
// ── extractHouseId ──────────────────────────────────────────────────
(0, vitest_1.describe)("extractHouseId", () => {
    (0, vitest_1.it)("extracts houseId from attachment path", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("houses/abc123/attachments/att-1/receipt.png")).toBe("abc123");
    });
    (0, vitest_1.it)("extracts houseId from document path", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("houses/abc123/documents/doc-1/contract.pdf")).toBe("abc123");
    });
    (0, vitest_1.it)("extracts houseId from attachment thumbnail path", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("houses/abc123/attachments/att-1/thumb.jpg")).toBe("abc123");
    });
    (0, vitest_1.it)("extracts houseId from document thumbnail path", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("houses/abc123/documents/doc-1/thumb.jpg")).toBe("abc123");
    });
    (0, vitest_1.it)("handles houseId with hyphens and underscores", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("houses/abc-123_def/attachments/att-1/file.png")).toBe("abc-123_def");
    });
    (0, vitest_1.it)("returns null for root-level path", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("some-file.png")).toBeNull();
    });
    (0, vitest_1.it)("returns null for non-house path", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("users/uid123/avatar.png")).toBeNull();
    });
    (0, vitest_1.it)("returns null for unrecognised house subcollection", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("houses/abc123/other/file.png")).toBeNull();
    });
    (0, vitest_1.it)("returns null for empty string", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("")).toBeNull();
    });
    (0, vitest_1.it)("returns null for partial path missing subcollection", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("houses/abc123/")).toBeNull();
    });
    (0, vitest_1.it)("returns null for path with only 'houses/' prefix", () => {
        (0, vitest_1.expect)((0, storage_quota_1.extractHouseId)("houses/")).toBeNull();
    });
});
// ── isThumbnail ─────────────────────────────────────────────────────
(0, vitest_1.describe)("isThumbnail", () => {
    (0, vitest_1.it)("detects attachment thumbnail", () => {
        (0, vitest_1.expect)((0, storage_quota_1.isThumbnail)("houses/h1/attachments/a1/thumb.jpg")).toBe(true);
    });
    (0, vitest_1.it)("detects document thumbnail", () => {
        (0, vitest_1.expect)((0, storage_quota_1.isThumbnail)("houses/h1/documents/d1/thumb.jpg")).toBe(true);
    });
    (0, vitest_1.it)("returns false for regular file", () => {
        (0, vitest_1.expect)((0, storage_quota_1.isThumbnail)("houses/h1/attachments/a1/receipt.png")).toBe(false);
    });
    (0, vitest_1.it)("returns false for file named similarly but not exactly thumb.jpg", () => {
        (0, vitest_1.expect)((0, storage_quota_1.isThumbnail)("houses/h1/attachments/a1/thumb.png")).toBe(false);
        (0, vitest_1.expect)((0, storage_quota_1.isThumbnail)("houses/h1/attachments/a1/my-thumb.jpg")).toBe(false);
    });
});
// ── storageDocPath ──────────────────────────────────────────────────
(0, vitest_1.describe)("storageDocPath", () => {
    (0, vitest_1.it)("returns correct Firestore path", () => {
        (0, vitest_1.expect)((0, storage_quota_1.storageDocPath)("house-42")).toBe("houses/house-42/meta/storage");
    });
});
// ── enforceQuotaOnUpload ────────────────────────────────────────────
(0, vitest_1.describe)("enforceQuotaOnUpload", () => {
    let db;
    (0, vitest_1.beforeEach)(() => {
        db = createMockDb();
    });
    // ── Accepted uploads ────────────────────────────────────────────
    (0, vitest_1.it)("accepts first upload for a house (no existing counter)", async () => {
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("accepted");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(1000);
    });
    (0, vitest_1.it)("accepts upload when total stays under limit", async () => {
        db._store["houses/h1/meta/storage"] = { usedBytes: 10 * 1024 * 1024 };
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("accepted");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(10 * 1024 * 1024 + 1000);
    });
    (0, vitest_1.it)("accepts upload that lands exactly at the limit", async () => {
        const remaining = 5000;
        db._store["houses/h1/meta/storage"] = {
            usedBytes: storage_quota_1.MAX_HOUSEHOLD_STORAGE - remaining,
        };
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", remaining, db);
        (0, vitest_1.expect)(result).toBe("accepted");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(storage_quota_1.MAX_HOUSEHOLD_STORAGE);
    });
    (0, vitest_1.it)("accumulates across multiple uploads", async () => {
        await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file1.png", 1000, db);
        await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a2/file2.png", 2000, db);
        await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/documents/d1/doc.pdf", 3000, db);
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(6000);
    });
    (0, vitest_1.it)("counts attachments and documents against the same quota", async () => {
        db._store["houses/h1/meta/storage"] = {
            usedBytes: storage_quota_1.MAX_HOUSEHOLD_STORAGE - 100,
        };
        // Document upload that would put us over
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/documents/d1/file.pdf", 200, db);
        (0, vitest_1.expect)(result).toBe("rejected");
    });
    (0, vitest_1.it)("sets updatedAt timestamp", async () => {
        await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.updatedAt).toBeDefined();
        (0, vitest_1.expect)(typeof db._store["houses/h1/meta/storage"]?.updatedAt).toBe("string");
    });
    // ── Rejected uploads ────────────────────────────────────────────
    (0, vitest_1.it)("rejects upload that would exceed limit", async () => {
        db._store["houses/h1/meta/storage"] = {
            usedBytes: storage_quota_1.MAX_HOUSEHOLD_STORAGE - 100,
        };
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 200, db);
        (0, vitest_1.expect)(result).toBe("rejected");
        // Counter must not have changed
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(storage_quota_1.MAX_HOUSEHOLD_STORAGE - 100);
    });
    (0, vitest_1.it)("rejects upload 1 byte over limit", async () => {
        db._store["houses/h1/meta/storage"] = {
            usedBytes: storage_quota_1.MAX_HOUSEHOLD_STORAGE - 999,
        };
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("rejected");
    });
    (0, vitest_1.it)("rejects when storage is already full", async () => {
        db._store["houses/h1/meta/storage"] = {
            usedBytes: storage_quota_1.MAX_HOUSEHOLD_STORAGE,
        };
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 1, db);
        (0, vitest_1.expect)(result).toBe("rejected");
    });
    (0, vitest_1.it)("does not modify counter on rejection", async () => {
        const initialUsed = storage_quota_1.MAX_HOUSEHOLD_STORAGE - 50;
        db._store["houses/h1/meta/storage"] = { usedBytes: initialUsed };
        await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 100, db);
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(initialUsed);
    });
    // ── Skipped (no-op) ─────────────────────────────────────────────
    (0, vitest_1.it)("skips non-house path", async () => {
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("users/u1/avatar.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("skipped");
        (0, vitest_1.expect)(Object.keys(db._store)).toHaveLength(0);
    });
    (0, vitest_1.it)("skips empty file path", async () => {
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("", 1000, db);
        (0, vitest_1.expect)(result).toBe("skipped");
    });
    (0, vitest_1.it)("skips zero-size file", async () => {
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 0, db);
        (0, vitest_1.expect)(result).toBe("skipped");
    });
    (0, vitest_1.it)("skips negative-size file", async () => {
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", -100, db);
        (0, vitest_1.expect)(result).toBe("skipped");
    });
    (0, vitest_1.it)("skips NaN size", async () => {
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", NaN, db);
        (0, vitest_1.expect)(result).toBe("skipped");
    });
    // ── Edge cases ──────────────────────────────────────────────────
    (0, vitest_1.it)("handles missing usedBytes field in existing doc", async () => {
        db._store["houses/h1/meta/storage"] = {
            updatedAt: "2024-01-01T00:00:00.000Z",
        };
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("accepted");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(1000);
    });
    (0, vitest_1.it)("isolates storage between different houses", async () => {
        db._store["houses/h1/meta/storage"] = {
            usedBytes: storage_quota_1.MAX_HOUSEHOLD_STORAGE - 100,
        };
        db._store["houses/h2/meta/storage"] = { usedBytes: 0 };
        // h1 is almost full — should be rejected
        const r1 = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 200, db);
        (0, vitest_1.expect)(r1).toBe("rejected");
        // h2 has space — should be accepted
        const r2 = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h2/attachments/a1/file.png", 200, db);
        (0, vitest_1.expect)(r2).toBe("accepted");
    });
    (0, vitest_1.it)("rethrows non-quota transaction errors", async () => {
        const failDb = createMockDb();
        failDb.runTransaction = async () => {
            throw new Error("NETWORK_ERROR");
        };
        await (0, vitest_1.expect)((0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 1000, failDb)).rejects.toThrow("NETWORK_ERROR");
    });
    (0, vitest_1.it)("handles a single large file that exceeds limit alone", async () => {
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/huge.pdf", storage_quota_1.MAX_HOUSEHOLD_STORAGE + 1, db);
        (0, vitest_1.expect)(result).toBe("rejected");
    });
    (0, vitest_1.it)("skips thumbnails (not counted against user quota)", async () => {
        const result = await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/thumb.jpg", 5000, db);
        (0, vitest_1.expect)(result).toBe("skipped");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]).toBeUndefined();
    });
    (0, vitest_1.it)("uses merge: true to preserve other fields in storage doc", async () => {
        db._store["houses/h1/meta/storage"] = {
            usedBytes: 0,
            someOtherField: "keep-me",
        };
        await (0, storage_quota_1.enforceQuotaOnUpload)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.someOtherField).toBe("keep-me");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(1000);
    });
});
// ── decrementOnDelete ───────────────────────────────────────────────
(0, vitest_1.describe)("decrementOnDelete", () => {
    let db;
    (0, vitest_1.beforeEach)(() => {
        db = createMockDb();
    });
    (0, vitest_1.it)("decrements counter on normal file deletion", async () => {
        db._store["houses/h1/meta/storage"] = { usedBytes: 5000 };
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("decremented");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(4000);
    });
    (0, vitest_1.it)("decrements to zero on exact-size deletion", async () => {
        db._store["houses/h1/meta/storage"] = { usedBytes: 3000 };
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", 3000, db);
        (0, vitest_1.expect)(result).toBe("decremented");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(0);
    });
    (0, vitest_1.it)("clamps to zero when deletion size exceeds counter", async () => {
        db._store["houses/h1/meta/storage"] = { usedBytes: 500 };
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("decremented");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(0);
    });
    (0, vitest_1.it)("handles deletion when no counter doc exists (no-op)", async () => {
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("decremented");
        // Should NOT have created a counter doc
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]).toBeUndefined();
    });
    (0, vitest_1.it)("handles missing usedBytes field in existing doc", async () => {
        db._store["houses/h1/meta/storage"] = {
            updatedAt: "2024-01-01T00:00:00.000Z",
        };
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("decremented");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(0);
    });
    (0, vitest_1.it)("works with document paths", async () => {
        db._store["houses/h1/meta/storage"] = { usedBytes: 10000 };
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/documents/d1/contract.pdf", 3000, db);
        (0, vitest_1.expect)(result).toBe("decremented");
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(7000);
    });
    (0, vitest_1.it)("sets updatedAt on decrement", async () => {
        db._store["houses/h1/meta/storage"] = {
            usedBytes: 5000,
            updatedAt: "2024-01-01T00:00:00.000Z",
        };
        await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", 1000, db);
        const updatedAt = db._store["houses/h1/meta/storage"]
            ?.updatedAt;
        (0, vitest_1.expect)(updatedAt).not.toBe("2024-01-01T00:00:00.000Z");
    });
    // ── Skipped (no-op) ─────────────────────────────────────────────
    (0, vitest_1.it)("skips non-house path", async () => {
        const result = await (0, storage_quota_1.decrementOnDelete)("users/u1/avatar.png", 1000, db);
        (0, vitest_1.expect)(result).toBe("skipped");
    });
    (0, vitest_1.it)("skips empty path", async () => {
        const result = await (0, storage_quota_1.decrementOnDelete)("", 1000, db);
        (0, vitest_1.expect)(result).toBe("skipped");
    });
    (0, vitest_1.it)("skips zero-size file", async () => {
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", 0, db);
        (0, vitest_1.expect)(result).toBe("skipped");
    });
    (0, vitest_1.it)("skips negative-size file", async () => {
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", -100, db);
        (0, vitest_1.expect)(result).toBe("skipped");
    });
    (0, vitest_1.it)("skips thumbnail deletion (not counted)", async () => {
        db._store["houses/h1/meta/storage"] = { usedBytes: 5000 };
        const result = await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/thumb.jpg", 3000, db);
        (0, vitest_1.expect)(result).toBe("skipped");
        // Counter must not have changed
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(5000);
    });
    // ── Isolation ───────────────────────────────────────────────────
    (0, vitest_1.it)("only decrements the correct house counter", async () => {
        db._store["houses/h1/meta/storage"] = { usedBytes: 5000 };
        db._store["houses/h2/meta/storage"] = { usedBytes: 8000 };
        await (0, storage_quota_1.decrementOnDelete)("houses/h1/attachments/a1/file.png", 1000, db);
        (0, vitest_1.expect)(db._store["houses/h1/meta/storage"]?.usedBytes).toBe(4000);
        (0, vitest_1.expect)(db._store["houses/h2/meta/storage"]?.usedBytes).toBe(8000);
    });
});
// ── MAX_HOUSEHOLD_STORAGE constant ──────────────────────────────────
(0, vitest_1.describe)("MAX_HOUSEHOLD_STORAGE", () => {
    (0, vitest_1.it)("is 50 MB in bytes", () => {
        (0, vitest_1.expect)(storage_quota_1.MAX_HOUSEHOLD_STORAGE).toBe(50 * 1024 * 1024);
    });
});
//# sourceMappingURL=storage-quota.test.js.map