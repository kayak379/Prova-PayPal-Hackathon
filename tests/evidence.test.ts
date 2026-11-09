import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import type { Campaign } from '../lib/types'
import type { EvidenceBundle } from '../lib/evidence'
import { canonicalize, evidenceState, hashEvidence, verifyRecords } from '../lib/server/evidence-crypto'
import { baselineEvidence, campaignEvidence, recordEvidence } from '../lib/server/evidence'
import { transaction } from '../lib/server/db'
import { mutate, workspace, withCampaign } from '../lib/server/workspace'
import { GET } from '../app/api/campaigns/[id]/evidence/route'
import { POST as finance } from '../app/api/finance/route'
import { sign } from '../lib/server/common'
import { proxy } from '../proxy'
import { newSession } from '../lib/server/session'
import { NextRequest } from 'next/server'

test('canonical evidence is deterministic, strict, and excludes reusable credentials', () => {
  assert.equal(canonicalize({ b: [3, null, 'é'], a: -0 }), '{"a":0,"b":[3,null,"é"]}')
  assert.equal(hashEvidence({ b: 1, a: { d: 2, c: 3 } }), hashEvidence({ a: { c: 3, d: 2 }, b: 1 }))
  for (const bad of [NaN, Infinity, undefined, { x: undefined }, '\ud800', { '\udfff': 1 }]) assert.throws(() => canonicalize(bad))
  const serialized = JSON.stringify(evidenceState({ id: 'test', version: 7, proposal: { snapshot: 'signed-prices' }, requestAttachment: { name: 'note.txt', content: 'private attachment' }, financeOperations: [{ action: { token: 'approval-secret' } }], refunds: [{ proof: 'refund-proof' }] } as unknown as Campaign))
  for (const value of ['signed-prices', 'private attachment', 'approval-secret', 'refund-proof', '"version"']) assert.ok(!serialized.includes(value))
  assert.ok(serialized.includes('sha256'))
})

test('campaign evidence persistence, verification, exports and approvals', async t => {
  const db = new PGlite()
  process.env.DATABASE_URL = 'postgres://evidence-test'
  process.env.SESSION_SECRET = 'evidence-test-session-secret-with-more-than-32-characters'
  process.env.PAYPAL_CLIENT_SECRET = 'test-paypal-secret'
  delete process.env.EVIDENCE_SIGNING_PRIVATE_KEY
  for (const migration of ['001_workspace.sql', '007_campaign_evidence.sql']) await db.exec(await readFile('db/migrations/' + migration, 'utf8'))
  // Match production pool transaction isolation on PGlite's single connection.
  let tail = Promise.resolve()
  async function acquire() {
    const prior = tail
    let release!: () => void
    tail = new Promise<void>(resolve => { release = resolve })
    await prior
    return release
  }
  const raw = (sql: string, args?: unknown[]) => db.query(sql, args)
  let failInsert = false
  const query = async (sql: string, args?: unknown[]) => {
    if (failInsert && sql.startsWith('INSERT INTO campaign_evidence')) throw new Error('Evidence insert failed')
    return raw(sql, args)
  }
  ;(globalThis as unknown as { provaPool: Pool }).provaPool = {
    query: async (sql: string, args?: unknown[]) => { const release = await acquire(); try { return await query(sql, args) } finally { release() } },
    connect: async () => { const release = await acquire(); return { query, release } },
  } as unknown as Pool
  await db.query("INSERT INTO workspace(id,settings,folders) VALUES('demo',$1,$2)", [JSON.stringify({ orgName: 'Team', taxId: '', address: '' }), JSON.stringify([{ id: 'f', name: 'Relief' }])])
  let id = ''
  let signedBundle!: EvidenceBundle
  const keys = generateKeyPairSync('ed25519')
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  try {
    await t.test('creation, repeat creation and concurrent saves form one ordered chain', async () => {
      id = crypto.randomUUID()
      const command = { kind: 'create', entityId: id, draft: { name: 'Relief', folderId: 'f', budget: 1000 } }
      await mutate(command)
      await mutate(command)
      assert.equal((await campaignEvidence(id)).verification.count, 1)
      await Promise.all([withCampaign(id, async c => { c.name = 'First' }), withCampaign(id, async c => { c.budget = 1200 })])
      const { bundle, verification } = await campaignEvidence(id)
      assert.equal(verification.valid, true)
      assert.equal(verification.signed, false)
      assert.equal(verification.count, 3)
      assert.deepEqual(bundle.records.map(r => r.event.sequence), [1, 2, 3])
      assert.equal((bundle.records[2].event.state as Campaign).name, 'First')
    })
    await t.test('failed mutations and evidence writes roll back both state and chain', async () => {
      const before = await campaignEvidence(id)
      await assert.rejects(withCampaign(id, async c => { c.name = 'Lost'; throw new Error('Provider failed') }))
      failInsert = true
      await assert.rejects(withCampaign(id, async c => { c.name = 'Lost' }), /Evidence insert failed/)
      failInsert = false
      assert.deepEqual((await campaignEvidence(id)).bundle.records, before.bundle.records)
      assert.equal((await workspace()).campaigns.find(c => c.id === id)?.name, 'First')
    })
    await t.test('database blocks evidence update, deletion and truncation', async () => {
      for (const sql of ["UPDATE campaign_evidence SET hash=repeat('0',64)", 'DELETE FROM campaign_evidence', 'TRUNCATE campaign_evidence']) await assert.rejects(db.exec(sql), /append-only/)
      assert.equal((await campaignEvidence(id)).verification.valid, true)
    })
    await t.test('existing records get one honest baseline, including archived campaigns', async () => {
      const old: Campaign = { id: 'legacy', name: 'Older campaign', budget: 100, taxId: '', address: '', folderId: 'f', createdAt: 1, deletedAt: 2, audit: [], orders: [] }
      await db.query('INSERT INTO campaigns(id,data) VALUES($1,$2)', [old.id, JSON.stringify(old)])
      await transaction(baselineEvidence)
      await transaction(baselineEvidence)
      const { verification, bundle } = await campaignEvidence(old.id)
      assert.equal(verification.valid, true)
      assert.equal(verification.baseline, true)
      assert.equal(verification.count, 1)
      assert.notEqual(bundle.records[0].event.recordedAt, new Date(old.createdAt).toISOString())
    })
    await t.test('out-of-band campaign edits are detected and cannot be legitimized by a later save', async () => {
      const original = (await db.query<{ data: Campaign }>('SELECT data FROM campaigns WHERE id=$1', [id])).rows[0].data
      await db.query("UPDATE campaigns SET data=jsonb_set(data,'{budget}','999999') WHERE id=$1", [id])
      const result = await campaignEvidence(id)
      assert.equal(result.verification.valid, false)
      assert.match(result.verification.error!, /differs/)
      await assert.rejects(withCampaign(id, async c => { c.name = 'Hide tampering' }), /evidence does not match/)
      await db.query('UPDATE campaigns SET data=$2 WHERE id=$1', [id, JSON.stringify(original)])
    })
    await t.test('signed checkpoints authenticate the head with an independently trusted key', async () => {
      process.env.EVIDENCE_SIGNING_PRIVATE_KEY = keys.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
      await withCampaign(id, async c => { c.name = 'Signed relief' })
      signedBundle = (await campaignEvidence(id)).bundle
      assert.equal(verifyRecords(signedBundle, publicKey).valid, true)
      assert.equal(verifyRecords(signedBundle, publicKey).signed, true)
      const different = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
      assert.equal(verifyRecords(signedBundle, different).valid, false)
      const altered = structuredClone(signedBundle)
      altered.records.at(-1)!.checkpoint!.signature = Buffer.alloc(64).toString('base64')
      assert.equal(verifyRecords(altered).valid, false)
      const unsigned = structuredClone(signedBundle)
      unsigned.records.at(-1)!.checkpoint = null
      assert.equal(verifyRecords(unsigned, publicKey).valid, false)
    })
    await t.test('edits, removals, reordering, cross-campaign substitution and truncation fail verification', () => {
      const variants = [
        (b: EvidenceBundle) => { (b.records[0].event.state as Campaign).budget++ },
        (b: EvidenceBundle) => { b.records[1].event.source = 'paypal-webhook' },
        (b: EvidenceBundle) => { b.records.splice(1, 1) },
        (b: EvidenceBundle) => { b.records.reverse() },
        (b: EvidenceBundle) => { b.campaignId = 'another-campaign' },
        (b: EvidenceBundle) => { b.records.pop() },
      ]
      for (const change of variants) {
        const copy = structuredClone(signedBundle)
        change(copy)
        assert.equal(verifyRecords(copy, publicKey).valid, false)
      }
    })
    await t.test('read API and export are authenticated, uncached and independently verifiable', async () => {
      const url = `https://demo.example/api/campaigns/${id}/evidence`
      assert.equal(proxy(new NextRequest(url)).status, 401)
      assert.equal(proxy(new NextRequest(url, { headers: { cookie: `prova-session=${newSession()}` } })).status, 200)
      const context = { params: Promise.resolve({ id }) }
      const response = await GET(new Request(url), context)
      assert.equal(response.status, 200)
      assert.match(response.headers.get('cache-control')!, /no-store/)
      assert.equal((await response.json()).verification.valid, true)
      const exported = await GET(new Request(url + '?export=1'), context)
      assert.match(exported.headers.get('content-disposition')!, /attachment/)
      const bundle = await exported.json()
      assert.equal(verifyRecords(bundle, publicKey).valid, true)
      const directory = await mkdtemp(join(tmpdir(), 'prova-evidence-'))
      try {
        await writeFile(join(directory, 'evidence.json'), JSON.stringify(bundle))
        await writeFile(join(directory, 'key.pem'), publicKey)
        const output = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/evidence-verify.ts', join(directory, 'evidence.json'), join(directory, 'key.pem'), join(directory, 'evidence.json')], { encoding: 'utf8' })
        assert.match(output, /Latest checkpoint matches/)
        bundle.records.pop()
        await writeFile(join(directory, 'evidence.json'), JSON.stringify(bundle))
        assert.throws(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/evidence-verify.ts', join(directory, 'evidence.json')], { stdio: 'pipe' }))
      } finally { await rm(directory, { recursive: true, force: true }) }
      assert.equal((await GET(new Request(url), { params: Promise.resolve({ id: 'absent' }) })).status, 404)
    })
    await t.test('finance approval survives provider failure, deduplicates retries, and rejects expired tokens', async () => {
      const token = sign({ campaignId: id, expires: Date.now() + 60000, operationId: 'op-1', kind: 'refund', orderId: 'missing', amountCents: 100 })
      const request = (approval = token) => new Request('https://demo.example/api/finance', { method: 'POST', body: JSON.stringify({ campaign: { id }, action: 'confirm', token: approval }) })
      assert.equal((await finance(request())).status, 400)
      assert.equal((await finance(request())).status, 400)
      const { bundle, verification } = await campaignEvidence(id)
      assert.equal(verification.valid, true)
      assert.equal(bundle.records.filter(r => r.event.type === 'finance.approval.requested').length, 1)
      const count = verification.count
      const expired = sign({ campaignId: id, expires: 0, operationId: 'op-2', kind: 'refund' })
      assert.equal((await finance(request(expired))).status, 400)
      assert.equal((await campaignEvidence(id)).verification.count, count)
    })
    await t.test('event intents are idempotent and deletion preserves exportable history', async () => {
      const context = { type: 'test.intent', source: 'server' as const, eventId: 'one-intent' }
      await transaction(async client => { await recordEvidence(client, id, context); await recordEvidence(client, id, context) })
      assert.equal((await campaignEvidence(id)).bundle.records.filter(r => r.event.eventId === 'one-intent').length, 1)
      const current = (await workspace()).campaigns.find(c => c.id === id)!
      await mutate({ kind: 'delete', id, version: current.version })
      assert.ok(!(await workspace()).campaigns.some(c => c.id === id))
      assert.equal((await campaignEvidence(id)).verification.valid, true)
      assert.equal((await campaignEvidence(id)).bundle.records.at(-1)?.event.type, 'workspace.delete')
    })
  } finally {
    delete process.env.EVIDENCE_SIGNING_PRIVATE_KEY
    delete (globalThis as unknown as { provaPool?: Pool }).provaPool
    await db.close()
  }
})
