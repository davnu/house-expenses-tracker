"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillReferenceRates = exports.updateReferenceRates = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const fetch_rates_1 = require("./fetch-rates");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
/**
 * Store rates in a single doc per rate ID.
 * Structure: reference_rates/{rateId} → { values: { "2024-01": 3.609, "2024-02": 3.671, ... }, ... }
 * This uses 1 Firestore read to get 20+ years of data.
 */
async function storeRates(rateId, entries, source) {
    const ref = db.doc(`reference_rates/${rateId}`);
    // Read existing doc to merge values (don't overwrite old data)
    const existing = await ref.get();
    const existingValues = existing.exists
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
async function fetchAndStoreAll(startDate, endDate) {
    const results = {};
    // Euribor 12M
    try {
        const entries = await (0, fetch_rates_1.fetchEuribor)("12m", startDate, endDate);
        await storeRates("euribor_12m", entries, "ECB");
        results.euribor_12m = `${entries.length} entries`;
    }
    catch (e) {
        results.euribor_12m = `error: ${e.message}`;
    }
    // Euribor 6M
    try {
        const entries = await (0, fetch_rates_1.fetchEuribor)("6m", startDate, endDate);
        await storeRates("euribor_6m", entries, "ECB");
        results.euribor_6m = `${entries.length} entries`;
    }
    catch (e) {
        results.euribor_6m = `error: ${e.message}`;
    }
    // SOFR
    try {
        const entries = await (0, fetch_rates_1.fetchSOFR)(startDate, endDate);
        await storeRates("sofr", entries, "NY Fed");
        results.sofr = `${entries.length} entries`;
    }
    catch (e) {
        results.sofr = `error: ${e.message}`;
    }
    // BoE Base Rate
    try {
        const entries = await (0, fetch_rates_1.fetchBoEBaseRate)(startDate, endDate);
        await storeRates("boe_base_rate", entries, "Bank of England");
        results.boe_base_rate = `${entries.length} entries`;
    }
    catch (e) {
        results.boe_base_rate = `error: ${e.message}`;
    }
    // Canada Prime Rate
    try {
        const entries = await (0, fetch_rates_1.fetchCanadaRate)(startDate, endDate);
        await storeRates("prime_rate", entries, "Bank of Canada");
        results.prime_rate = `${entries.length} entries`;
    }
    catch (e) {
        results.prime_rate = `error: ${e.message}`;
    }
    return results;
}
/**
 * Scheduled function: runs daily at 6:00 UTC
 * Fetches the latest 3 months of data (to catch any updates/corrections)
 */
exports.updateReferenceRates = (0, scheduler_1.onSchedule)({
    schedule: "0 6 * * *",
    timeZone: "UTC",
    region: "europe-west1",
}, async () => {
    const endDate = new Date().toISOString().substring(0, 10);
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .substring(0, 10);
    console.log(`Updating reference rates: ${startDate} to ${endDate}`);
    const results = await fetchAndStoreAll(startDate, endDate);
    console.log("Results:", JSON.stringify(results));
});
/**
 * Callable function: backfill historical data
 * Call once after first deploy to populate the database
 */
exports.backfillReferenceRates = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new Error("Authentication required");
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const rawStart = request.data?.startDate ?? "2005-01-01";
    const rawEnd = request.data?.endDate ?? new Date().toISOString().substring(0, 10);
    if (!dateRegex.test(rawStart) || !dateRegex.test(rawEnd)) {
        throw new Error("Invalid date format. Use YYYY-MM-DD.");
    }
    const startDate = rawStart;
    const endDate = rawEnd;
    console.log(`Backfilling reference rates: ${startDate} to ${endDate}`);
    const results = await fetchAndStoreAll(startDate, endDate);
    console.log("Results:", JSON.stringify(results));
    return { success: true, results };
});
//# sourceMappingURL=index.js.map