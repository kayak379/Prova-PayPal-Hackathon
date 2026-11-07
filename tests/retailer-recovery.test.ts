import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { withCampaign, workspace } from '../lib/server/workspace'
import { retailerRecovery } from '../lib/server/retailer-recovery'
import { processPayouts } from '../lib/server/payouts'
import { sign, verify } from '../lib/server/common'
import { financeTotals } from '../lib/finance'

test('retailer recovery respects payout ownership, status and buyer accounting', async t => {
  const db = new PGlite()
  for (const name of ['001_workspace.sql', '004_sandbox_payouts.sql']) await db.exec(await readFile('db/migrations/' + name, 'utf8'))
  const query = (sql: string, args?: any[]) => db.query<any>(sql, args)
  ;(globalThis as any).provaPool = { query, connect: async () => ({ query, release() {} }) }
  process.env.DATABASE_URL = 'postgres://recovery-tests'
  process.env.PAYPAL_CLIENT_ID = 'client'
  process.env.PAYPAL_CLIENT_SECRET = 'secret'
  const beforeFetch = globalThis.fetch
  let canceled: string[] = []
  let timeout = false
  let mismatch = false
  let remote: Record<string, string> = {}
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://api-m.sandbox.paypal.com')
    if (url.pathname.endsWith('/oauth2/token')) return Response.json({ access_token: 'token' })
    if (url.pathname === '/v1/payments/payouts/B') return Response.json({ batch_header: { payout_batch_id: 'B', batch_status: 'SUCCESS', sender_batch_header: { sender_batch_id: 'op' } }, items: ['I1', 'I2'].map(id => ({ payout_item_id: id, transaction_status: remote[id], payout_item: { sender_item_id: id, receiver: 'shared@example.com', amount: { currency: 'USD', value: '5.00' } } })) })
    const match = url.pathname.match(/^\/v1\/payments\/payouts-item\/(I[12])(\/cancel)?$/)
    assert.ok(match, 'recovery may not issue buyer refunds or new payouts')
    const id = match[1]
    if (match[2]) {
      assert.equal(remote[id], 'UNCLAIMED')
      assert.equal(options?.method, 'POST')
      canceled.push(id); remote[id] = 'RETURNED'
      if (timeout) { timeout = false; throw new Error('Cancel response lost') }
    }
    return Response.json({ payout_item_id: id, payout_batch_id: 'B', transaction_status: remote[id], payout_item: {
      sender_item_id: id, receiver: mismatch ? 'wrong@example.com' : 'shared@example.com', amount: { currency: 'USD', value: '5.00' },
    } })
  }
  async function setup(batchId: string | undefined = 'B', submitted: number | null = Date.now()) {
    canceled = []; mismatch = false; remote = { I1: 'UNCLAIMED', I2: 'SUCCESS' }
    await query('DELETE FROM sandbox_payout_batches'); await query('DELETE FROM campaigns')
    const payouts = { id: 'op', batchId, status: batchId ? 'PENDING' : 'QUEUED', items: ['I1', 'I2'].map((id, i) => ({ senderItemId: id, payoutItemId: batchId ? id : undefined, retailer: `${i}.example`, recipient: 'shared@example.com', amountCents: 500, status: batchId ? remote[id] : 'QUEUED' })) }
    const c = { id: 'c', name: 'Recovery', budget: 100, folderId: 'f', createdAt: Date.now(), audit: [], orders: [{ id: 'o', paypalTxn: 'capture', totalCents: 1000, total: 10, items: [], status: 'confirmed', createdAt: Date.now(), supplier: 'Two retailers', payouts }] }
    await query('INSERT INTO campaigns(id,data) VALUES($1,$2)', ['c', JSON.stringify(c)])
    await query('INSERT INTO sandbox_payout_batches(id,campaign_id,order_id,first_submitted_at,data) VALUES($1,$2,$3,$4,$5)', ['op', 'c', 'o', submitted, JSON.stringify(payouts)])
  }
  const run = (body: any) => withCampaign('c', (c, client) => retailerRecovery(c, client, { orderId: 'o', ...body }))
  try {
    await t.test('review never cancels; confirmation only cancels selected unclaimed item, even with a shared recipient', async () => {
      await setup()
      const review = await run({ action: 'prepare', itemIds: ['I1', 'I2'] })
      assert.equal(canceled.length, 0)
      const result = await run({ action: 'confirm', token: review.token })
      assert.deepEqual(canceled, ['I1'])
      assert.deepEqual(result.payouts.items.map(i => i.status), ['RETURNED', 'SUCCESS'])
      await run({ action: 'confirm', token: review.token })
      assert.deepEqual(canceled, ['I1'])
    })
    await t.test('recipient-initiated return refreshes without another transfer or budget credit', async () => {
      remote.I2 = 'REFUNDED'
      const result = await run({ action: 'refresh' })
      assert.equal(result.payouts.status, 'RECOVERED')
      const c = await withCampaign('c', async c => c)
      assert.equal(financeTotals(c).refunds, 0)
      assert.equal(financeTotals(c).net, 1000)
    })
    await t.test('missing item references are recovered from PayPal before cancelling; newly completed items cannot be cancelled', async () => {
      await setup()
      await query("UPDATE sandbox_payout_batches SET data=jsonb_set(data,'{items,0}',(data#>'{items,0}')-'payoutItemId')")
      const review = await run({ action: 'prepare', itemIds: ['I1'] })
      assert.equal(review.payouts.items[0].payoutItemId, 'I1')
      remote.I1 = 'SUCCESS'
      const confirmed = await run({ action: 'confirm', token: review.token })
      assert.equal(confirmed.payouts.items[0].status, 'SUCCESS')
      assert.equal(canceled.length, 0)
    })
    await t.test('unsubmitted batch stops durably, including retries and reconciliation', async () => {
      await setup(undefined, null)
      // Explicitly remove the default argument's batch ID.
      await query("UPDATE sandbox_payout_batches SET data=data-'batchId'")
      const review = await run({ action: 'prepare', itemIds: ['I1'] })
      const result = await run({ action: 'confirm', token: review.token })
      assert.ok(result.payouts.items.every(item => item.status === 'STOPPED'))
      await processPayouts('c')
      assert.equal((await run({ action: 'confirm', token: review.token })).payouts.status, 'STOPPED')
      assert.equal(canceled.length, 0)
    })
    await t.test('unknown submission is held for review and never reported as returned', async () => {
      await setup(undefined)
      await query("UPDATE sandbox_payout_batches SET data=data-'batchId'")
      const review = await run({ action: 'prepare', itemIds: ['I1'] })
      const result = await run({ action: 'confirm', token: review.token })
      assert.equal(result.payouts.status, 'NEEDS_REVIEW')
      assert.ok(result.payouts.items.every(item => !['RETURNED', 'REFUNDED'].includes(item.status)))
      await processPayouts('c'); assert.equal(canceled.length, 0)
    })
    await t.test('cancel timeout recovers authoritative return, mismatches and invalid tokens cannot cancel', async () => {
      await setup()
      const review = await run({ action: 'prepare', itemIds: ['I1'] })
      const payload = verify<any>(review.token!)
      await assert.rejects(run({ action: 'confirm', token: sign({ ...payload, campaignId: 'other' }) }), /another purchase/)
      await assert.rejects(run({ action: 'confirm', token: sign({ ...payload, expires: 0 }) }), /expired/)
      await assert.rejects(run({ action: 'prepare', itemIds: ['outside'] }), /valid retailer/)
      mismatch = true
      const failed = await run({ action: 'confirm', token: review.token })
      assert.match(failed.payouts.items[0].error!, /mismatch/)
      assert.equal(canceled.length, 0)
      mismatch = false; timeout = true
      assert.equal((await run({ action: 'confirm', token: review.token })).payouts.items[0].status, 'RETURNED')
      assert.deepEqual(canceled, ['I1'])
    })
  } finally { globalThis.fetch = beforeFetch; delete (globalThis as any).provaPool; await db.close() }
})
