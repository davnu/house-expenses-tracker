import { SHARED_PAYER, SPLIT_PAYER } from './constants'
import type { Expense, ExpenseSplit, CostSplitShare } from '@/types/expense'

/** A full cost split sums to 10000 basis points (= 100%). */
export const TOTAL_BPS = 10000

/**
 * Returns the effective household cost split for the given member set.
 * - Uses the stored costSplit when it matches the current member set exactly and sums to 10000.
 * - Otherwise falls back to an even split across memberIds so the app degrades safely
 *   after a member is added or removed without re-saving the ratio.
 * - Output is sorted by uid for determinism across Firestore snapshot iterations.
 */
export function getEffectiveHouseSplit(
  memberIds: string[],
  costSplit?: CostSplitShare[],
): CostSplitShare[] {
  if (memberIds.length === 0) return []

  if (costSplit && costSplit.length > 0) {
    const uidSet = new Set(memberIds)
    const matchesMembers =
      costSplit.length === memberIds.length && costSplit.every((s) => uidSet.has(s.uid))
    const sumBps = costSplit.reduce((s, e) => s + e.shareBps, 0)
    if (matchesMembers && sumBps === TOTAL_BPS) {
      return [...costSplit].sort((a, b) => a.uid.localeCompare(b.uid))
    }
  }

  return makeEqualSplit(memberIds)
}

/**
 * Builds an equal-share split across member uids.
 * Input is sorted by uid so the remainder recipient is stable across renders,
 * regardless of the order the caller's members array arrived in.
 */
export function makeEqualSplit(memberIds: string[]): CostSplitShare[] {
  if (memberIds.length === 0) return []
  const sorted = [...memberIds].sort()
  const base = Math.floor(TOTAL_BPS / sorted.length)
  const remainder = TOTAL_BPS - base * sorted.length
  // Rotate the 1 bp remainder using the shape of the uid set, so different
  // member combinations spread the remainder instead of always crediting index 0.
  const remainderIndex = pickRotationIndex(sorted, sorted.length)
  return sorted.map((uid, i) => ({ uid, shareBps: base + (i === remainderIndex ? remainder : 0) }))
}

/**
 * Deterministic but shape-dependent rotation index. Same uids → same index;
 * different uid sets spread the cent/bp remainder across members over time.
 */
function pickRotationIndex(uids: string[], length: number): number {
  if (length <= 1) return 0
  let hash = 0
  for (const uid of uids) {
    for (let i = 0; i < uid.length; i++) {
      hash = (hash * 31 + uid.charCodeAt(i)) | 0
    }
  }
  return Math.abs(hash) % length
}

/**
 * Distributes a cent amount across members by ratio, guaranteeing the result sums
 * exactly to amountCents. The remainder recipient is picked by pickRotationIndex
 * so one specific member doesn't systematically collect extra cents over time.
 */
export function applyRatioToAmount(
  amountCents: number,
  ratio: CostSplitShare[],
): ExpenseSplit[] {
  if (ratio.length === 0) return []
  if (amountCents === 0) return ratio.map((r) => ({ uid: r.uid, shareCents: 0 }))

  const remainderIndex = pickRotationIndex(ratio.map((r) => r.uid), ratio.length)

  const base = ratio.map((r) => ({
    uid: r.uid,
    shareCents: Math.round((amountCents * r.shareBps) / TOTAL_BPS),
  }))
  const allocated = base.reduce((s, e) => s + e.shareCents, 0)
  const drift = amountCents - allocated
  if (drift !== 0) {
    base[remainderIndex] = {
      uid: base[remainderIndex].uid,
      shareCents: base[remainderIndex].shareCents + drift,
    }
  }
  return base
}

/**
 * Per-member allocation (who owns this piece of the cost).
 *  - Single payer (uid) → 100% to that uid.
 *  - SPLIT_PAYER → uses the stored per-person amounts (cash == allocation in the
 *    multi-payer model: each person owns the amount they contributed).
 *    If splits are missing/empty (malformed data), falls back to an equal
 *    split per the household ratio — never silently drops the expense.
 *  - SHARED_PAYER → distributed by the household ratio (joint funds are
 *    conceptually jointly owned in that ratio).
 *
 * Note: legacy expenses written under the previous "per-expense allocation
 * override" model that have `splits` set on a single-payer or shared expense
 * have their splits ignored here — the new model uses splits only for
 * SPLIT_PAYER. This keeps old data visible without misattributing it.
 */
export function getExpenseAllocation(
  expense: Expense,
  houseSplit: CostSplitShare[],
): ExpenseSplit[] {
  if (expense.payer === SPLIT_PAYER) {
    if (expense.splits && expense.splits.length > 0) return expense.splits
    // Fallback: treat as shared at the household ratio so the expense is still
    // accounted for somewhere rather than silently disappearing from totals.
    return applyRatioToAmount(expense.amount, houseSplit)
  }
  if (expense.payer === SHARED_PAYER) {
    return applyRatioToAmount(expense.amount, houseSplit)
  }
  return [{ uid: expense.payer, shareCents: expense.amount }]
}

/**
 * Per-member cash contribution (who fronted the money, from their own wallet).
 *  - Single payer (uid) → 100% to that uid.
 *  - SPLIT_PAYER → each person's stored contribution. If splits are missing
 *    (malformed data), returns empty — the expense's amount is still present
 *    in the caller's `total`, and downstream dashboards treat missing SPLIT
 *    data via their own fallback (e.g. sumSharedPool is authoritative for the
 *    Shared bucket).
 *  - SHARED_PAYER → returns empty: joint-pool money is not attributed to any
 *    individual. Callers that need the pool total use sumSharedPool().
 */
export function getExpenseCashContribution(expense: Expense): ExpenseSplit[] {
  if (expense.payer === SHARED_PAYER) return []
  if (expense.payer === SPLIT_PAYER) {
    return expense.splits && expense.splits.length > 0 ? expense.splits : []
  }
  return [{ uid: expense.payer, shareCents: expense.amount }]
}

/** Aggregates allocation across many expenses into a uid → cents map. */
export function sumAllocations(
  expenses: Expense[],
  houseSplit: CostSplitShare[],
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    for (const a of getExpenseAllocation(e, houseSplit)) {
      totals.set(a.uid, (totals.get(a.uid) ?? 0) + a.shareCents)
    }
  }
  return totals
}

/** Aggregates cash contribution across many expenses into a uid → cents map. */
export function sumCashContributions(expenses: Expense[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    for (const c of getExpenseCashContribution(e)) {
      totals.set(c.uid, (totals.get(c.uid) ?? 0) + c.shareCents)
    }
  }
  return totals
}

/** Sum of expenses paid from the joint pool — the "Shared" column on the dashboard. */
export function sumSharedPool(expenses: Expense[]): number {
  let total = 0
  for (const e of expenses) {
    if (e.payer === SHARED_PAYER) total += e.amount
  }
  return total
}

/** Validates a custom per-expense split — must cover known members and sum to the total. */
export function isValidExpenseSplit(
  splits: ExpenseSplit[],
  totalCents: number,
  memberIds: string[],
): boolean {
  if (splits.length === 0) return false
  const memberSet = new Set(memberIds)
  if (splits.some((s) => !memberSet.has(s.uid) || s.shareCents < 0)) return false
  return splits.reduce((s, e) => s + e.shareCents, 0) === totalCents
}

/** Validates a household costSplit — must cover exactly current members and sum to 10000 bps. */
export function isValidHouseSplit(
  costSplit: CostSplitShare[],
  memberIds: string[],
): boolean {
  if (costSplit.length !== memberIds.length) return false
  const uidSet = new Set(memberIds)
  if (costSplit.some((s) => !uidSet.has(s.uid) || s.shareBps < 0)) return false
  return costSplit.reduce((s, e) => s + e.shareBps, 0) === TOTAL_BPS
}

/**
 * True if every member has the same share. Used to short-circuit UI ("Shared equally")
 * without doing bps math in view components.
 */
export function isEqualSplit(split: CostSplitShare[]): boolean {
  if (split.length === 0) return true
  const base = Math.floor(TOTAL_BPS / split.length)
  // Any member whose share deviates more than 1 bp from base is uneven
  return split.every((s) => Math.abs(s.shareBps - base) <= 1)
}
