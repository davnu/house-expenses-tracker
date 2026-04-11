"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchEuribor = fetchEuribor;
exports.fetchSOFR = fetchSOFR;
exports.fetchBoEBaseRate = fetchBoEBaseRate;
exports.fetchCanadaRate = fetchCanadaRate;
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * Fetch Euribor rates from ECB Statistical Data Warehouse
 * No API key required
 */
async function fetchEuribor(tenor, startDate, endDate) {
    // ECB series keys for Euribor (flowRef/seriesKey)
    const seriesKey = tenor === "12m"
        ? "FM/M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA"
        : "FM/M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA";
    // ECB rejects future dates — cap endPeriod to current month
    const now = new Date();
    const maxEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const requestEnd = endDate.substring(0, 7) <= maxEnd ? endDate.substring(0, 7) : maxEnd;
    const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?startPeriod=${startDate.substring(0, 7)}&endPeriod=${requestEnd}&format=csvdata`;
    const res = await (0, node_fetch_1.default)(url);
    if (!res.ok)
        throw new Error(`ECB API error: ${res.status}`);
    const text = await res.text();
    const lines = text.split("\n");
    // CSV format: headers in first line, data follows
    // Find the column indices for TIME_PERIOD and OBS_VALUE
    const headers = lines[0]?.split(",").map((h) => h.trim()) ?? [];
    const timeIdx = headers.indexOf("TIME_PERIOD");
    const valueIdx = headers.indexOf("OBS_VALUE");
    if (timeIdx === -1 || valueIdx === -1) {
        throw new Error("Unexpected ECB CSV format");
    }
    const entries = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]?.split(",");
        if (!cols || cols.length <= Math.max(timeIdx, valueIdx))
            continue;
        const period = cols[timeIdx]?.trim(); // YYYY-MM
        const value = parseFloat(cols[valueIdx]?.trim() ?? "");
        if (period && !isNaN(value)) {
            entries.push({
                date: `${period}-01`,
                value: Math.round(value * 1000) / 1000,
            });
        }
    }
    return entries;
}
/**
 * Fetch SOFR rates from NY Federal Reserve Markets API
 * No API key required
 */
async function fetchSOFR(startDate, endDate) {
    const url = `https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=${startDate}&endDate=${endDate}&type=rate`;
    const res = await (0, node_fetch_1.default)(url);
    if (!res.ok)
        throw new Error(`NY Fed API error: ${res.status}`);
    const data = (await res.json());
    const rates = data.refRates ?? [];
    // Use end-of-month rate (last business day) — this is what mortgage products typically use
    const byMonth = {};
    for (const rate of rates) {
        const month = rate.effectiveDate.substring(0, 7);
        if (!byMonth[month] || rate.effectiveDate > byMonth[month].date) {
            byMonth[month] = { date: rate.effectiveDate, rate: rate.percentRate };
        }
    }
    return Object.entries(byMonth)
        .map(([month, { rate }]) => ({
        date: `${month}-01`,
        value: Math.round(rate * 1000) / 1000,
    }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
/**
 * Fetch Bank of England base rate from BoE database
 * CSV endpoint, no API key required
 * Series: IUDBEDR (official bank rate)
 */
async function fetchBoEBaseRate(startDate, endDate) {
    // BoE IADB CSV endpoint — requires DD/Mon/YYYY format
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const sd = new Date(startDate);
    const ed = new Date(endDate);
    const fromStr = `${String(sd.getDate()).padStart(2, "0")}/${months[sd.getMonth()]}/${sd.getFullYear()}`;
    const toStr = `${String(ed.getDate()).padStart(2, "0")}/${months[ed.getMonth()]}/${ed.getFullYear()}`;
    const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${fromStr}&Dateto=${toStr}&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
    const res = await (0, node_fetch_1.default)(url);
    if (!res.ok)
        throw new Error(`BoE API error: ${res.status}`);
    const text = await res.text();
    const lines = text.split("\n");
    // BoE CSV: first line is header "DATE,IUDBEDR", then "DD MMM YYYY,value"
    const entries = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line)
            continue;
        const [dateStr, valueStr] = line.split(",");
        if (!dateStr || !valueStr)
            continue;
        const value = parseFloat(valueStr.trim());
        if (isNaN(value))
            continue;
        // Parse BoE date format: "02 Jan 2020" or "DD/MM/YYYY"
        const parsed = new Date(dateStr.trim());
        if (isNaN(parsed.getTime()))
            continue;
        const isoDate = parsed.getFullYear() +
            "-" +
            String(parsed.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(parsed.getDate()).padStart(2, "0");
        entries.push({ date: isoDate, value });
    }
    // BoE rate doesn't change monthly — it changes at specific dates
    // Convert to monthly entries using the rate that was active on the 1st of each month
    if (entries.length === 0)
        return [];
    const monthlyEntries = [];
    const sorted = entries.sort((a, b) => a.date.localeCompare(b.date));
    // Generate monthly entries from start to end
    const start = new Date(startDate);
    const end = new Date(endDate);
    let currentRate = sorted[0].value;
    let rateIdx = 0;
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
        const cursorStr = cursor.getFullYear() +
            "-" +
            String(cursor.getMonth() + 1).padStart(2, "0") +
            "-01";
        // Advance rate index to find the active rate for this month
        while (rateIdx < sorted.length &&
            sorted[rateIdx].date <= cursorStr) {
            currentRate = sorted[rateIdx].value;
            rateIdx++;
        }
        monthlyEntries.push({ date: cursorStr, value: currentRate });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return monthlyEntries;
}
/**
 * Fetch Canada overnight rate from Bank of Canada
 * Valet API, no key required
 * We use this as a proxy for Prime Rate (Prime ≈ overnight + 2.2%)
 */
async function fetchCanadaRate(startDate, endDate) {
    const url = `https://www.bankofcanada.ca/valet/observations/V39079/json?start_date=${startDate}&end_date=${endDate}`;
    const res = await (0, node_fetch_1.default)(url);
    if (!res.ok)
        throw new Error(`Bank of Canada API error: ${res.status}`);
    const data = (await res.json());
    const observations = data.observations ?? [];
    // Aggregate to monthly (use last value of each month)
    const monthly = {};
    for (const obs of observations) {
        const month = obs.d.substring(0, 7);
        const value = parseFloat(obs.V39079?.v ?? "");
        if (!isNaN(value)) {
            monthly[month] = value;
        }
    }
    // Prime rate ≈ Bank of Canada overnight rate + 2.2% (standard bank spread)
    return Object.entries(monthly)
        .map(([month, value]) => ({
        date: `${month}-01`,
        value: Math.round((value + 2.2) * 1000) / 1000,
    }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
//# sourceMappingURL=fetch-rates.js.map