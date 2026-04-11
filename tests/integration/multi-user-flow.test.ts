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
    const alice = testEnv.authenticatedContext('alice')
    const bob = testEnv.authenticatedContext('bob')
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

    const charlie = testEnv.authenticatedContext('charlie')
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

    const attacker = testEnv.authenticatedContext('attacker')
    const bob = testEnv.authenticatedContext('bob')

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

    const bob = testEnv.authenticatedContext('bob')
    const bobDb = bob.firestore()

    // Bob deletes his own member doc
    await assertSucceeds(bobDb.doc(`houses/${HOUSE_ID}/members/bob`).delete())

    // Bob deletes his own user profile
    await assertSucceeds(bobDb.doc('users/bob').delete())

    // Alice's data is untouched
    const alice = testEnv.authenticatedContext('alice')
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
})
