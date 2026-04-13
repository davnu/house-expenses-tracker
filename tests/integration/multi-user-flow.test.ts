import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import fs from 'fs'
import path from 'path'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {
      host: '127.0.0.1',
      port: 5180,
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

describe('Full house creation and invite flow', () => {
  const HOUSE_ID = 'house-abc'
  const INVITE_ID = 'invite-xyz'

  it('user A creates house, user B joins via invite, both share expenses', async () => {
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    const aliceDb = alice.firestore()
    const bobDb = bob.firestore()

    // ── Step 1: Alice creates a house ──
    await assertSucceeds(
      aliceDb.doc(`houses/${HOUSE_ID}`).set({
        name: 'Casa Bella',
        ownerId: 'alice',
        memberIds: ['alice'],
        createdAt: new Date().toISOString(),
      })
    )

    // ── Step 2: Alice adds herself as member ──
    await assertSucceeds(
      aliceDb.doc(`houses/${HOUSE_ID}/members/alice`).set({
        displayName: 'Alice',
        email: 'alice@test.com',
        color: '#3b82f6',
        role: 'owner',
        joinedAt: new Date().toISOString(),
      })
    )

    // ── Step 3: Alice creates her user profile (with houseId already set) ──
    await assertSucceeds(
      aliceDb.doc('users/alice').set({
        displayName: 'Alice',
        email: 'alice@test.com',
        houseId: HOUSE_ID,
        createdAt: new Date().toISOString(),
      })
    )

    // ── Step 4: Alice creates an invite ──
    await assertSucceeds(
      aliceDb.doc(`invites/${INVITE_ID}`).set({
        houseId: HOUSE_ID,
        houseName: 'Casa Bella',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
    )

    // ── Step 6: Bob (outsider) can read the invite ──
    const inviteSnap = await assertSucceeds(bobDb.doc(`invites/${INVITE_ID}`).get())
    expect(inviteSnap.data()?.houseName).toBe('Casa Bella')

    // ── Step 7: Bob cannot read expenses yet (not a member) ──
    await assertFails(bobDb.collection(`houses/${HOUSE_ID}/expenses`).get())

    // ── Step 8: Bob marks invite as used ──
    await assertSucceeds(
      bobDb.doc(`invites/${INVITE_ID}`).update({
        usedBy: 'bob',
        usedAt: new Date().toISOString(),
      })
    )

    // ── Step 9: Bob creates his user profile ──
    await assertSucceeds(
      bobDb.doc('users/bob').set({
        displayName: 'Bob',
        email: 'bob@test.com',
        houseId: HOUSE_ID,
        createdAt: new Date().toISOString(),
      })
    )

    // ── Step 10: Bob adds himself as member ──
    await assertSucceeds(
      bobDb.doc(`houses/${HOUSE_ID}/members/bob`).set({
        displayName: 'Bob',
        email: 'bob@test.com',
        color: '#ef4444',
        role: 'member',
        joinedAt: new Date().toISOString(),
      })
    )

    // ── Step 11: Bob can now read expenses ──
    await assertSucceeds(bobDb.collection(`houses/${HOUSE_ID}/expenses`).get())

    // ── Step 12: Alice creates an expense ──
    const expenseRef = await assertSucceeds(
      aliceDb.collection(`houses/${HOUSE_ID}/expenses`).add({
        amount: 250000,
        category: 'notary_legal',
        payer: 'alice',
        description: 'Notary fees',
        date: '2025-07-15',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )

    // ── Step 13: Bob can read Alice's expense ──
    const expenseSnap = await assertSucceeds(
      bobDb.doc(`houses/${HOUSE_ID}/expenses/${expenseRef.id}`).get()
    )
    expect(expenseSnap.data()?.amount).toBe(250000)
    expect(expenseSnap.data()?.payer).toBe('alice')

    // ── Step 14: Bob creates an expense too ──
    await assertSucceeds(
      bobDb.collection(`houses/${HOUSE_ID}/expenses`).add({
        amount: 45000,
        category: 'home_inspection',
        payer: 'bob',
        description: 'Home inspection',
        date: '2025-07-20',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )

    // ── Step 15: Alice can see all expenses (hers + Bob's) ──
    const allExpenses = await assertSucceeds(
      aliceDb.collection(`houses/${HOUSE_ID}/expenses`).get()
    )
    expect(allExpenses.size).toBe(2)
  })

  it('outsider cannot access house data even with known house ID', async () => {
    // Seed a house with Alice
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc(`houses/${HOUSE_ID}`).set({
        name: 'Private House',
        ownerId: 'alice',
        memberIds: ['alice'],
      })
      await db.doc(`houses/${HOUSE_ID}/members/alice`).set({
        displayName: 'Alice',
        email: 'alice@test.com',
        color: '#3b82f6',
        role: 'owner',
      })
      await db.collection(`houses/${HOUSE_ID}/expenses`).add({
        amount: 100000,
        category: 'down_payment',
        payer: 'alice',
      })
      await db.doc(`houses/${HOUSE_ID}/meta/mortgage`).set({
        principal: 30000000,
        annualRate: 3.5,
      })
    })

    const charlie = testEnv.authenticatedContext('charlie', { email_verified: true })
    const db = charlie.firestore()

    // Charlie can read house doc (by design — needed for invite flow)
    await assertSucceeds(db.doc(`houses/${HOUSE_ID}`).get())

    // But cannot access any sub-collections
    await assertFails(db.collection(`houses/${HOUSE_ID}/expenses`).get())
    await assertFails(db.doc(`houses/${HOUSE_ID}/members/alice`).get())
    await assertFails(db.doc(`houses/${HOUSE_ID}/meta/mortgage`).get())

    // Cannot modify the house
    await assertFails(db.doc(`houses/${HOUSE_ID}`).update({ name: 'Hijacked' }))
  })

  it('unused invite can be claimed, but sensitive fields cannot be changed', async () => {
    // Create an unused invite
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`invites/${INVITE_ID}`).set({
        houseId: HOUSE_ID,
        houseName: 'Casa Bella',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    })

    const attacker = testEnv.authenticatedContext('attacker', { email_verified: true })
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })

    // Cannot redirect invite to a different house
    await assertFails(
      attacker.firestore().doc(`invites/${INVITE_ID}`).update({
        houseId: 'attacker-house',
      })
    )

    // Cannot change the creator
    await assertFails(
      attacker.firestore().doc(`invites/${INVITE_ID}`).update({
        createdBy: 'attacker',
      })
    )

    // Bob can claim the invite (only usedBy + usedAt)
    await assertSucceeds(
      bob.firestore().doc(`invites/${INVITE_ID}`).update({
        usedBy: 'bob',
        usedAt: new Date().toISOString(),
      })
    )
  })

  it('user belongs to multiple houses simultaneously', async () => {
    // Alice creates house 1
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()

    await assertSucceeds(
      aliceDb.doc('houses/house-1').set({
        name: 'House One', ownerId: 'alice', memberIds: ['alice'], createdAt: new Date().toISOString(),
      })
    )
    await assertSucceeds(
      aliceDb.doc('houses/house-1/members/alice').set({
        displayName: 'Alice', email: 'alice@test.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
    )

    // Alice creates house 2
    await assertSucceeds(
      aliceDb.doc('houses/house-2').set({
        name: 'House Two', ownerId: 'alice', memberIds: ['alice'], createdAt: new Date().toISOString(),
      })
    )
    await assertSucceeds(
      aliceDb.doc('houses/house-2/members/alice').set({
        displayName: 'Alice', email: 'alice@test.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
    )

    // Verify Alice can access both houses' subcollections
    await assertSucceeds(aliceDb.collection('houses/house-1/expenses').get())
    await assertSucceeds(aliceDb.collection('houses/house-2/expenses').get())

    // Alice can add expenses to both houses
    await assertSucceeds(
      aliceDb.collection('houses/house-1/expenses').add({
        amount: 100000, category: 'other', payer: 'alice', date: '2025-01-01',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    )
    await assertSucceeds(
      aliceDb.collection('houses/house-2/expenses').add({
        amount: 200000, category: 'furniture', payer: 'alice', date: '2025-01-01',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    )
  })

  it('user joins second house via invite while already in first', async () => {
    // Setup: Alice owns house-1, Bob owns house-2
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('houses/house-1').set({
        name: 'House One', ownerId: 'alice', memberIds: ['alice'], createdAt: new Date().toISOString(),
      })
      await db.doc('houses/house-1/members/alice').set({
        displayName: 'Alice', email: 'alice@test.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc('houses/house-2').set({
        name: 'House Two', ownerId: 'bob', memberIds: ['bob'], createdAt: new Date().toISOString(),
      })
      await db.doc('houses/house-2/members/bob').set({
        displayName: 'Bob', email: 'bob@test.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc('users/alice').set({ displayName: 'Alice', email: 'alice@test.com', houseId: 'house-1' })
      // Create invite for house-2
      await db.doc('invites/inv-h2').set({
        houseId: 'house-2', houseName: 'House Two', createdBy: 'bob',
        createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()

    // Alice marks invite as used and joins house-2
    await assertSucceeds(aliceDb.doc('invites/inv-h2').update({ usedBy: 'alice', usedAt: new Date().toISOString() }))
    await assertSucceeds(
      aliceDb.doc('houses/house-2/members/alice').set({
        displayName: 'Alice', email: 'alice@test.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
    )
    await assertSucceeds(aliceDb.doc('houses/house-2').update({
      memberIds: ['bob', 'alice'],
    }))

    // Alice can now access both houses
    await assertSucceeds(aliceDb.collection('houses/house-1/expenses').get())
    await assertSucceeds(aliceDb.collection('houses/house-2/expenses').get())
  })

  it('member leaves a household', async () => {
    // Setup: Alice owns house with Bob as member
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('users/bob').set({ displayName: 'Bob', email: 'b@t.com', houseId: HOUSE_ID })
      await db.doc(`houses/${HOUSE_ID}`).set({
        name: 'Casa Bella', ownerId: 'alice', memberIds: ['alice', 'bob'], createdAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/members/alice`).set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/members/bob`).set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
    })

    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    const bobDb = bob.firestore()

    // Bob leaves: removes self from memberIds, deletes own member doc, clears houseId
    await assertSucceeds(bobDb.doc(`houses/${HOUSE_ID}`).update({
      memberIds: ['alice'],
    }))
    await assertSucceeds(bobDb.doc(`houses/${HOUSE_ID}/members/bob`).delete())
    await assertSucceeds(bobDb.doc('users/bob').update({ houseId: null }))

    // Alice's data is intact
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()
    const houseSnap = await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}`).get())
    expect(houseSnap.data()?.memberIds).toEqual(['alice'])

    // Bob has lost access to expenses (no longer a member)
    await assertFails(bobDb.collection(`houses/${HOUSE_ID}/expenses`).get())

    // Bob can still read the house doc (by design — needed for invite flow)
    await assertSucceeds(bobDb.doc(`houses/${HOUSE_ID}`).get())
  })

  it('owner deletes household with cascading cleanup', async () => {
    // Setup: Alice owns house with expenses and members
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc(`houses/${HOUSE_ID}`).set({
        name: 'Casa Bella', ownerId: 'alice', memberIds: ['alice', 'bob'], createdAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/members/alice`).set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/members/bob`).set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/expenses/exp1`).set({
        amount: 100000, category: 'other', payer: 'alice', date: '2025-01-01',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/meta/mortgage`).set({
        principal: 30000000, annualRate: 3.5,
      })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()

    // Cascading delete: subcollections first, then house doc
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/expenses/exp1`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/meta/mortgage`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/members/bob`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/members/alice`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}`).delete())

    // House is gone — outsider reads should still work for top-level (by-design)
    // but subcollections will fail or return empty
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    const bobDb = bob.firestore()
    const houseSnap = await assertSucceeds(bobDb.doc(`houses/${HOUSE_ID}`).get())
    expect(houseSnap.exists).toBe(false)
  })

  it('deletion of one house does not affect another', async () => {
    // Setup: Alice owns two houses
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('houses/house-keep').set({
        name: 'Keep This', ownerId: 'alice', memberIds: ['alice'], createdAt: new Date().toISOString(),
      })
      await db.doc('houses/house-keep/members/alice').set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc('houses/house-keep/expenses/exp1').set({
        amount: 50000, category: 'furniture', payer: 'alice', date: '2025-01-01',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
      await db.doc('houses/house-delete').set({
        name: 'Delete This', ownerId: 'alice', memberIds: ['alice'], createdAt: new Date().toISOString(),
      })
      await db.doc('houses/house-delete/members/alice').set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()

    // Delete one house
    await assertSucceeds(aliceDb.doc('houses/house-delete/members/alice').delete())
    await assertSucceeds(aliceDb.doc('houses/house-delete').delete())

    // Other house is untouched
    const keptHouse = await assertSucceeds(aliceDb.doc('houses/house-keep').get())
    expect(keptHouse.data()?.name).toBe('Keep This')
    const keptExpenses = await assertSucceeds(aliceDb.collection('houses/house-keep/expenses').get())
    expect(keptExpenses.size).toBe(1)
  })

  it('owner account deletion cascades: owned house and all its data are deleted', async () => {
    // Setup: Alice owns house with expenses, Bob is a member
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('users/alice').set({ displayName: 'Alice', email: 'a@t.com', houseId: HOUSE_ID })
      await db.doc('users/bob').set({ displayName: 'Bob', email: 'b@t.com', houseId: HOUSE_ID })
      await db.doc(`houses/${HOUSE_ID}`).set({
        name: 'Casa Bella', ownerId: 'alice', memberIds: ['alice', 'bob'], createdAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/members/alice`).set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/members/bob`).set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/expenses/exp1`).set({
        amount: 100000, category: 'other', payer: 'alice', date: '2025-01-01',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/meta/mortgage`).set({ principal: 30000000 })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()

    // Simulate account deletion cascade: delete subcollections, members, then house
    // (In the app, AuthContext.cascadeDeleteHouse does this after Firebase Auth deletion)
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/expenses/exp1`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/meta/mortgage`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/members/bob`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/members/alice`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}`).delete())

    // Alice deletes her own profile
    await assertSucceeds(aliceDb.doc('users/alice').delete())

    // House is completely gone
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    const bobDb = bob.firestore()
    const houseSnap = await assertSucceeds(bobDb.doc(`houses/${HOUSE_ID}`).get())
    expect(houseSnap.exists).toBe(false)

    // Bob's profile is untouched (only houseId would be cleared by app code)
    const bobProfile = await assertSucceeds(bobDb.doc('users/bob').get())
    expect(bobProfile.data()?.displayName).toBe('Bob')
  })

  it('owner with multiple houses: deleting account cascades all owned houses', async () => {
    // Setup: Alice owns house-1 and house-2, Bob is in house-1
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('users/alice').set({ displayName: 'Alice', email: 'a@t.com', houseId: 'house-1' })
      await db.doc('users/bob').set({ displayName: 'Bob', email: 'b@t.com', houseId: 'house-1' })
      await db.doc('houses/house-1').set({
        name: 'House One', ownerId: 'alice', memberIds: ['alice', 'bob'], createdAt: new Date().toISOString(),
      })
      await db.doc('houses/house-1/members/alice').set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc('houses/house-1/members/bob').set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
      await db.doc('houses/house-2').set({
        name: 'House Two', ownerId: 'alice', memberIds: ['alice'], createdAt: new Date().toISOString(),
      })
      await db.doc('houses/house-2/members/alice').set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc('houses/house-2/expenses/exp1').set({
        amount: 50000, category: 'furniture', payer: 'alice', date: '2025-01-01',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()

    // Cascade delete house-1
    await assertSucceeds(aliceDb.doc('houses/house-1/members/bob').delete())
    await assertSucceeds(aliceDb.doc('houses/house-1/members/alice').delete())
    await assertSucceeds(aliceDb.doc('houses/house-1').delete())

    // Cascade delete house-2
    await assertSucceeds(aliceDb.doc('houses/house-2/expenses/exp1').delete())
    await assertSucceeds(aliceDb.doc('houses/house-2/members/alice').delete())
    await assertSucceeds(aliceDb.doc('houses/house-2').delete())

    // Delete profile
    await assertSucceeds(aliceDb.doc('users/alice').delete())

    // Both houses are gone
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    const bobDb = bob.firestore()
    const h1 = await assertSucceeds(bobDb.doc('houses/house-1').get())
    expect(h1.exists).toBe(false)
    const h2 = await assertSucceeds(bobDb.doc('houses/house-2').get())
    expect(h2.exists).toBe(false)

    // Bob's profile survives
    const bobProfile = await assertSucceeds(bobDb.doc('users/bob').get())
    expect(bobProfile.data()?.displayName).toBe('Bob')
  })

  it('account deletion: user removes own data, other members unaffected', async () => {
    // Set up: Alice owns house, Bob is member, both have expenses
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc(`users/alice`).set({ displayName: 'Alice', email: 'a@t.com', houseId: HOUSE_ID })
      await db.doc(`users/bob`).set({ displayName: 'Bob', email: 'b@t.com', houseId: HOUSE_ID })
      await db.doc(`houses/${HOUSE_ID}`).set({
        name: 'Casa Bella',
        ownerId: 'alice',
        memberIds: ['alice', 'bob'],
      })
      await db.doc(`houses/${HOUSE_ID}/members/alice`).set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner',
      })
      await db.doc(`houses/${HOUSE_ID}/members/bob`).set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member',
      })
      await db.collection(`houses/${HOUSE_ID}/expenses`).doc('exp-alice').set({
        amount: 100000, category: 'other', payer: 'alice', date: '2025-07-15',
      })
      await db.collection(`houses/${HOUSE_ID}/expenses`).doc('exp-bob').set({
        amount: 50000, category: 'other', payer: 'bob', date: '2025-07-20',
      })
    })

    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    const bobDb = bob.firestore()

    // Bob deletes his own member doc
    await assertSucceeds(bobDb.doc(`houses/${HOUSE_ID}/members/bob`).delete())

    // Bob deletes his own user profile
    await assertSucceeds(bobDb.doc('users/bob').delete())

    // Alice's data is untouched
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()
    const aliceProfile = await assertSucceeds(aliceDb.doc('users/alice').get())
    expect(aliceProfile.data()?.displayName).toBe('Alice')

    // Alice can still read expenses
    const expenses = await assertSucceeds(aliceDb.collection(`houses/${HOUSE_ID}/expenses`).get())
    expect(expenses.size).toBe(2) // Both expenses still exist

    // Alice can still read her own member doc
    const aliceMember = await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/members/alice`).get())
    expect(aliceMember.data()?.role).toBe('owner')
  })

  it('soft-delete: owner sets deletedAt, then cascade deletes subcollections', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('users/alice').set({ displayName: 'Alice', email: 'a@t.com', houseId: HOUSE_ID })
      await db.doc('users/bob').set({ displayName: 'Bob', email: 'b@t.com', houseId: HOUSE_ID })
      await db.doc(`houses/${HOUSE_ID}`).set({
        name: 'Casa Bella', ownerId: 'alice', memberIds: ['alice', 'bob'], createdAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/members/alice`).set({
        displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/members/bob`).set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
      await db.doc(`houses/${HOUSE_ID}/expenses/exp1`).set({
        amount: 100000, category: 'other', payer: 'alice', date: '2025-01-01',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()

    // Step 1: Owner soft-deletes (sets deletedAt)
    await assertSucceeds(
      aliceDb.doc(`houses/${HOUSE_ID}`).update({ deletedAt: new Date().toISOString() })
    )

    // House doc still exists but has deletedAt field
    const houseSnap = await aliceDb.doc(`houses/${HOUSE_ID}`).get()
    expect(houseSnap.data()?.deletedAt).toBeTruthy()

    // Step 2: Client-side cascade — delete subcollections then house doc
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/expenses/exp1`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/members/bob`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}/members/alice`).delete())
    await assertSucceeds(aliceDb.doc(`houses/${HOUSE_ID}`).delete())

    // House is completely gone
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    const afterSnap = await assertSucceeds(bob.firestore().doc(`houses/${HOUSE_ID}`).get())
    expect(afterSnap.exists).toBe(false)
  })
})
