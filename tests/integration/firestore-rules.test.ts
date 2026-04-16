import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'
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

// ── Helpers ──────────────────────────────────────────────────────────

/** Set up a house with one member using admin (rules-bypassed) context */
async function seedHouseWithMember(houseId: string, memberId: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await db.doc(`houses/${houseId}`).set({
      name: 'Test House',
      ownerId: memberId,
      memberIds: [memberId],
      createdAt: new Date().toISOString(),
    })
    await db.doc(`houses/${houseId}/members/${memberId}`).set({
      displayName: 'Owner',
      email: 'owner@test.com',
      color: '#3b82f6',
      role: 'owner',
      joinedAt: new Date().toISOString(),
    })
  })
}

// ── User Profiles ────────────────────────────────────────────────────

describe('User profiles (/users/{userId})', () => {
  it('authenticated user can read any profile', async () => {
    // Seed a profile
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/alice').set({ displayName: 'Alice', email: 'a@t.com' })
    })

    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertSucceeds(bob.firestore().doc('users/alice').get())
  })

  it('user can write their own profile', async () => {
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('users/alice').set({ displayName: 'Alice', email: 'a@t.com' })
    )
  })

  it('user cannot write another user profile', async () => {
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(
      bob.firestore().doc('users/alice').set({ displayName: 'Hacked', email: 'h@t.com' })
    )
  })

  it('unauthenticated user cannot read profiles', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/alice').set({ displayName: 'Alice', email: 'a@t.com' })
    })

    const unauthed = testEnv.unauthenticatedContext()
    await assertFails(unauthed.firestore().doc('users/alice').get())
  })

  it('user can delete their own profile (account deletion)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/alice').set({ displayName: 'Alice', email: 'a@t.com' })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('users/alice').delete())
  })

  it('user cannot delete another user profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/bob').set({ displayName: 'Bob', email: 'b@t.com' })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(alice.firestore().doc('users/bob').delete())
  })

  it('house owner can clear a removed member houseId', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/bob').set({ displayName: 'Bob', email: 'b@t.com', houseId: 'house1' })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('users/bob').update({ houseId: null }))
  })

  it('house owner cannot change other fields on another user', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/bob').set({ displayName: 'Bob', email: 'b@t.com', houseId: 'house1' })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(alice.firestore().doc('users/bob').update({ houseId: null, displayName: 'Hacked' }))
  })

  it('non-owner cannot clear another user houseId', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
      await ctx.firestore().doc('users/charlie').set({ displayName: 'Charlie', email: 'c@t.com', houseId: 'house1' })
    })
    // Bob is a member but not the owner — cannot clear Charlie's houseId
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(bob.firestore().doc('users/charlie').update({ houseId: null }))
  })
})

// ── Houses ───────────────────────────────────────────────────────────

describe('Houses (/houses/{houseId})', () => {
  it('owner can create a house with their uid as ownerId', async () => {
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1').set({
        name: 'Our House',
        ownerId: 'alice',
        memberIds: ['alice'],
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('cannot create a house with someone else as ownerId', async () => {
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(
      bob.firestore().doc('houses/house1').set({
        name: 'Fake House',
        ownerId: 'alice',
        memberIds: ['alice'],
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('any authenticated user can read a house (needed for invite flow)', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertSucceeds(outsider.firestore().doc('houses/house1').get())
  })

  it('member can update house', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('houses/house1').update({ name: 'Renamed' }))
  })

  it('non-member cannot update house', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().doc('houses/house1').update({ name: 'Hacked' }))
  })

  it('joining user can add themselves to memberIds', async () => {
    await seedHouseWithMember('house1', 'alice')
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertSucceeds(
      bob.firestore().doc('houses/house1').update({
        memberIds: firebase.firestore.FieldValue.arrayUnion('bob'),
      })
    )
  })

  it('joining user cannot change house name while adding to memberIds', async () => {
    await seedHouseWithMember('house1', 'alice')
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(
      bob.firestore().doc('houses/house1').update({
        memberIds: firebase.firestore.FieldValue.arrayUnion('bob'),
        name: 'Hijacked',
      })
    )
  })

  it('non-member cannot update house name', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().doc('houses/house1').update({ name: 'Hacked' }))
  })

  it('owner can delete a house', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('houses/house1').delete())
  })

  it('non-owner member cannot delete a house', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob', email: 'bob@test.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
    })
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(bob.firestore().doc('houses/house1').delete())
  })

  it('non-member cannot delete a house', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().doc('houses/house1').delete())
  })

  it('owner can soft-delete a house (set deletedAt)', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1').update({ deletedAt: new Date().toISOString() })
    )
  })

  it('non-owner member cannot soft-delete a house', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob', email: 'bob@test.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
    })
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(
      bob.firestore().doc('houses/house1').update({ deletedAt: new Date().toISOString() })
    )
  })
})

// ── Members ──────────────────────────────────────────────────────────

describe('Members (/houses/{houseId}/members/{memberId})', () => {
  it('member can read other members', async () => {
    await seedHouseWithMember('house1', 'alice')
    // Add bob as member too
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob',
        email: 'b@t.com',
        color: '#ef4444',
        role: 'member',
        joinedAt: new Date().toISOString(),
      })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('houses/house1/members/bob').get())
  })

  it('non-member cannot read members', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().doc('houses/house1/members/alice').get())
  })

  it('user can create their own member doc when joining', async () => {
    await seedHouseWithMember('house1', 'alice')
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertSucceeds(
      bob.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob',
        email: 'b@t.com',
        color: '#ef4444',
        role: 'member',
        joinedAt: new Date().toISOString(),
      })
    )
  })

  it('non-member cannot create a member doc for themselves in a house they are not in', async () => {
    // Create a house but don't add outsider as member
    await seedHouseWithMember('house1', 'alice')
    // Outsider who is NOT a member and NOT creating their own doc
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(
      outsider.firestore().doc('houses/house1/members/charlie').set({
        displayName: 'Charlie',
        email: 'c@t.com',
        color: '#22c55e',
        role: 'member',
        joinedAt: new Date().toISOString(),
      })
    )
  })

  it('user can update only their own member doc', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/members/alice').update({ displayName: 'Alice Updated' })
    )
  })

  it('user cannot update another member doc', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob',
        email: 'b@t.com',
        color: '#ef4444',
        role: 'member',
        joinedAt: new Date().toISOString(),
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(
      alice.firestore().doc('houses/house1/members/bob').update({ displayName: 'Hacked' })
    )
  })

  it('user can delete their own member doc (account deletion)', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('houses/house1/members/alice').delete())
  })

  it('non-owner member cannot delete another member doc', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
      await ctx.firestore().doc('houses/house1/members/charlie').set({
        displayName: 'Charlie', email: 'c@t.com', color: '#22c55e', role: 'member', joinedAt: new Date().toISOString(),
      })
    })
    // Bob (non-owner) cannot delete Charlie
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(bob.firestore().doc('houses/house1/members/charlie').delete())
  })

  it('owner can delete another member doc (remove member)', async () => {
    await seedHouseWithMember('house1', 'alice') // alice is owner
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob', email: 'b@t.com', color: '#ef4444', role: 'member', joinedAt: new Date().toISOString(),
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('houses/house1/members/bob').delete())
  })
})

// ── Expenses ─────────────────────────────────────────────────────────

describe('Expenses (/houses/{houseId}/expenses/{expenseId})', () => {
  it('member can create an expense', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().collection('houses/house1/expenses').add({
        amount: 150000,
        category: 'notary_legal',
        payer: 'alice',
        description: 'Notary fees',
        date: '2025-07-15',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
  })

  it('member can read expenses', async () => {
    await seedHouseWithMember('house1', 'alice')
    // Add expense via admin
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('houses/house1/expenses').add({
        amount: 50000,
        category: 'other',
        payer: 'alice',
        description: 'Test',
        date: '2025-07-15',
      })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().collection('houses/house1/expenses').get())
  })

  it('non-member cannot read expenses', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().collection('houses/house1/expenses').get())
  })

  it('non-member cannot create an expense', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(
      outsider.firestore().collection('houses/house1/expenses').add({
        amount: 100,
        category: 'other',
        payer: 'outsider',
        description: 'Sneaky',
        date: '2025-07-15',
      })
    )
  })
})

// ── Invites ──────────────────────────────────────────────────────────

describe('Invites (/invites/{inviteId})', () => {
  it('unauthenticated user can read invites', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/invite1').set({
        houseId: 'house1',
        houseName: 'Test House',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    })

    const unauthed = testEnv.unauthenticatedContext()
    await assertSucceeds(unauthed.firestore().doc('invites/invite1').get())
  })

  it('authenticated user can create an invite', async () => {
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('invites/invite2').set({
        houseId: 'house1',
        houseName: 'Test House',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    )
  })

  it('unauthenticated user cannot create an invite', async () => {
    const unauthed = testEnv.unauthenticatedContext()
    await assertFails(
      unauthed.firestore().doc('invites/invite3').set({
        houseId: 'house1',
        houseName: 'Test House',
        createdBy: 'nobody',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    )
  })

  it('can update only usedBy and usedAt fields', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/invite1').set({
        houseId: 'house1',
        houseName: 'Test House',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    })

    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertSucceeds(
      bob.firestore().doc('invites/invite1').update({
        usedBy: 'bob',
        usedAt: new Date().toISOString(),
      })
    )
  })

  it('cannot update houseId on invite (security fix)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/invite1').set({
        houseId: 'house1',
        houseName: 'Test House',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    })

    const attacker = testEnv.authenticatedContext('attacker', { email_verified: true })
    await assertFails(
      attacker.firestore().doc('invites/invite1').update({
        houseId: 'attacker-house',
        usedBy: 'attacker',
        usedAt: new Date().toISOString(),
      })
    )
  })

  it('cannot update houseName on invite', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/invite1').set({
        houseId: 'house1',
        houseName: 'Test House',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    })

    const attacker = testEnv.authenticatedContext('attacker', { email_verified: true })
    await assertFails(
      attacker.firestore().doc('invites/invite1').update({
        houseName: 'Phishing House',
      })
    )
  })
})

// ── Recurring ───────────────────────────────────────────────────────

describe('Recurring (/houses/{houseId}/recurring/{recurringId})', () => {
  it('member can create and read recurring entries', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/recurring/rec1').set({
        amount: 50000,
        description: 'Monthly extra payment',
        date: '2025-06-01',
      })
    )
    await assertSucceeds(alice.firestore().doc('houses/house1/recurring/rec1').get())
  })

  it('member can update and delete recurring entries', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await alice.firestore().doc('houses/house1/recurring/rec1').set({ amount: 50000 })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/recurring/rec1').update({ amount: 60000 })
    )
    await assertSucceeds(
      alice.firestore().doc('houses/house1/recurring/rec1').delete()
    )
  })

  it('non-member cannot read recurring entries', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/recurring/rec1').set({ amount: 50000 })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().doc('houses/house1/recurring/rec1').get())
  })

  it('non-member cannot write recurring entries', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(
      outsider.firestore().doc('houses/house1/recurring/rec1').set({ amount: 50000 })
    )
  })
})

// ── Mortgage / Meta ──────────────────────────────────────────────────

describe('Meta docs (/houses/{houseId}/meta/{docId})', () => {
  it('member can read and write mortgage config', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/meta/mortgage').set({
        principal: 30000000,
        annualRate: 3.5,
        termYears: 30,
        startDate: '2025-07-01',
      })
    )
    await assertSucceeds(alice.firestore().doc('houses/house1/meta/mortgage').get())
  })

  it('non-member cannot read mortgage config', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/meta/mortgage').set({ principal: 30000000 })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().doc('houses/house1/meta/mortgage').get())
  })

  it('member cannot write to meta/storage (server-managed)', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(
      alice.firestore().doc('houses/house1/meta/storage').set({ usedBytes: 0 })
    )
  })

  it('member can still read meta/storage', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/meta/storage').set({ usedBytes: 1000 })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('houses/house1/meta/storage').get())
  })

  it('member can still write to other meta docs (e.g. settings)', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/meta/settings').set({ currency: 'EUR' })
    )
  })
})

// ── Reference Rates ──────────────────────────────────────────────────

describe('Reference rates (/reference_rates/{rateId})', () => {
  it('anyone can read reference rates (public data)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('reference_rates/euribor_12m').set({ values: {}, source: 'ECB' })
    })

    const unauthed = testEnv.unauthenticatedContext()
    await assertSucceeds(unauthed.firestore().doc('reference_rates/euribor_12m').get())
  })

  it('nobody can write reference rates (admin SDK only)', async () => {
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(
      alice.firestore().doc('reference_rates/euribor_12m').set({ values: {}, source: 'Hacked' })
    )
  })
})

// ── Document Folders ────────────────────────────────────────────────

describe('Folders (/houses/{houseId}/folders/{folderId})', () => {
  it('member can create a folder', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/folders/folder1').set({
        name: 'Purchase & Legal',
        icon: '📋',
        order: 0,
        createdAt: new Date().toISOString(),
        createdBy: 'alice',
      })
    )
  })

  it('member can read folders', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/folders/folder1').set({
        name: 'Insurance', icon: '🛡️', order: 0, createdAt: new Date().toISOString(), createdBy: 'alice',
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().collection('houses/house1/folders').get())
  })

  it('member can update a folder', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/folders/folder1').set({
        name: 'Old Name', icon: '📁', order: 0, createdAt: new Date().toISOString(), createdBy: 'alice',
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/folders/folder1').update({ name: 'New Name', icon: '📋' })
    )
  })

  it('member can delete a folder', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/folders/folder1').set({
        name: 'To Delete', icon: '📁', order: 0, createdAt: new Date().toISOString(), createdBy: 'alice',
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('houses/house1/folders/folder1').delete())
  })

  it('non-member cannot read folders', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/folders/folder1').set({
        name: 'Secret', icon: '📁', order: 0, createdAt: new Date().toISOString(), createdBy: 'alice',
      })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().collection('houses/house1/folders').get())
  })

  it('non-member cannot create a folder', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(
      outsider.firestore().doc('houses/house1/folders/folder2').set({
        name: 'Sneaky', icon: '📁', order: 0, createdAt: new Date().toISOString(), createdBy: 'outsider',
      })
    )
  })

  it('unauthenticated user cannot access folders', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unauthed = testEnv.unauthenticatedContext()
    await assertFails(unauthed.firestore().collection('houses/house1/folders').get())
  })

  it('member can create a folder with description', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/folders/folder-desc').set({
        name: 'Insurance',
        icon: '🛡️',
        description: 'Homeowner, title, and life insurance policies',
        order: 2,
        createdAt: new Date().toISOString(),
        createdBy: 'alice',
      })
    )
  })

  it('member can update folder description', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/folders/folder1').set({
        name: 'Test', icon: '📁', order: 0, createdAt: new Date().toISOString(), createdBy: 'alice',
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/folders/folder1').update({ description: 'Updated description' })
    )
  })

  it('cannot create folders in the same batch as the member doc (rules pre-batch state)', async () => {
    // This test documents WHY createHouse uses two separate batches.
    // Firestore security rules evaluate each operation against the database state
    // BEFORE the batch — the member doc from the same batch is invisible to isMember().
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const aliceDb = alice.firestore()

    const batch = aliceDb.batch()
    batch.set(aliceDb.doc('houses/house-new'), {
      name: 'New House', ownerId: 'alice', memberIds: ['alice'], createdAt: new Date().toISOString(),
    })
    batch.set(aliceDb.doc('houses/house-new/members/alice'), {
      displayName: 'Alice', email: 'a@t.com', color: '#3b82f6', role: 'owner', joinedAt: new Date().toISOString(),
    })
    // This folder write requires isMember() which calls exists(.../members/alice),
    // but the member doc doesn't exist yet from the rules engine's perspective.
    batch.set(aliceDb.doc('houses/house-new/folders/folder1'), {
      name: 'Test', icon: '📁', order: 0, createdAt: new Date().toISOString(), createdBy: 'alice',
    })
    await assertFails(batch.commit())
  })

  it('unverified user cannot create folders', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertFails(
      unverified.firestore().doc('houses/house1/folders/folder-new').set({
        name: 'Test', icon: '📁', order: 0, createdAt: new Date().toISOString(), createdBy: 'alice',
      })
    )
  })
})

// ── Documents ───────────────────────────────────────────────────────

describe('Documents (/houses/{houseId}/documents/{documentId})', () => {
  it('member can create a document', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/documents/doc1').set({
        folderId: 'folder1',
        name: 'contract.pdf',
        type: 'application/pdf',
        size: 1024000,
        url: 'https://storage.example.com/doc1',
        uploadedBy: 'alice',
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
  })

  it('member can read documents', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/documents/doc1').set({
        folderId: 'folder1', name: 'test.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'alice',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().collection('houses/house1/documents').get())
  })

  it('member can update a document (rename, move, add notes)', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/documents/doc1').set({
        folderId: 'folder1', name: 'old-name.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'alice',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/documents/doc1').update({
        name: 'new-name.pdf',
        folderId: 'folder2',
        notes: 'Important document',
        updatedAt: new Date().toISOString(),
      })
    )
  })

  it('member can delete a document', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/documents/doc1').set({
        folderId: 'folder1', name: 'to-delete.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'alice',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.firestore().doc('houses/house1/documents/doc1').delete())
  })

  it('non-member cannot read documents', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/documents/doc1').set({
        folderId: 'folder1', name: 'secret.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'alice',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().collection('houses/house1/documents').get())
  })

  it('non-member cannot create a document', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(
      outsider.firestore().doc('houses/house1/documents/doc2').set({
        folderId: 'folder1', name: 'hack.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'outsider',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    )
  })

  it('non-member cannot delete a document', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/documents/doc1').set({
        folderId: 'folder1', name: 'protected.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'alice',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.firestore().doc('houses/house1/documents/doc1').delete())
  })

  it('member can add notes to a document', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/documents/doc-notes').set({
        folderId: 'folder1', name: 'contract.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'alice',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/documents/doc-notes').update({
        notes: 'Final signed version - expires Dec 2026',
        updatedAt: new Date().toISOString(),
      })
    )
  })

  it('member can clear notes from a document', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house1/documents/doc-clear').set({
        folderId: 'folder1', name: 'test.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'alice',
        notes: 'Old note',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc('houses/house1/documents/doc-clear').update({
        notes: firebase.firestore.FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      })
    )
  })

  it('cross-house isolation: member of house1 cannot access house2 documents', async () => {
    await seedHouseWithMember('house1', 'alice')
    await seedHouseWithMember('house2', 'bob')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('houses/house2/documents/doc1').set({
        folderId: 'folder1', name: 'private.pdf', type: 'application/pdf',
        size: 500, url: 'https://example.com', uploadedBy: 'bob',
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(alice.firestore().doc('houses/house2/documents/doc1').get())
  })
})

// ── Email Verification Rules ────────────────────────────────────────

describe('Email verification enforcement', () => {
  it('unverified user cannot create a house', async () => {
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertFails(
      unverified.firestore().doc('houses/house1').set({
        name: 'My House',
        ownerId: 'alice',
        memberIds: ['alice'],
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('unverified member cannot create an expense', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertFails(
      unverified.firestore().collection('houses/house1/expenses').add({
        amount: 150000,
        category: 'notary_legal',
        payer: 'alice',
        description: 'Notary fees',
        date: '2025-07-15',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
  })

  it('unverified member cannot update house', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertFails(
      unverified.firestore().doc('houses/house1').update({ name: 'Renamed' })
    )
  })

  it('unverified user cannot create an invite', async () => {
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertFails(
      unverified.firestore().doc('invites/invite1').set({
        houseId: 'house1',
        houseName: 'Test House',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    )
  })

  it('unverified user cannot create a member doc', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unverified = testEnv.authenticatedContext('bob', { email_verified: false })
    await assertFails(
      unverified.firestore().doc('houses/house1/members/bob').set({
        displayName: 'Bob',
        email: 'bob@example.com',
        color: '#ef4444',
        role: 'member',
        joinedAt: new Date().toISOString(),
      })
    )
  })

  it('unverified member can still READ expenses', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('houses/house1/expenses').add({
        amount: 50000,
        category: 'other',
        payer: 'alice',
        description: 'Test',
        date: '2025-07-15',
      })
    })
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertSucceeds(unverified.firestore().collection('houses/house1/expenses').get())
  })

  it('unverified user CAN write their own profile (exception)', async () => {
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertSucceeds(
      unverified.firestore().doc('users/alice').set({
        displayName: 'Alice',
        email: 'alice@example.com',
        houseId: null,
        createdAt: new Date().toISOString(),
      })
    )
  })

})

// ── Todos ───────────────────────────────────────────────────────────

describe('Todos (/houses/{houseId}/todos/{todoId})', () => {
  it('member can create a todo', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().collection('houses/house1/todos').add({
        title: 'Get pre-approval',
        completed: false,
        sortOrder: 0,
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
  })

  it('member can read todos', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().collection('houses/house1/todos').get()
    )
  })

  it('member can update a todo', async () => {
    await seedHouseWithMember('house1', 'alice')
    // Seed a todo
    let todoId: string
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await ctx.firestore().collection('houses/house1/todos').add({
        title: 'Schedule inspection',
        completed: false,
        sortOrder: 0,
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      todoId = ref.id
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc(`houses/house1/todos/${todoId!}`).update({
        completed: true,
        completedAt: new Date().toISOString(),
        completedBy: 'alice',
      })
    )
  })

  it('member can delete a todo', async () => {
    await seedHouseWithMember('house1', 'alice')
    let todoId: string
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await ctx.firestore().collection('houses/house1/todos').add({
        title: 'To delete',
        completed: false,
        sortOrder: 0,
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      todoId = ref.id
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(
      alice.firestore().doc(`houses/house1/todos/${todoId!}`).delete()
    )
  })

  it('non-member cannot read todos', async () => {
    await seedHouseWithMember('house1', 'alice')
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(
      bob.firestore().collection('houses/house1/todos').get()
    )
  })

  it('non-member cannot write todos', async () => {
    await seedHouseWithMember('house1', 'alice')
    const bob = testEnv.authenticatedContext('bob', { email_verified: true })
    await assertFails(
      bob.firestore().collection('houses/house1/todos').add({
        title: 'Intruder task',
        completed: false,
        sortOrder: 0,
        createdBy: 'bob',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
  })

  it('unauthenticated user cannot access todos', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unauth = testEnv.unauthenticatedContext()
    await assertFails(
      unauth.firestore().collection('houses/house1/todos').get()
    )
  })

  it('unverified email user can read but not write todos', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertSucceeds(
      unverified.firestore().collection('houses/house1/todos').get()
    )
    await assertFails(
      unverified.firestore().collection('houses/house1/todos').add({
        title: 'Should fail',
        completed: false,
        sortOrder: 0,
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
  })
})
