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
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref(STORAGE_PATH)
    await assertSucceeds(
      ref.put(makeTestFile(), { contentType: 'image/png' })
    )
  })

  it('member can upload PDF', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-2/doc.pdf')
    await assertSucceeds(
      ref.put(makeTestFile(), { contentType: 'application/pdf' })
    )
  })

  it('member can upload Word doc', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-3/doc.docx')
    await assertSucceeds(
      ref.put(makeTestFile(), { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    )
  })

  it('member cannot upload file with disallowed MIME type', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-4/hack.exe')
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'application/x-msdownload' })
    )
  })

  it('member cannot upload zip file', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-5/archive.zip')
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'application/zip' })
    )
  })

  it('member cannot upload file exceeding 10MB', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-6/big.png')
    const bigFile = makeTestFile(10 * 1024 * 1024 + 1) // 10MB + 1 byte
    await assertFails(
      ref.put(bigFile, { contentType: 'image/png' })
    )
  })

  // Boundary regression: the rule is `request.resource.size < 10 * 1024 * 1024`,
  // strict less-than. A file of EXACTLY 10 MB must be rejected server-side.
  // The client validator is now aligned with this (see attachment-validation.ts),
  // but this test documents the server behavior so a future rule change
  // (e.g. flipping to `<=`) can't silently diverge.
  it('member cannot upload file of EXACTLY 10MB (strict less-than boundary)', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-boundary/exact.png')
    const exactFile = makeTestFile(10 * 1024 * 1024)
    await assertFails(
      ref.put(exactFile, { contentType: 'image/png' })
    )
  })

  it('member can upload file of 10MB - 1 byte (just under boundary)', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-under/near-limit.png')
    const justUnder = makeTestFile(10 * 1024 * 1024 - 1)
    await assertSucceeds(
      ref.put(justUnder, { contentType: 'image/png' })
    )
  })

  it('member can upload a zero-byte file (allowed by rule)', async () => {
    // Unusual but legitimate: a placeholder or empty document. The rule's
    // only size constraint is `< 10 MB`, and 0 < 10 MB, so it passes.
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-zero/empty.pdf')
    await assertSucceeds(
      ref.put(makeTestFile(0), { contentType: 'application/pdf' })
    )
  })

  it('member cannot upload with missing contentType (regex requires a match)', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/attachments/att-notype/no-type.bin')
    // When browsers can't identify a file they often send
    // application/octet-stream or no type — neither matches the rules regex,
    // which is what triggers the "you don't have permission" 403 that
    // confused our user. Regression test: must fail server-side.
    await assertFails(
      ref.put(makeTestFile(100), { contentType: 'application/octet-stream' })
    )
  })

  it('non-member cannot upload to house storage', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
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
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.storage().ref(STORAGE_PATH).getDownloadURL())
  })

  it('non-member cannot read attachment', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
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
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.storage().ref(STORAGE_PATH).delete())
  })

  it('non-member cannot delete attachment', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
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

// ── Document Storage Rules ──────────────────────────────────────────

const DOC_STORAGE_PATH = 'houses/house1/documents/doc-1/test.pdf'

describe('Document Storage: upload (create)', () => {
  it('member can upload a document file with valid type', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref(DOC_STORAGE_PATH)
    await assertSucceeds(
      ref.put(makeTestFile(), { contentType: 'application/pdf' })
    )
  })

  it('member can upload an image document', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/documents/doc-2/photo.png')
    await assertSucceeds(
      ref.put(makeTestFile(), { contentType: 'image/png' })
    )
  })

  it('member cannot upload document with disallowed MIME type', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/documents/doc-3/hack.exe')
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'application/x-msdownload' })
    )
  })

  it('member cannot upload document exceeding 10MB', async () => {
    await seedHouseWithMember('house1', 'alice')
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    const ref = alice.storage().ref('houses/house1/documents/doc-4/big.pdf')
    const bigFile = makeTestFile(10 * 1024 * 1024 + 1)
    await assertFails(
      ref.put(bigFile, { contentType: 'application/pdf' })
    )
  })

  it('non-member cannot upload to house documents', async () => {
    await seedHouseWithMember('house1', 'alice')
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    const ref = outsider.storage().ref(DOC_STORAGE_PATH)
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'application/pdf' })
    )
  })
})

describe('Document Storage: read', () => {
  it('member can read a document file', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(DOC_STORAGE_PATH).put(makeTestFile(), { contentType: 'application/pdf' })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.storage().ref(DOC_STORAGE_PATH).getDownloadURL())
  })

  it('non-member cannot read a document file', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(DOC_STORAGE_PATH).put(makeTestFile(), { contentType: 'application/pdf' })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.storage().ref(DOC_STORAGE_PATH).getDownloadURL())
  })
})

describe('Document Storage: delete', () => {
  it('member can delete a document file', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(DOC_STORAGE_PATH).put(makeTestFile(), { contentType: 'application/pdf' })
    })
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertSucceeds(alice.storage().ref(DOC_STORAGE_PATH).delete())
  })

  it('non-member cannot delete a document file', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(DOC_STORAGE_PATH).put(makeTestFile(), { contentType: 'application/pdf' })
    })
    const outsider = testEnv.authenticatedContext('outsider', { email_verified: true })
    await assertFails(outsider.storage().ref(DOC_STORAGE_PATH).delete())
  })
})

describe('Document Storage: cross-house isolation', () => {
  it('member of house1 cannot access house2 documents', async () => {
    await seedHouseWithMember('house1', 'alice')
    await seedHouseWithMember('house2', 'bob')

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('houses/house2/documents/doc-1/secret.pdf')
        .put(makeTestFile(), { contentType: 'application/pdf' })
    })

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(
      alice.storage().ref('houses/house2/documents/doc-1/secret.pdf').getDownloadURL()
    )
  })

  it('member of house1 cannot upload to house2 documents', async () => {
    await seedHouseWithMember('house1', 'alice')
    await seedHouseWithMember('house2', 'bob')

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(
      alice.storage().ref('houses/house2/documents/doc-1/hack.pdf')
        .put(makeTestFile(), { contentType: 'application/pdf' })
    )
  })
})

// ── Attachment cross-house isolation (existing) ────────────────────

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
    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(
      alice.storage().ref('houses/house2/attachments/att-1/secret.png').getDownloadURL()
    )
  })

  it('member of house1 cannot upload to house2', async () => {
    await seedHouseWithMember('house1', 'alice')
    await seedHouseWithMember('house2', 'bob')

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
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

    const alice = testEnv.authenticatedContext('alice', { email_verified: true })
    await assertFails(
      alice.storage().ref('houses/house2/attachments/att-1/file.png').delete()
    )
  })
})

// ── Email Verification Rules (Storage) ─────────────────────────────

describe('Storage: email verification enforcement', () => {
  it('unverified member cannot upload file', async () => {
    await seedHouseWithMember('house1', 'alice')
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    const ref = unverified.storage().ref(STORAGE_PATH)
    await assertFails(
      ref.put(makeTestFile(), { contentType: 'image/png' })
    )
  })

  it('unverified member cannot delete file', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertFails(unverified.storage().ref(STORAGE_PATH).delete())
  })

  it('unverified member can still READ file', async () => {
    await seedHouseWithMember('house1', 'alice')
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(STORAGE_PATH).put(makeTestFile(), { contentType: 'image/png' })
    })
    const unverified = testEnv.authenticatedContext('alice', { email_verified: false })
    await assertSucceeds(unverified.storage().ref(STORAGE_PATH).getDownloadURL())
  })

})
