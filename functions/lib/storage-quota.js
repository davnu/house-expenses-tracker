"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onFileDeleted = exports.onFileUploaded = exports.PRO_HOUSEHOLD_STORAGE = exports.MAX_HOUSEHOLD_STORAGE = void 0;
exports.maxBytesForEntitlement = maxBytesForEntitlement;
exports.extractHouseId = extractHouseId;
exports.isThumbnail = isThumbnail;
exports.storageDocPath = storageDocPath;
exports.enforceQuotaOnUpload = enforceQuotaOnUpload;
exports.decrementOnDelete = decrementOnDelete;
const storage_1 = require("firebase-functions/v2/storage");
const firestore_1 = require("firebase-admin/firestore");
const storage_2 = require("firebase-admin/storage");
// Free-tier default — matches client-side MAX_HOUSEHOLD_STORAGE in src/lib/constants.ts.
// Houses with a Pro entitlement get a larger cap (see maxBytesForHouse below).
exports.MAX_HOUSEHOLD_STORAGE = 50 * 1024 * 1024; // 50 MB
exports.PRO_HOUSEHOLD_STORAGE = 500 * 1024 * 1024; // 500 MB
/**
 * Compute the storage cap for a house given its entitlement doc.
 * Defaults to free-tier 50 MB when entitlement is missing or not Pro.
 */
function maxBytesForEntitlement(entitlement) {
    return entitlement?.tier === "pro" ? exports.PRO_HOUSEHOLD_STORAGE : exports.MAX_HOUSEHOLD_STORAGE;
}
/**
 * Extract the houseId from a Storage file path.
 *
 * Expected patterns:
 *   houses/{houseId}/attachments/{attachmentId}/{fileName}
 *   houses/{houseId}/documents/{documentId}/{fileName}
 *   houses/{houseId}/attachments/{attachmentId}/thumb.jpg
 *   houses/{houseId}/documents/{documentId}/thumb.jpg
 *
 * Returns null if the path doesn't match a house storage path.
 */
function extractHouseId(filePath) {
    const match = filePath.match(/^houses\/([^/]+)\/(attachments|documents)\//);
    return match ? match[1] : null;
}
/** Auto-generated thumbnails don't count against the user's quota. */
function isThumbnail(filePath) {
    return filePath.endsWith("/thumb.jpg");
}
/** Firestore path for the storage counter document. */
function storageDocPath(houseId) {
    return `houses/${houseId}/meta/storage`;
}
/**
 * Atomically check household quota and increment the counter.
 *
 * Returns:
 *  - "accepted" if the file fits within quota (counter incremented)
 *  - "rejected" if adding the file would exceed the quota (counter unchanged)
 *  - "skipped" if the file path is not a house path or size is invalid
 */
async function enforceQuotaOnUpload(filePath, fileSize, db) {
    if (!filePath || !(fileSize > 0) || isThumbnail(filePath))
        return "skipped";
    const houseId = extractHouseId(filePath);
    if (!houseId)
        return "skipped";
    const ref = db.doc(storageDocPath(houseId));
    const entitlementRef = db.doc(`houses/${houseId}/meta/entitlement`);
    try {
        await db.runTransaction(async (tx) => {
            // Firestore transactions require all reads before any writes. Read the
            // storage counter and entitlement doc in parallel so the cap is always
            // based on the freshest tier (handles the post-purchase window where a
            // Pro user uploads immediately after payment).
            const [doc, entitlementDoc] = await Promise.all([
                tx.get(ref),
                tx.get(entitlementRef),
            ]);
            const currentUsed = doc.exists
                ? (doc.data()?.usedBytes ?? 0)
                : 0;
            const maxBytes = maxBytesForEntitlement(entitlementDoc.exists ? entitlementDoc.data() : null);
            if (currentUsed + fileSize > maxBytes) {
                throw new Error("QUOTA_EXCEEDED");
            }
            tx.set(ref, {
                usedBytes: currentUsed + fileSize,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
        });
        return "accepted";
    }
    catch (err) {
        if (err.message === "QUOTA_EXCEEDED") {
            return "rejected";
        }
        throw err;
    }
}
/**
 * Decrement the household storage counter when a file is deleted.
 * Clamps to 0 to prevent negative drift.
 *
 * Returns:
 *  - "decremented" if the operation ran (even if no doc existed)
 *  - "skipped" if the file path is not a house path or size is invalid
 */
async function decrementOnDelete(filePath, fileSize, db) {
    if (!filePath || !(fileSize > 0) || isThumbnail(filePath))
        return "skipped";
    const houseId = extractHouseId(filePath);
    if (!houseId)
        return "skipped";
    const ref = db.doc(storageDocPath(houseId));
    await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists)
            return;
        const currentUsed = doc.data()?.usedBytes ?? 0;
        const newUsed = Math.max(0, currentUsed - fileSize);
        tx.update(ref, {
            usedBytes: newUsed,
            updatedAt: new Date().toISOString(),
        });
    });
    return "decremented";
}
// ── Cloud Function Exports ──────────────────────────────────────────
/**
 * Triggered after a file upload completes in Firebase Storage.
 * Enforces the household storage quota: if adding this file exceeds
 * the limit, the file is deleted and the counter is not incremented.
 *
 * NOTE: When a quota-rejected file is deleted here, `onFileDeleted`
 * will fire and decrement the counter even though it was never
 * incremented. This causes a small downward drift (generous direction).
 * In practice this is rare since the client-side check catches most
 * quota violations before upload. A periodic reconciliation function
 * can correct any accumulated drift if needed.
 */
exports.onFileUploaded = (0, storage_1.onObjectFinalized)({ region: "europe-west1" }, async (event) => {
    const filePath = event.data.name;
    const fileSize = Number(event.data.size ?? 0);
    const db = (0, firestore_1.getFirestore)();
    const result = await enforceQuotaOnUpload(filePath, fileSize, db);
    if (result === "rejected") {
        const bucket = (0, storage_2.getStorage)().bucket(event.data.bucket);
        await bucket.file(filePath).delete().catch(() => { });
        console.warn(`Quota exceeded for house, deleted ${filePath}`);
        // Write a notification so the user sees WHY their upload vanished.
        // Common cause: Pro was revoked (refund/chargeback) between when the
        // upload began and when this trigger ran. Without this, files appear
        // to silently disappear — terrible UX.
        const houseId = extractHouseId(filePath);
        if (houseId) {
            const fileName = filePath.split("/").pop() ?? "file";
            await db
                .collection(`houses/${houseId}/notifications`)
                .add({
                type: "storage_quota_rejected",
                fileName,
                fileSize,
                createdAt: new Date().toISOString(),
            })
                .catch((err) => {
                // Best-effort — if the notification write fails we still logged.
                console.warn(`Failed to write quota notification:`, err);
            });
        }
    }
    else if (result === "accepted") {
        console.log(`Storage +${fileSize}B (${filePath})`);
    }
});
/**
 * Triggered when a file is deleted from Firebase Storage.
 * Decrements the household storage counter, clamping to 0.
 */
exports.onFileDeleted = (0, storage_1.onObjectDeleted)({ region: "europe-west1" }, async (event) => {
    const filePath = event.data.name;
    const fileSize = Number(event.data.size ?? 0);
    const db = (0, firestore_1.getFirestore)();
    const result = await decrementOnDelete(filePath, fileSize, db);
    if (result === "decremented") {
        console.log(`Storage -${fileSize}B (${filePath})`);
    }
});
//# sourceMappingURL=storage-quota.js.map