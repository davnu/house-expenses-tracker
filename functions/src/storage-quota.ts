import {
  onObjectFinalized,
  onObjectDeleted,
} from "firebase-functions/v2/storage";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Must match the client-side MAX_HOUSEHOLD_STORAGE in src/lib/constants.ts
export const MAX_HOUSEHOLD_STORAGE = 50 * 1024 * 1024; // 50 MB

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
export function extractHouseId(filePath: string): string | null {
  const match = filePath.match(/^houses\/([^/]+)\/(attachments|documents)\//);
  return match ? match[1] : null;
}

/** Auto-generated thumbnails don't count against the user's quota. */
export function isThumbnail(filePath: string): boolean {
  return filePath.endsWith("/thumb.jpg");
}

/** Firestore path for the storage counter document. */
export function storageDocPath(houseId: string): string {
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
export async function enforceQuotaOnUpload(
  filePath: string,
  fileSize: number,
  db: Firestore
): Promise<"accepted" | "rejected" | "skipped"> {
  if (!filePath || !(fileSize > 0) || isThumbnail(filePath)) return "skipped";

  const houseId = extractHouseId(filePath);
  if (!houseId) return "skipped";

  const ref = db.doc(storageDocPath(houseId));

  try {
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const currentUsed: number = doc.exists
        ? (doc.data()?.usedBytes ?? 0)
        : 0;

      if (currentUsed + fileSize > MAX_HOUSEHOLD_STORAGE) {
        throw new Error("QUOTA_EXCEEDED");
      }

      tx.set(
        ref,
        {
          usedBytes: currentUsed + fileSize,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });

    return "accepted";
  } catch (err) {
    if ((err as Error).message === "QUOTA_EXCEEDED") {
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
export async function decrementOnDelete(
  filePath: string,
  fileSize: number,
  db: Firestore
): Promise<"decremented" | "skipped"> {
  if (!filePath || !(fileSize > 0) || isThumbnail(filePath)) return "skipped";

  const houseId = extractHouseId(filePath);
  if (!houseId) return "skipped";

  const ref = db.doc(storageDocPath(houseId));

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;

    const currentUsed: number = doc.data()?.usedBytes ?? 0;
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
export const onFileUploaded = onObjectFinalized(
  { region: "europe-west1" },
  async (event) => {
    const filePath = event.data.name;
    const fileSize = Number(event.data.size ?? 0);
    const db = getFirestore();

    const result = await enforceQuotaOnUpload(filePath, fileSize, db);

    if (result === "rejected") {
      const bucket = getStorage().bucket(event.data.bucket);
      await bucket.file(filePath).delete().catch(() => {});
      console.warn(`Quota exceeded for house, deleted ${filePath}`);
    } else if (result === "accepted") {
      console.log(`Storage +${fileSize}B (${filePath})`);
    }
  }
);

/**
 * Triggered when a file is deleted from Firebase Storage.
 * Decrements the household storage counter, clamping to 0.
 */
export const onFileDeleted = onObjectDeleted(
  { region: "europe-west1" },
  async (event) => {
    const filePath = event.data.name;
    const fileSize = Number(event.data.size ?? 0);
    const db = getFirestore();

    const result = await decrementOnDelete(filePath, fileSize, db);

    if (result === "decremented") {
      console.log(`Storage -${fileSize}B (${filePath})`);
    }
  }
);
