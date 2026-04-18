import { describe, it, expect } from 'vitest'
import { SHARED_PAYER, SPLIT_PAYER } from '@/lib/constants'
import { computeMonthlyTrend, FORMER_KEY } from './MonthlyTrend'
import type { Expense } from '@/types/expense'

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 10000,
    category: 'other',
    payer: 'alice',
    description: '',
    date: '2026-04-01',
    createdAt: '2026-04-01',
    updatedAt: '2026-04-01',
    ...overrides,
  }
}

const opts = {
  memberIds: new Set(['alice', 'bob']),
  memberOrder: ['alice', 'bob'],
  labels: { alice: 'Alice', bob: 'Bob' },
  colors: { alice: '#2a9d90', bob: '#e76e50' },
  sharedLabel: 'Shared',
  formerLabel: 'Former member',
}

describe('computeMonthlyTrend — SPLIT_PAYER handling', () => {
  it('regression: a Split payment distributes to contributors, never to "Former member"', () => {
    // €500 split €250 / €250 between Alice and Bob — matches the reported bug.
    const { segments, data } = computeMonthlyTrend(
      [
        expense({
          id: 'sp',
          amount: 50000,
          payer: SPLIT_PAYER,
          splits: [
            { uid: 'alice', shareCents: 25000 },
            { uid: 'bob', shareCents: 25000 },
          ],
        }),
      ],
      opts,
    )
    // Legend has Alice + Bob, NO Former / Split keys
    expect(segments.map((s) => s.key).sort()).toEqual(['alice', 'bob'])
    expect(segments.find((s) => s.key === FORMER_KEY)).toBeUndefined()
    expect(segments.find((s) => s.key === SPLIT_PAYER)).toBeUndefined()
    // Per-month bucket values
    expect(data[0]).toMatchObject({ month: '2026-04', alice: 25000, bob: 25000 })
  })

  it('keeps SHARED as its own series while distributing SPLIT to members', () => {
    const { segments, data } = computeMonthlyTrend(
      [
        expense({ id: 's', amount: 30000, payer: SHARED_PAYER }),
        expense({
          id: 'sp',
          amount: 20000,
          payer: SPLIT_PAYER,
          splits: [
            { uid: 'alice', shareCents: 15000 },
            { uid: 'bob', shareCents: 5000 },
          ],
        }),
        expense({ id: 'a', amount: 10000, payer: 'alice' }),
      ],
      opts,
    )
    expect(segments.map((s) => s.key)).toEqual([SHARED_PAYER, 'alice', 'bob'])
    expect(data[0]).toMatchObject({
      month: '2026-04',
      [SHARED_PAYER]: 30000,
      alice: 25000, // 15000 from split + 10000 single
      bob: 5000,
    })
  })

  it('orphaned uid inside a SPLIT expense lands in Former member (no silent drop)', () => {
    const { segments, data } = computeMonthlyTrend(
      [
        expense({
          id: 'sp',
          amount: 20000,
          payer: SPLIT_PAYER,
          splits: [
            { uid: 'alice', shareCents: 10000 },
            { uid: 'ghost', shareCents: 10000 },
          ],
        }),
      ],
      opts,
    )
    expect(segments.map((s) => s.key).sort()).toEqual([FORMER_KEY, 'alice'])
    expect(data[0]).toMatchObject({ month: '2026-04', alice: 10000, [FORMER_KEY]: 10000 })
  })

  it('malformed SPLIT with empty splits still surfaces the amount (Former bucket)', () => {
    const { segments, data } = computeMonthlyTrend(
      [expense({ id: 'bad', amount: 20000, payer: SPLIT_PAYER, splits: [] })],
      opts,
    )
    expect(segments.map((s) => s.key)).toEqual([FORMER_KEY])
    expect(data[0]).toMatchObject({ month: '2026-04', [FORMER_KEY]: 20000 })
  })

  it('single-payer Alice is unaffected by the SPLIT distribution code path', () => {
    const { segments, data } = computeMonthlyTrend(
      [expense({ id: 'a', amount: 10000, payer: 'alice' })],
      opts,
    )
    expect(segments.map((s) => s.key)).toEqual(['alice'])
    expect(data[0]).toMatchObject({ alice: 10000 })
  })

  it('sorts months chronologically', () => {
    const { data } = computeMonthlyTrend(
      [
        expense({ id: '1', date: '2026-05-01' }),
        expense({ id: '2', date: '2026-03-01' }),
        expense({ id: '3', date: '2026-04-01' }),
      ],
      opts,
    )
    expect(data.map((d) => d.month)).toEqual(['2026-03', '2026-04', '2026-05'])
  })
})
