import { describe, it, expect } from 'vitest'
import { SHARED_PAYER, SHARED_PAYER_COLOR, SHARED_PAYER_LABEL } from './constants'

describe('SHARED_PAYER constants', () => {
  it('sentinel value is the string "shared"', () => {
    expect(SHARED_PAYER).toBe('shared')
  })

  it('cannot collide with a Firebase Auth UID (UIDs are 28+ alphanumeric chars)', () => {
    // Firebase UIDs look like 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4'
    expect(SHARED_PAYER.length).toBeLessThan(28)
    expect(SHARED_PAYER).not.toMatch(/^[a-zA-Z0-9]{28,}$/)
  })

  it('has a display label', () => {
    expect(SHARED_PAYER_LABEL).toBe('Shared')
  })

  it('has a display color (valid hex)', () => {
    expect(SHARED_PAYER_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})

// Simulate the getMemberName / getMemberColor logic from HouseholdContext
// (the actual functions are in a React context, so we test the logic directly)

describe('getMemberName logic with shared payer', () => {
  const members = [
    { uid: 'alice-uid', displayName: 'Alice' },
    { uid: 'bob-uid', displayName: 'Bob' },
  ]

  function getMemberName(uid: string): string {
    if (uid === SHARED_PAYER) return SHARED_PAYER_LABEL
    return members.find((m) => m.uid === uid)?.displayName ?? 'Former member'
  }

  function getMemberColor(uid: string): string {
    if (uid === SHARED_PAYER) return SHARED_PAYER_COLOR
    const colors: Record<string, string> = { 'alice-uid': '#2a9d90', 'bob-uid': '#e76e50' }
    return colors[uid] ?? '#6b7280'
  }

  it('returns shared label for SHARED_PAYER', () => {
    expect(getMemberName(SHARED_PAYER)).toBe('Shared')
  })

  it('returns shared color for SHARED_PAYER', () => {
    expect(getMemberColor(SHARED_PAYER)).toBe(SHARED_PAYER_COLOR)
  })

  it('returns member name for a valid uid', () => {
    expect(getMemberName('alice-uid')).toBe('Alice')
    expect(getMemberName('bob-uid')).toBe('Bob')
  })

  it('returns member color for a valid uid', () => {
    expect(getMemberColor('alice-uid')).toBe('#2a9d90')
    expect(getMemberColor('bob-uid')).toBe('#e76e50')
  })

  it('returns "Former member" for orphaned payer (member who left)', () => {
    expect(getMemberName('deleted-member-uid')).toBe('Former member')
  })

  it('returns fallback gray for orphaned payer color', () => {
    expect(getMemberColor('deleted-member-uid')).toBe('#6b7280')
  })

  it('does not confuse a member named "Shared" with the sentinel', () => {
    const membersWithSharedName = [
      ...members,
      { uid: 'charlie-uid', displayName: 'Shared' },
    ]
    function getNameWithExtra(uid: string): string {
      if (uid === SHARED_PAYER) return SHARED_PAYER_LABEL
      return membersWithSharedName.find((m) => m.uid === uid)?.displayName ?? 'Unknown'
    }

    // The sentinel 'shared' resolves via the constant check, not member lookup
    expect(getNameWithExtra(SHARED_PAYER)).toBe('Shared')
    // A member named "Shared" resolves via uid lookup — different code path
    expect(getNameWithExtra('charlie-uid')).toBe('Shared')
    // They resolve via different mechanisms — no collision
    expect(SHARED_PAYER).not.toBe('charlie-uid')
  })
})
