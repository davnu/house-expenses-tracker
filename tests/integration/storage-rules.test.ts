import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
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
    storage: {
      host: '127.0.0.1',
      port: 5299,
      rules: fs.readFileSync(path.resolve(__dirname, '../../storage.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
})

// ── Helpers ──────────────────────────────────────────────────────────

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

/** Small test file buffer (PNG header bytes) */
function makeTestFile(sizeBytes = 100): Uint8Array {
  return new Uint8Array(sizeBytes)
}

const STORAGE_PATH = 'houses/house1/attachments/att-1/test.png'

// ── Upload (create) Rules ───────────────────────────────────────────

describe('Storage: upload (create)', () => {
  it('member can upload file with valid type', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice')
    const ref = alice.storage().ref(STORAGE_PATH)
    await assertSucceeds(
      ref.put(makeTestFile(), { contentType: 'image/png' })
    )
  })

  it('member can upload PDF', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice')
    const ref = alice.storage().ref('houses/house1/attachments/att-2/doc.pdf')
    await assertSucceeds(
      ref.put(makeTestFile(), { contentType: 'application/pdf' })
    )
  })

  it('member can upload Word doc', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice')
    const ref = alice.storage().ref('houses/house1/attachments/att-3/doc.docx')
    await assertSucceeds(
      ref.put(makeTestFile(), { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    )
  })

  it('member cannot upload file with disallowed MIME type', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice')
    const ref = alice.storage().ref('houses/house1/attachments/att-4/hack.exe')
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'application/x-msdownload' })
    )
  })

  it('member cannot upload zip file', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice')
    const ref = alice.storage().ref('houses/house1/attachments/att-5/archive.zip')
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'application/zip' })
    )
  })

  it('member cannot upload file exceeding 10MB', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice')
    const ref = alice.storage().ref('houses/house1/attachments/att-6/big.png')
    const bigFile = makeTestFile(10 * 1024 * 1024 + 1) // 10MB + 1 byte
    await assertFails(
      ref.put(bigFile, { contentType: 'image/png' })
    )
  })

  it('non-member cannot upload to house storage', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider')
    const ref = outsider.storage().ref(STORAGE_PATH)
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'image/png' })
    )
  })

  it('unauthenticated user cannot upload', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unauthed = testEnv.unauthenticatedContext()
    const ref = unauthed.storage().ref(STORAGE_PATH)
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'image/png' })
    )
  })
})

// ── Read Rules ──────────────────────────────────────────────────────

describe('Storage: read', () => {
  it('member can read (download) attachment', async () => {
    await seedHouseWithMember('house1', 'alice')
    // Upload a file first (rules-bypassed)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const alice = testEnv.authenticatedContext('alice')
    await assertSucceeds(alice.storage().ref(STORAGE_PATH).getDownloadURL())
  })

  it('non-member cannot read attachment', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const outsider = testEnv.authenticatedContext('outsider')
    await assertFails(outsider.storage().ref(STORAGE_PATH).getDownloadURL())
  })

  it('unauthenticated user cannot read attachment', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const unauthed = testEnv.unauthenticatedContext()
    await assertFails(unauthed.storage().ref(STORAGE_PATH).getDownloadURL())
  })
})

// ── Delete Rules ────────────────────────────────────────────────────

describe('Storage: delete', () => {
  it('member can delete attachment', async () => {
    await seedHouseWithMember('house1', 'alice')
    // Upload first
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const alice = testEnv.authenticatedContext('alice')
    await assertSucceeds(alice.storage().ref(STORAGE_PATH).delete())
  })

  it('non-member cannot delete attachment', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const outsider = testEnv.authenticatedContext('outsider')
    await assertFails(outsider.storage().ref(STORAGE_PATH).delete())
  })

  it('unauthenticated user cannot delete attachment', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const unauthed = testEnv.unauthenticatedContext()
    await assertFails(unauthed.storage().ref(STORAGE_PATH).delete())
  })
})

// ── Cross-house isolation ───────────────────────────────────────────

describe('Storage: cross-house isolation', () => {
  it('member of house1 cannot access house2 attachments', async () => {
    await seedHouseWithMember('house1', 'alice')
    await seedHouseWithMember('house2', 'bob')

    // Upload to house2
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('houses/house2/attachments/att-1/secret.png')
        .put(makeTestFile(), { contentType: 'image/png' })
    })

    // Alice (house1 member) tries to read house2's file
    const alice = testEnv.authenticatedContext('alice')
    await assertFails(
      alice.storage().ref('houses/house2/attachments/att-1/secret.png').getDownloadURL()
    )
  })

  it('member of house1 cannot upload to house2', async () => {
    await seedHouseWithMember('house1', 'alice')
    await seedHouseWithMember('house2', 'bob')

    const alice = testEnv.authenticatedContext('alice')
    await assertFails(
      alice.storage().ref('houses/house2/attachments/att-1/hack.png')
        .put(makeTestFile(), { contentType: 'image/png' })
    )
  })

  it('member of house1 cannot delete from house2', async () => {
    await seedHouseWithMember('house1', 'alice')
    await seedHouseWithMember('house2', 'bob')

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('houses/house2/attachments/att-1/file.png')
        .put(makeTestFile(), { contentType: 'image/png' })
    })

    const alice = testEnv.authenticatedContext('alice')
    await assertFails(
      alice.storage().ref('houses/house2/attachments/att-1/file.png').delete()
    )
  })
})
