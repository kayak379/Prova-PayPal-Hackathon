import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { bootstrapRetailers } from '../db/bootstrap-retailers'
import { sandboxRetailers } from '../db/sandbox-retailers'
import { allocateRetailerPayouts, retailerRecipients } from '../lib/retailer-payouts'

test('the ten default sandbox businesses each receive their retailer share', () => {
  assert.equal(sandboxRetailers.length, 10)
  assert.equal(new Set(sandboxRetailers.map(r => r.email)).size, 10)
  assert.deepEqual(retailerRecipients(sandboxRetailers), sandboxRetailers)
  const payouts = allocateRetailerPayouts(sandboxRetailers.map((r, i) => ({
    id: String(i), name: 'Sandbox supply', supplier: r.domain, category: 'Supplies',
    unitPrice: 1, unitPriceCents: 100, qty: 1, delivery: 'Simulated',
  })))
  assert.equal(payouts.length, 10)
  assert.equal(payouts.reduce((sum, item) => sum + item.amountCents, 0), 1130)
  assert.ok(payouts.every(item => item.amountCents === 113))
})

test('sandbox defaults import once, preserving existing recipients, settings and deliberate removals', async () => {
  const db = new PGlite()
  try {
    await db.exec(await readFile('db/migrations/001_workspace.sql', 'utf8'))
    await db.exec(await readFile('db/migrations/005_sandbox_retailer_defaults.sql', 'utf8'))
    const defaults = Array.from({ length: 10 }, (_, i) => ({ domain: `retailer${i}.example`, email: `retailer${i}@sandbox.example` }))
    const existing = { ...defaults[0], email: 'custom@sandbox.example' }
    const settings = { orgName: 'Existing organization', retailerRecipients: [existing] }
    await db.query("INSERT INTO workspace(id,settings,folders,wallet) VALUES('demo',$1,'[]','saved-wallet')", [JSON.stringify(settings)])
    const client = { query: (sql: string, args?: any[]) => db.query(sql, args) } as any
    await bootstrapRetailers(client, defaults)
    let row = (await db.query<any>("SELECT * FROM workspace WHERE id='demo'")).rows[0]
    assert.equal(row.settings.retailerRecipients.length, 10)
    assert.deepEqual(row.settings.retailerRecipients[0], existing)
    assert.equal(row.settings.orgName, settings.orgName)
    assert.equal(row.wallet, 'saved-wallet')
    assert.equal(row.version, 2)
    await bootstrapRetailers(client, defaults)
    assert.equal((await db.query<any>("SELECT version FROM workspace WHERE id='demo'")).rows[0].version, 2)
    await db.query("UPDATE workspace SET settings=jsonb_set(settings,'{retailerRecipients}','[]') WHERE id='demo'")
    await bootstrapRetailers(client, defaults)
    row = (await db.query<any>("SELECT settings FROM workspace WHERE id='demo'")).rows[0]
    assert.deepEqual(row.settings.retailerRecipients, [])
    await db.query("DELETE FROM workspace WHERE id='demo'")
    await bootstrapRetailers(client, defaults)
    await db.query("INSERT INTO workspace(id,settings,folders) VALUES('demo','{}','[]')")
    await bootstrapRetailers(client, defaults)
    assert.deepEqual((await db.query<any>("SELECT settings FROM workspace WHERE id='demo'")).rows[0].settings.retailerRecipients, defaults)
  } finally { await db.close() }
})
