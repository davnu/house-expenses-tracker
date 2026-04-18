import { describe, it, expect } from 'vitest'
import {
  TOTAL_BPS,
  getEffectiveHouseSplit,
  makeEqualSplit,
  applyRatioToAmount,
  getExpenseAllocation,
  getExpenseCashContribution,
  sumAllocations,
  sumCashContributions,
  sumSharedPool,
  isValidExpenseSplit,
  isValidHouseSplit,
  isEqualSplit,
} from './cost-split'
import { SHARED_PAYER, SPLIT_PAYER } from './constants'
import type { Expense } from '@/types/expense'

function mkExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: overrides.id ?? 'e1',
    amount: overrides.amount ?? 10000,
    category: overrides.category ?? 'other',
    payer: overrides.payer ?? SHARED_PAYER,
    description: overrides.description ?? '',
    date: overrides.date ?? '2026-01-01',
    createdAt: overrides.createdAt ?? '2026-01-01',
    updatedAt: overrides.updatedAt ?? '2026-01-01',
    ...overrides,
  }
}

describe('makeEqualSplit', () => {
  it('empty list → empty split', () => {
    expect(makeEqualSplit([])).toEqual([])
  })

  it('single member → 100% bps', () => {
    expect(makeEqualSplit(['alice'])).toEqual([{ uid: 'alice', shareBps: TOTAL_BPS }])
  })

  it('two members split exactly 50/50', () => {
    expect(makeEqualSplit(['a', 'b'])).toEqual([
      { uid: 'a', shareBps: 5000 },
      { uid: 'b', shareBps: 5000 },
    ])
  })

  it('three members — sum stays 10000, one member absorbs the 1 bp remainder', () => {
    const split = makeEqualSplit(['a', 'b', 'c'])
    expect(split.reduce((s, e) => s + e.shareBps, 0)).toBe(TOTAL_BPS)
    // 10000/3 = 3333 r 1 → one entry gets 3334, the other two 3333
    const shares = split.map((s) => s.shareBps).sort()
    expect(shares).toEqual([3333, 3333, 3334])
  })

  it('input order does not change the output (sorted by uid)', () => {
    const a = makeEqualSplit(['charlie', 'alice', 'bob'])
    const b = makeEqualSplit(['bob', 'charlie', 'alice'])
    expect(a).toEqual(b)
    expect(a.map((s) => s.uid)).toEqual(['alice', 'bob', 'charlie'])
  })
})

describe('getEffectiveHouseSplit', () => {
  it('falls back to equal split when no costSplit set', () => {
    expect(getEffectiveHouseSplit(['a', 'b'])).toEqual([
      { uid: 'a', shareBps: 5000 },
      { uid: 'b', shareBps: 5000 },
    ])
  })

  it('uses stored split when valid (sorted by uid)', () => {
    const stored = [{ uid: 'b', shareBps: 4000 }, { uid: 'a', shareBps: 6000 }]
    expect(getEffectiveHouseSplit(['a', 'b'], stored)).toEqual([
      { uid: 'a', shareBps: 6000 },
      { uid: 'b', shareBps: 4000 },
    ])
  })

  it('falls back to equal when stored split does not sum to 10000', () => {
    const bad = [{ uid: 'a', shareBps: 6000 }, { uid: 'b', shareBps: 3000 }]
    const result = getEffectiveHouseSplit(['a', 'b'], bad)
    expect(result).toEqual([{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }])
  })

  it('falls back to equal when stored split references an unknown uid', () => {
    const stale = [{ uid: 'a', shareBps: 6000 }, { uid: 'removed', shareBps: 4000 }]
    const result = getEffectiveHouseSplit(['a', 'b'], stale)
    expect(result).toEqual([{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }])
  })

  it('falls back to equal when member count differs from stored split', () => {
    const stored = [{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }]
    const result = getEffectiveHouseSplit(['a', 'b', 'c'], stored)
    expect(result.length).toBe(3)
    expect(result.reduce((s, e) => s + e.shareBps, 0)).toBe(TOTAL_BPS)
  })
})

describe('applyRatioToAmount', () => {
  it('empty ratio → empty result', () => {
    expect(applyRatioToAmount(10000, [])).toEqual([])
  })

  it('zero amount → all members get zero', () => {
    const r = applyRatioToAmount(0, [{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }])
    expect(r).toEqual([{ uid: 'a', shareCents: 0 }, { uid: 'b', shareCents: 0 }])
  })

  it('50/50 of €100 → €50 each', () => {
    const r = applyRatioToAmount(10000, [{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }])
    expect(r).toEqual([{ uid: 'a', shareCents: 5000 }, { uid: 'b', shareCents: 5000 }])
  })

  it('odd cents distribute without drift — sum equals total', () => {
    const ratio = [{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }]
    const r = applyRatioToAmount(10001, ratio)
    expect(r.reduce((s, e) => s + e.shareCents, 0)).toBe(10001)
  })

  it('60/40 of €333.33 distributes exactly — sum invariant', () => {
    const r = applyRatioToAmount(33333, [
      { uid: 'a', shareBps: 6000 },
      { uid: 'b', shareBps: 4000 },
    ])
    expect(r.reduce((s, e) => s + e.shareCents, 0)).toBe(33333)
    // Regardless of which member catches the remainder, each is within 1 cent
    // of the ratio-derived value (20000 and 13333).
    const a = r.find((x) => x.uid === 'a')!.shareCents
    const b = r.find((x) => x.uid === 'b')!.shareCents
    expect(Math.abs(a - 20000)).toBeLessThanOrEqual(1)
    expect(Math.abs(b - 13333)).toBeLessThanOrEqual(1)
  })

  it('three-way split of €100 sums exactly', () => {
    const ratio = makeEqualSplit(['a', 'b', 'c'])
    const r = applyRatioToAmount(10000, ratio)
    expect(r.reduce((s, e) => s + e.shareCents, 0)).toBe(10000)
  })

  it('remainder distribution is stable across different ratios (shape-based rotation)', () => {
    // Different uid sets should be allowed to land the remainder on different members.
    // The invariant tested here is simply that each call produces a correct total
    // and that the same input always gives the same output (determinism).
    const r1a = applyRatioToAmount(10001, [{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }])
    const r1b = applyRatioToAmount(10001, [{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }])
    expect(r1a).toEqual(r1b)
    expect(r1a.reduce((s, e) => s + e.shareCents, 0)).toBe(10001)
  })
})

describe('getExpenseAllocation', () => {
  const house2 = [{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }]

  it('single payer (uid) → 100% to that uid', () => {
    const e = mkExpense({ amount: 10000, payer: 'a' })
    expect(getExpenseAllocation(e, house2)).toEqual([{ uid: 'a', shareCents: 10000 }])
  })

  it('SHARED_PAYER → distributes by household ratio', () => {
    const e = mkExpense({ amount: 10000, payer: SHARED_PAYER })
    expect(getExpenseAllocation(e, house2)).toEqual([
      { uid: 'a', shareCents: 5000 },
      { uid: 'b', shareCents: 5000 },
    ])
  })

  it('SPLIT_PAYER → uses stored per-person amounts', () => {
    const e = mkExpense({
      amount: 10000,
      payer: SPLIT_PAYER,
      splits: [{ uid: 'a', shareCents: 7000 }, { uid: 'b', shareCents: 3000 }],
    })
    expect(getExpenseAllocation(e, house2)).toEqual([
      { uid: 'a', shareCents: 7000 },
      { uid: 'b', shareCents: 3000 },
    ])
  })

  it('SPLIT_PAYER with empty splits → falls back to household ratio (never silently drops)', () => {
    const e = mkExpense({ amount: 10000, payer: SPLIT_PAYER, splits: [] })
    expect(getExpenseAllocation(e, house2)).toEqual([
      { uid: 'a', shareCents: 5000 },
      { uid: 'b', shareCents: 5000 },
    ])
  })

  it('legacy: splits on a single-payer expense are ignored (new model, not allocation override)', () => {
    const e = mkExpense({
      amount: 10000,
      payer: 'a',
      splits: [{ uid: 'a', shareCents: 5000 }, { uid: 'b', shareCents: 5000 }],
    })
    expect(getExpenseAllocation(e, house2)).toEqual([{ uid: 'a', shareCents: 10000 }])
  })
})

describe('getExpenseCashContribution', () => {
  it('single payer → 100% to that uid', () => {
    const e = mkExpense({ amount: 10000, payer: 'a' })
    expect(getExpenseCashContribution(e)).toEqual([{ uid: 'a', shareCents: 10000 }])
  })

  it('SHARED_PAYER → empty (pool, not attributed to any individual)', () => {
    const e = mkExpense({ amount: 10000, payer: SHARED_PAYER })
    expect(getExpenseCashContribution(e)).toEqual([])
  })

  it('SPLIT_PAYER → per-person amounts from splits', () => {
    const e = mkExpense({
      amount: 10000,
      payer: SPLIT_PAYER,
      splits: [{ uid: 'a', shareCents: 6000 }, { uid: 'b', shareCents: 4000 }],
    })
    expect(getExpenseCashContribution(e)).toEqual([
      { uid: 'a', shareCents: 6000 },
      { uid: 'b', shareCents: 4000 },
    ])
  })

  it('orphaned (former) member as single payer → still credited', () => {
    const e = mkExpense({ amount: 10000, payer: 'gone' })
    expect(getExpenseCashContribution(e)).toEqual([{ uid: 'gone', shareCents: 10000 }])
  })
})

describe('sumSharedPool', () => {
  it('sums only shared-payer expense amounts', () => {
    const expenses = [
      mkExpense({ id: '1', amount: 10000, payer: SHARED_PAYER }),
      mkExpense({ id: '2', amount: 5000, payer: 'a' }),
      mkExpense({ id: '3', amount: 20000, payer: SHARED_PAYER }),
      mkExpense({
        id: '4',
        amount: 3000,
        payer: SPLIT_PAYER,
        splits: [{ uid: 'a', shareCents: 2000 }, { uid: 'b', shareCents: 1000 }],
      }),
    ]
    expect(sumSharedPool(expenses)).toBe(30000)
  })

  it('returns 0 when no shared expenses', () => {
    expect(sumSharedPool([mkExpense({ payer: 'a' })])).toBe(0)
  })
})

describe('sumAllocations + sumCashContributions', () => {
  const house2 = [{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }]

  it('shared-only expenses: cash is empty (pool), allocation distributes per ratio', () => {
    const expenses = [
      mkExpense({ id: '1', amount: 10000, payer: SHARED_PAYER }),
      mkExpense({ id: '2', amount: 20000, payer: SHARED_PAYER }),
    ]
    const alloc = sumAllocations(expenses, house2)
    const cash = sumCashContributions(expenses)
    // Allocation: 30000 split 50/50
    expect(alloc.get('a')).toBe(15000)
    expect(alloc.get('b')).toBe(15000)
    // Cash: pool, no per-person attribution
    expect(cash.get('a')).toBeUndefined()
    expect(cash.get('b')).toBeUndefined()
  })

  it('single payer: cash credits payer; allocation credits payer', () => {
    const expenses = [mkExpense({ amount: 10000, payer: 'a' })]
    const alloc = sumAllocations(expenses, house2)
    const cash = sumCashContributions(expenses)
    expect(cash.get('a')).toBe(10000)
    expect(alloc.get('a')).toBe(10000)
  })

  it('SPLIT_PAYER: cash and allocation both come from splits (equal in this model)', () => {
    const expenses = [
      mkExpense({
        id: '1',
        amount: 10000,
        payer: SPLIT_PAYER,
        splits: [{ uid: 'a', shareCents: 7000 }, { uid: 'b', shareCents: 3000 }],
      }),
    ]
    const alloc = sumAllocations(expenses, house2)
    const cash = sumCashContributions(expenses)
    expect(alloc.get('a')).toBe(7000)
    expect(alloc.get('b')).toBe(3000)
    expect(cash.get('a')).toBe(7000)
    expect(cash.get('b')).toBe(3000)
  })

  it('mixed expenses: each payer kind contributes to totals correctly', () => {
    const expenses = [
      mkExpense({ id: '1', amount: 10000, payer: 'a' }),      // single: Alice
      mkExpense({ id: '2', amount: 20000, payer: SHARED_PAYER }), // pool
      mkExpense({
        id: '3',
        amount: 5000,
        payer: SPLIT_PAYER,
        splits: [{ uid: 'a', shareCents: 2000 }, { uid: 'b', shareCents: 3000 }],
      }),
    ]
    const cash = sumCashContributions(expenses)
    // Alice cash: 10000 (single) + 2000 (split share) = 12000
    expect(cash.get('a')).toBe(12000)
    // Bob cash: 0 (no single) + 3000 (split share) = 3000
    expect(cash.get('b')).toBe(3000)
    // Shared pool stays separate
    expect(sumSharedPool(expenses)).toBe(20000)
  })
})

describe('isValidExpenseSplit', () => {
  it('accepts splits that sum to the total', () => {
    expect(
      isValidExpenseSplit(
        [{ uid: 'a', shareCents: 6000 }, { uid: 'b', shareCents: 4000 }],
        10000,
        ['a', 'b'],
      ),
    ).toBe(true)
  })

  it('rejects splits that do not sum to total', () => {
    expect(
      isValidExpenseSplit([{ uid: 'a', shareCents: 6000 }], 10000, ['a', 'b']),
    ).toBe(false)
  })

  it('rejects unknown uids', () => {
    expect(
      isValidExpenseSplit(
        [{ uid: 'a', shareCents: 5000 }, { uid: 'ghost', shareCents: 5000 }],
        10000,
        ['a', 'b'],
      ),
    ).toBe(false)
  })

  it('rejects negative shares', () => {
    expect(
      isValidExpenseSplit(
        [{ uid: 'a', shareCents: 11000 }, { uid: 'b', shareCents: -1000 }],
        10000,
        ['a', 'b'],
      ),
    ).toBe(false)
  })

  it('rejects empty splits', () => {
    expect(isValidExpenseSplit([], 10000, ['a', 'b'])).toBe(false)
  })
})

describe('isValidHouseSplit', () => {
  it('accepts split that covers exactly current members and sums to 10000', () => {
    expect(
      isValidHouseSplit(
        [{ uid: 'a', shareBps: 6000 }, { uid: 'b', shareBps: 4000 }],
        ['a', 'b'],
      ),
    ).toBe(true)
  })

  it('rejects when sum is off', () => {
    expect(
      isValidHouseSplit(
        [{ uid: 'a', shareBps: 6000 }, { uid: 'b', shareBps: 3999 }],
        ['a', 'b'],
      ),
    ).toBe(false)
  })

  it('rejects stale split (missing current member)', () => {
    expect(
      isValidHouseSplit([{ uid: 'a', shareBps: TOTAL_BPS }], ['a', 'b']),
    ).toBe(false)
  })
})

describe('isEqualSplit', () => {
  it('true for empty', () => {
    expect(isEqualSplit([])).toBe(true)
  })

  it('true for 50/50', () => {
    expect(isEqualSplit([{ uid: 'a', shareBps: 5000 }, { uid: 'b', shareBps: 5000 }])).toBe(true)
  })

  it('true for 3-way equal (accepts 1 bp rounding)', () => {
    expect(
      isEqualSplit([
        { uid: 'a', shareBps: 3334 },
        { uid: 'b', shareBps: 3333 },
        { uid: 'c', shareBps: 3333 },
      ]),
    ).toBe(true)
  })

  it('false for 60/40', () => {
    expect(isEqualSplit([{ uid: 'a', shareBps: 6000 }, { uid: 'b', shareBps: 4000 }])).toBe(false)
  })
})
