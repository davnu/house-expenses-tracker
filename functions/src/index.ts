import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
    const startDate = (request.data?.startDate as string) ?? "2005-01-01";
    const endDate =
      (request.data?.endDate as string) ??
      new Date().toISOString().substring(0, 10);

    console.log(`Backfilling reference rates: ${startDate} to ${endDate}`);
    const results = await fetchAndStoreAll(startDate, endDate);
    console.log("Results:", JSON.stringify(results));

    return { success: true, results };
  }
);
