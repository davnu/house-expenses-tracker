import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  fetchEuribor,
  fetchSOFR,
  fetchBoEBaseRate,
  fetchCanadaRate,
  type RateEntry,
} from "./fetch-rates";

initializeApp();

const db = getFirestore();

/**
 * Store rates in a single doc per rate ID.
 * Structure: reference_rates/{rateId} → { values: { "2024-01": 3.609, "2024-02": 3.671, ... }, ... }
 * This uses 1 Firestore read to get 20+ years of data.
 */
async function storeRates(rateId: string, entries: RateEntry[], source: string) {
  const ref = db.doc(`reference_rates/${rateId}`);

  // Read existing doc to merge values (don't overwrite old data)
  const existing = await ref.get();
  const existingValues: Record<string, number> = existing.exists
    ? (existing.data()?.values ?? {})
    : {};

  // Merge new entries
  for (const entry of entries) {
    const month = entry.date.substring(0, 7); // YYYY-MM
    existingValues[month] = entry.value;
  }

  const latestMonth = Object.keys(existingValues).sort().pop();

  await ref.set({
    values: existingValues,
    source,
    lastUpdated: new Date().toISOString(),
    entryCount: Object.keys(existingValues).length,
    latestValue: latestMonth ? existingValues[latestMonth] : null,
    latestMonth: latestMonth ?? null,
  });
}

async function fetchAndStoreAll(startDate: string, endDate: string) {
  const results: Record<string, string> = {};

  // Euribor 12M
  try {
    const entries = await fetchEuribor("12m", startDate, endDate);
    await storeRates("euribor_12m", entries, "ECB");
    results.euribor_12m = `${entries.length} entries`;
  } catch (e) {
    results.euribor_12m = `error: ${(e as Error).message}`;
  }

  // Euribor 6M
  try {
    const entries = await fetchEuribor("6m", startDate, endDate);
    await storeRates("euribor_6m", entries, "ECB");
    results.euribor_6m = `${entries.length} entries`;
  } catch (e) {
    results.euribor_6m = `error: ${(e as Error).message}`;
  }

  // SOFR
  try {
    const entries = await fetchSOFR(startDate, endDate);
    await storeRates("sofr", entries, "NY Fed");
    results.sofr = `${entries.length} entries`;
  } catch (e) {
    results.sofr = `error: ${(e as Error).message}`;
  }

  // BoE Base Rate
  try {
    const entries = await fetchBoEBaseRate(startDate, endDate);
    await storeRates("boe_base_rate", entries, "Bank of England");
    results.boe_base_rate = `${entries.length} entries`;
  } catch (e) {
    results.boe_base_rate = `error: ${(e as Error).message}`;
  }

  // Canada Prime Rate
  try {
    const entries = await fetchCanadaRate(startDate, endDate);
    await storeRates("prime_rate", entries, "Bank of Canada");
    results.prime_rate = `${entries.length} entries`;
  } catch (e) {
    results.prime_rate = `error: ${(e as Error).message}`;
  }

  return results;
}

/**
 * Scheduled function: runs daily at 6:00 UTC
 * Fetches the latest 3 months of data (to catch any updates/corrections)
 */
export const updateReferenceRates = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "UTC",
    region: "europe-west1",
  },
  async () => {
    const endDate = new Date().toISOString().substring(0, 10);
    const startDate = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .substring(0, 10);

    console.log(`Updating reference rates: ${startDate} to ${endDate}`);
    const results = await fetchAndStoreAll(startDate, endDate);
    console.log("Results:", JSON.stringify(results));
  }
);

/**
 * Callable function: backfill historical data
 * Call once after first deploy to populate the database
 */
export const backfillReferenceRates = onCall(
  { region: "europe-west1" },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new Error("Authentication required");
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const rawStart = (request.data?.startDate as string) ?? "2005-01-01";
    const rawEnd = (request.data?.endDate as string) ?? new Date().toISOString().substring(0, 10);

    if (!dateRegex.test(rawStart) || !dateRegex.test(rawEnd)) {
      throw new Error("Invalid date format. Use YYYY-MM-DD.");
    }

    const startDate = rawStart;
    const endDate = rawEnd;

    console.log(`Backfilling reference rates: ${startDate} to ${endDate}`);
    const results = await fetchAndStoreAll(startDate, endDate);
    console.log("Results:", JSON.stringify(results));

    return { success: true, results };
  }
);

/**
 * Safety-net cascade delete: triggered when a house document gets a `deletedAt` field.
 *
 * The client sets `deletedAt` first (soft-delete) then runs its own cascade for
 * progress UI. This function is the server-side backstop — if the client finishes
 * first, every operation here is a no-op (idempotent). If the client crashes
 * mid-cascade, this function guarantees full cleanup.
 *
 * Steps:
 *  1. Read expenses → collect attachment paths for Storage cleanup
 *  2. Read members → update their user profiles (clear houseId)
 *  3. Delete Storage attachments (best-effort)
 *  4. recursiveDelete the house doc + all subcollections
 */
export const onHouseSoftDeleted = onDocumentUpdated(
  {
    document: "houses/{houseId}",
    region: "europe-west1",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only fire when deletedAt transitions from falsy → truthy
    if (before.deletedAt || !after.deletedAt) return;

    const houseId = event.params.houseId;
    console.log(`House ${houseId} soft-deleted, starting cascade cleanup`);

    const storage = getStorage();
    const bucket = storage.bucket();

    // 1. Collect attachment paths from expenses
    try {
      const expensesSnap = await db
        .collection(`houses/${houseId}/expenses`)
        .get();
      const deletePromises: Promise<void>[] = [];
      for (const expDoc of expensesSnap.docs) {
        const attachments = expDoc.data().attachments as
          | Array<{ id: string; name: string }>
          | undefined;
        if (attachments?.length) {
          for (const att of attachments) {
            const filePath = `houses/${houseId}/attachments/${att.id}/${att.name}`;
            deletePromises.push(
              bucket
                .file(filePath)
                .delete()
                .then(() => {})
                .catch(() => {}) // best-effort — file may already be gone
            );
          }
        }
      }
      await Promise.all(deletePromises);
      console.log(
        `Deleted ${deletePromises.length} attachment(s) for house ${houseId}`
      );
    } catch (err) {
      console.warn(`Attachment cleanup failed for house ${houseId}:`, err);
    }

    // 2. Clear houseId on affected members' user profiles
    try {
      const membersSnap = await db
        .collection(`houses/${houseId}/members`)
        .get();
      for (const memberDoc of membersSnap.docs) {
        try {
          const profileRef = db.doc(`users/${memberDoc.id}`);
          const profileSnap = await profileRef.get();
          if (
            profileSnap.exists &&
            profileSnap.data()?.houseId === houseId
          ) {
            await profileRef.update({ houseId: null });
          }
        } catch {
          // best-effort per member
        }
      }
      console.log(
        `Cleaned ${membersSnap.size} member profile(s) for house ${houseId}`
      );
    } catch (err) {
      console.warn(`Member cleanup failed for house ${houseId}:`, err);
    }

    // 3. Recursively delete house doc + all subcollections
    try {
      const houseRef = db.doc(`houses/${houseId}`);
      await db.recursiveDelete(houseRef);
      console.log(`Recursive delete completed for house ${houseId}`);
    } catch (err) {
      console.error(`Recursive delete failed for house ${houseId}:`, err);
    }
  }
);
