import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import type { PlanItem, Order } from '../lib/types'
import { allocateRetailerPayouts, retailerRecipients } from '../lib/retailer-payouts'
import { sandboxRetailers } from '../db/sandbox-retailers'
import { seed } from '../db/seed'
import { mutate, workspace, withCampaign } from '../lib/server/workspace'
import { recoverCheckout } from '../lib/server/checkout-persistence'
import { processPayouts } from '../lib/server/payouts'
import { campaignEvidence } from '../lib/server/evidence'
import { sign } from '../lib/server/common'
import { POST as createCheckout } from '../app/api/checkout/create/route'
import { POST as captureCheckout } from '../app/api/checkout/capture/route'
import { POST as refreshPayouts } from '../app/api/checkout/payouts/route'

const product = (supplier: string, cents: number, id = supplier): PlanItem => ({ id, supplier, name: id, qty: 1, unitPrice: cents / 100, unitPriceCents: cents, category: 'Water', delivery: 'Unverified' })
const recipients = [{ domain: 'a.example', email: 'a@sandbox.example' }, { domain: 'b.example', email: 'b@sandbox.example' }]
const request = (body: object) => new Request('https://demo.example/api/checkout/test', { method: 'POST', body: JSON.stringify(body) })

test('retailer allocation preserves cents, groups domains and validates recipients', () => {
  const items = [product('www.A.example', 37, 'a1'), product('a.example', 22, 'a2'), product('b.example', 41)]
  const result = allocateRetailerPayouts(items)
  assert.deepEqual(result.map(item => item.amountCents), [67, 46])
  assert.equal(result.reduce((sum, item) => sum + item.amountCents, 0), 113)
  assert.deepEqual(result, allocateRetailerPayouts([...items].reverse()))
  assert.throws(() => retailerRecipients([...recipients, { ...recipients[0], domain: 'WWW.A.EXAMPLE' }]), /Duplicate/)
  assert.throws(() => retailerRecipients([{ domain: 'a.example', email: 'invalid' }]), /PayPal email/)
  assert.throws(() => retailerRecipients([{ domain: 'https://a.example/path', email: 'a@example.com' }]), /retailer domain/)
  assert.deepEqual(retailerRecipients(undefined), [])
})

test('automatic sandbox assignment is stable and reusable across arbitrary retailers', () => {
  const items = Array.from({ length: 48 }, (_, i) => product(`new-retailer-${i}.example`, 100))
  const pool = new Set(sandboxRetailers.map(recipient => recipient.email))
  const automatic = allocateRetailerPayouts(items)
  assert.equal(automatic.length, 48)
  assert.ok(automatic.every(item => pool.has(item.recipient)))
  assert.ok(new Set(automatic.map(item => item.recipient)).size <= 10)
  assert.equal(automatic.reduce((sum, item) => sum + item.amountCents, 0), 5424)
  for (const item of automatic) {
    assert.equal(allocateRetailerPayouts([product(`www.${item.retailer.toUpperCase()}.`, 200)])[0].recipient, item.recipient)
  }
  assert.deepEqual(allocateRetailerPayouts([...items].reverse()), automatic)
  for (const recipient of sandboxRetailers) assert.equal(allocateRetailerPayouts([product(recipient.domain, 100)])[0].recipient, recipient.email)
})

test('sandbox payout checkout, persistence and recovery', async t => {
  const db = new PGlite()
  for (const name of ['001_workspace.sql', '002_wallet_bootstrap.sql', '004_sandbox_payouts.sql', '007_campaign_evidence.sql']) await db.exec(await readFile('db/migrations/' + name, 'utf8'))
  process.env.DATABASE_URL = 'postgres://test'
  process.env.PAYPAL_CLIENT_ID = 'test-client'
  process.env.PAYPAL_CLIENT_SECRET = 'test-secret'
  // Serialize PGlite's single connection, while exercising concurrent callers.
  let tail = Promise.resolve()
  async function lock() {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>(resolve => { release = resolve })
    await previous
    return release
  }
  let failSave = false
  const clientQuery = async (sql: string, params?: any[]) => {
    if (failSave && sql.startsWith('UPDATE campaigns')) throw new Error('Simulated save failure')
    return db.query<any>(sql, params)
  }
  const query = async (sql: string, params?: any[]) => {
    // savedWallet uses a separate pool connection for this read-only lookup.
    if (sql === "SELECT wallet FROM workspace WHERE id='demo'") return clientQuery(sql, params)
    const release = await lock()
    try { return await clientQuery(sql, params) } finally { release() }
  }
  ;(globalThis as any).provaPool = { query, connect: async () => { const release = await lock(); return { query: clientQuery, release } } } as unknown as Pool
  const originalFetch = globalThis.fetch
  const remoteOrders = new Map<string, any>()
  const remoteBatches = new Map<string, any>()
  const creates: any[] = []
  let payoutPosts = 0
  let capturePosts = 0
  let mode = 'success'
  let createTimeout = false
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://api-m.sandbox.paypal.com', 'all API traffic must stay in sandbox')
    if (url.pathname.endsWith('/oauth2/token')) return Response.json({ access_token: 'test-token' })
    const body = options?.body ? JSON.parse(String(options.body)) : undefined
    if (url.pathname === '/v2/checkout/orders') {
      creates.push(body)
      const key = (options?.headers as Record<string, string>)['PayPal-Request-Id']
      const order = remoteOrders.get(key) || { id: 'ORDER_' + key, status: 'APPROVED', purchase_units: [{ ...body.purchase_units[0], payments: { captures: [] } }] }
      remoteOrders.set(key, order)
      if (createTimeout) { createTimeout = false; throw new Error('Checkout response lost') }
      return Response.json(order)
    }
    const order = [...remoteOrders.values()].find(order => url.pathname === '/v2/checkout/orders/' + order.id || url.pathname === '/v2/checkout/orders/' + order.id + '/capture')
    if (order) {
      if (url.pathname.endsWith('/capture')) {
        capturePosts++
        order.status = 'COMPLETED'
        order.purchase_units[0].payments.captures = [{ id: 'CAP_' + order.id, status: 'COMPLETED', amount: { currency_code: 'USD', value: order.purchase_units[0].amount.value } }]
      }
      return Response.json(order)
    }
    if (url.pathname.startsWith('/v2/payments/captures/')) {
      const capture = [...remoteOrders.values()].flatMap(order => order.purchase_units[0].payments.captures).find(capture => url.pathname.endsWith(capture.id))
      assert.ok(capture)
      return Response.json(capture)
    }
    if (url.pathname === '/v1/payments/payouts') {
      payoutPosts++
      const id = body.sender_batch_header.sender_batch_id
      assert.equal((options?.headers as Record<string, string>)['PayPal-Request-Id'], id)
      assert.ok((await db.query<any>('SELECT first_submitted_at FROM sandbox_payout_batches WHERE id=$1', [id])).rows[0].first_submitted_at)
      if (mode === 'denied') return Response.json({ name: 'INSUFFICIENT_FUNDS' }, { status: 422 })
      const existing = remoteBatches.get(id)
      if (existing) return Response.json({ name: 'DUPLICATE_BATCH_ID', links: [{ href: `https://api-m.sandbox.paypal.com/v1/payments/payouts/${existing.batch_header.payout_batch_id}`, rel: 'self' }] }, { status: 400 })
      const batch = {
        batch_header: { payout_batch_id: 'BATCH' + remoteBatches.size, batch_status: 'SUCCESS', sender_batch_header: body.sender_batch_header },
        items: body.items.map((item: any, i: number) => ({ payout_item_id: `ITEM${remoteBatches.size}_${i}`, transaction_status: mode === 'partial' && i === 1 ? 'FAILED' : mode === 'pending' ? 'PENDING' : 'SUCCESS', payout_item: item })),
      }
      remoteBatches.set(id, batch)
      if (mode === 'timeout') { mode = 'success'; throw new Error('Payout response lost after submission') }
      if (mode === 'rollback') { failSave = true; mode = 'success' }
      return Response.json({ batch_header: batch.batch_header })
    }
    if (url.pathname.startsWith('/v1/payments/payouts/')) {
      const batch = [...remoteBatches.values()].find(batch => url.pathname.endsWith(batch.batch_header.payout_batch_id))
      assert.ok(batch)
      return Response.json(batch)
    }
    throw new Error('Unexpected API request: ' + url.pathname)
  }
  try {
    await seed({ query: clientQuery } as any)
    async function setRecipients(value = recipients) {
      const w = await workspace()
      await mutate({ kind: 'settings', version: w.version, settings: { ...w.settings, retailerRecipients: value } })
    }
    await setRecipients()
    // Simulate legacy mappings still persisted before the settings form is saved.
    await db.query("UPDATE workspace SET settings=jsonb_set(settings,'{retailerRecipients}',$1::jsonb) WHERE id='demo'", [JSON.stringify(recipients)])
    async function proposal() {
      const c = await mutate({ kind: 'create', entityId: crypto.randomUUID(), draft: { name: 'Payout test', budget: 500, folderId: 'f_hurricane' } }) as any
      const items = [product('a.example', 1000), product('b.example', 2000)]
      const snapshot = sign({ kind: 'prices', products: items, budgetCents: 50000, expires: Date.now() + 600000 })
      await mutate({ kind: 'proposal', id: c.id, version: 1, request: 'Supplies', proposal: { items, snapshot, reasoning: [], shipping: 0, tax: 0, discount: 0 } })
      return { campaignId: c.id, snapshot, items: items.map(item => ({ id: item.id, qty: item.qty })) }
    }
    async function start() {
      const input = await proposal()
      const response = await createCheckout(request(input))
      assert.equal(response.status, 200, await response.clone().text())
      return { input, pending: await response.json() }
    }
    async function pay(pending: any): Promise<Order> {
      const response = await captureCheckout(request({ ticket: pending.ticket, orderId: pending.orderId, recipient: 'forged@example.com', amountCents: 1 }))
      assert.equal(response.status, 200, await response.clone().text())
      return (await response.json()).receipt
    }
    await t.test('legacy mappings are ignored; concurrent requests reuse automatic sandbox recipients', async () => {
      const input = await proposal()
      const expected = allocateRetailerPayouts([product('a.example', 1000), product('b.example', 2000)])
      const pool = new Set(sandboxRetailers.map(recipient => recipient.email))
      assert.ok(expected.every(item => pool.has(item.recipient)))
      const before = creates.length
      const responses = await Promise.all([createCheckout(request(input)), createCheckout(request(input))])
      assert.ok(responses.every(response => response.status === 200))
      const payments = await Promise.all(responses.map(response => response.json()))
      assert.equal(payments[0].orderId, payments[1].orderId)
      assert.equal(creates.length - before, 1)
      await setRecipients()
      const receipt = await pay(payments[0])
      assert.equal(receipt.payouts?.status, 'SUCCESS')
      assert.deepEqual(receipt.payouts?.items.map(item => item.recipient), expected.map(item => item.recipient))
      assert.equal((await pay(payments[0])).paypalTxn, receipt.paypalTxn)
      await setRecipients()
      assert.equal('retailerRecipients' in (await workspace()).settings, false)
    })
    await t.test('one checkout sends two retailer payouts and duplicate callbacks do not repay', async () => {
      const { input, pending } = await start()
      const beforePosts = payoutPosts, beforeCaptures = capturePosts
      const receipt = await pay(pending)
      assert.equal(receipt.payouts?.status, 'SUCCESS')
      assert.deepEqual(receipt.payouts?.items.map(item => [item.recipient, item.amountCents]), allocateRetailerPayouts([product('a.example', 1000), product('b.example', 2000)]).map(item => [item.recipient, item.amountCents]))
      await pay(pending)
      assert.equal(payoutPosts - beforePosts, 1)
      assert.equal(capturePosts - beforeCaptures, 1)
      assert.equal((await workspace()).campaigns.find(c => c.id === input.campaignId)?.orders.length, 1)
    })
    await t.test('recipient and cart snapshots survive checkout response loss and settings changes', async () => {
      const input = await proposal()
      createTimeout = true
      assert.equal((await createCheckout(request(input))).status, 400)
      await setRecipients(recipients.map(r => ({ ...r, email: 'changed@sandbox.example' })))
      const response = await createCheckout(request({ ...input, items: [{ id: 'a.example', qty: 20 }] }))
      assert.equal(response.status, 200)
      assert.deepEqual(creates.at(-1), creates.at(-2))
      const receipt = await pay(await response.json())
      assert.equal(receipt.totalCents, 3390)
      assert.deepEqual(receipt.payouts?.items.map(item => item.recipient), allocateRetailerPayouts([product('a.example', 1000), product('b.example', 2000)]).map(item => item.recipient))
      await setRecipients()
    })
    await t.test('lost payout response recovers original batch through duplicate protection', async () => {
      const { pending, input } = await start()
      const before = remoteBatches.size
      mode = 'timeout'
      const receipt = await pay(pending)
      assert.match(receipt.payouts?.error || '', /response lost/)
      const results = await Promise.all([processPayouts(input.campaignId), processPayouts(input.campaignId)])
      assert.ok(results.every(orders => orders[0].payouts?.status === 'SUCCESS'))
      assert.equal(remoteBatches.size - before, 1)
    })
    await t.test('database rollback after payout retains committed intent and recovers without another batch', async () => {
      const { pending, input } = await start()
      const before = remoteBatches.size
      mode = 'rollback'
      const receipt = await pay(pending)
      assert.equal(receipt.payouts?.status, 'QUEUED')
      failSave = false
      const saved = (await workspace()).campaigns.find(c => c.id === input.campaignId)!
      assert.equal(saved.orders.length, 1)
      assert.equal((await processPayouts(input.campaignId))[0].payouts?.status, 'SUCCESS')
      assert.equal(remoteBatches.size - before, 1)
    })
    await t.test('partial failure and insufficient balance preserve captured purchases without retries', async () => {
      for (const outcome of ['partial', 'denied']) {
        const { pending, input } = await start()
        mode = outcome
        const receipt = await pay(pending)
        assert.equal(receipt.payouts?.status, outcome === 'partial' ? 'PARTIAL' : 'FAILED')
        assert.equal(receipt.totalCents, 3390)
        const before = payoutPosts
        await processPayouts(input.campaignId)
        assert.equal(payoutPosts, before)
        mode = 'success'
      }
    })
    await t.test('pending payouts refresh individually without another submission', async () => {
      const { pending, input } = await start()
      mode = 'pending'
      const receipt = await pay(pending)
      mode = 'success'
      assert.equal(receipt.payouts?.status, 'PENDING')
      const before = payoutPosts
      const batch = remoteBatches.get(receipt.payouts!.id)
      batch.items.forEach((item: any) => { item.transaction_status = 'SUCCESS' })
      const response = await refreshPayouts(request({ campaignId: input.campaignId, orderId: receipt.id }))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).receipt.payouts.status, 'SUCCESS')
      assert.equal(payoutPosts, before)
    })
    await t.test('mismatched PayPal recipients, amounts, currencies and batch identities cannot verify payouts', async () => {
      for (const mismatch of ['recipient', 'amount', 'currency', 'batch']) {
        const { pending, input } = await start()
        mode = 'pending'
        const receipt = await pay(pending)
        mode = 'success'
        const batch = remoteBatches.get(receipt.payouts!.id)
        if (mismatch === 'recipient') batch.items[0].payout_item.receiver = 'other@sandbox.example'
        if (mismatch === 'amount') batch.items[0].payout_item.amount.value = '0.01'
        if (mismatch === 'currency') batch.items[0].payout_item.amount.currency = 'EUR'
        if (mismatch === 'batch') batch.batch_header.sender_batch_header.sender_batch_id = 'different-batch'
        batch.items.forEach((item: any) => { item.transaction_status = 'SUCCESS' })
        const updated = (await processPayouts(input.campaignId))[0]
        assert.notEqual(updated.payouts?.status, 'SUCCESS')
        assert.match(updated.payouts?.error || '', /mismatch|could not be verified/)
        assert.equal(updated.paypalTxn, receipt.paypalTxn)
      }
    })
    await t.test('callback loss queues payouts during capture recovery; legacy attempts remain unchanged', async () => {
      const { pending, input } = await start()
      const remote = [...remoteOrders.values()].find(order => order.id === pending.orderId)
      remote.status = 'COMPLETED'
      remote.purchase_units[0].payments.captures = [{ id: 'CAP_' + remote.id, status: 'COMPLETED', amount: { currency_code: 'USD', value: '33.90' } }]
      await withCampaign(input.campaignId, async (c, client) => { await recoverCheckout(c, client) })
      assert.equal((await processPayouts(input.campaignId))[0].payouts?.status, 'SUCCESS')
      const legacy = await start()
      await query('UPDATE payment_attempts SET payout_plan=NULL WHERE campaign_id=$1', [legacy.input.campaignId])
      const before = payoutPosts
      assert.equal((await pay(legacy.pending)).payouts, undefined)
      assert.equal(payoutPosts, before)
    })
    await t.test('old ambiguous requests and refunded captures never send payouts', async () => {
      for (const state of ['old', 'refunded']) {
        const { pending, input } = await start()
        mode = 'timeout'
        await pay(pending)
        const before = payoutPosts
        if (state === 'old') await query('UPDATE sandbox_payout_batches SET first_submitted_at=$2 WHERE campaign_id=$1', [input.campaignId, Date.now() - 31 * 86400000])
        else {
          const remote = [...remoteOrders.values()].find(order => order.id === pending.orderId)
          remote.purchase_units[0].payments.captures[0].status = 'REFUNDED'
        }
        assert.equal((await processPayouts(input.campaignId))[0].payouts?.status, 'NEEDS_REVIEW')
        assert.equal(payoutPosts, before)
      }
    })
    await t.test('captured purchases and recovered retailer payouts retain valid evidence', async () => {
      for (const { id } of (await query('SELECT id FROM campaigns')).rows as { id: string }[]) {
        const result = await campaignEvidence(id)
        assert.equal(result.verification.valid, true, result.verification.error)
      }
    })
    await t.test('payout status refresh cannot create an intent for a sample or unknown purchase', async () => {
      assert.equal((await refreshPayouts(request({ campaignId: 'demo_completed', orderId: 'DEMO_ORDER_001' }))).status, 400)
      assert.equal((await refreshPayouts(request({ campaignId: 'missing', orderId: 'missing' }))).status, 400)
    })
  } finally {
    failSave = false
    globalThis.fetch = originalFetch
    delete (globalThis as any).provaPool
    await db.close()
  }
})
