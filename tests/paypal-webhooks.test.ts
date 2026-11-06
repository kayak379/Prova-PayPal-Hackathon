import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import type { Campaign } from '../lib/types'
import { sign } from '../lib/server/common'
import { receiveWebhook, processWebhook, InvalidWebhook } from '../lib/server/paypal-webhooks'
import { reconcile } from '../lib/server/finance'
import { applyFinance } from '../lib/server/finance-persistence'
import { withCampaign } from '../lib/server/workspace'
import { POST } from '../app/api/paypal/webhook/route'
import { proxy } from '../proxy'
import { NextRequest } from 'next/server'

const usd = (value: string) => ({ currency_code: 'USD', value })
const headers = () => new Headers({
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/test',
  'paypal-transmission-id': 'transmission-1',
  'paypal-transmission-sig': 'signature-fixture',
  'paypal-transmission-time': new Date().toISOString(),
})
const event = (type = 'PAYMENT.CAPTURE.COMPLETED', id = crypto.randomUUID()) => ({
  id, event_type: type,
  resource: { id: type === 'INVOICING.INVOICE.PAID' ? 'INV1' : type === 'PAYMENT.CAPTURE.COMPLETED' ? 'CAPTURE1' : 'REFUND1',
    // Payload money and status must never be used as financial evidence.
    status: 'COMPLETED', amount: usd('999999.00') },
})

test('verified PayPal webhook inbox and reconciliation', async t => {
  const db = new PGlite()
  process.env.DATABASE_URL = 'postgres://test'
  process.env.PAYPAL_CLIENT_ID = 'test-client'
  process.env.PAYPAL_CLIENT_SECRET = 'test-secret'
  process.env.PAYPAL_WEBHOOK_ID = 'registered-webhook-id'
  process.env.SESSION_SECRET = 'test-session-secret-with-thirty-two-characters'
  await db.exec(await readFile('db/migrations/001_workspace.sql', 'utf8'))
  await db.exec(await readFile('db/migrations/003_paypal_webhooks.sql', 'utf8'))

  // PGlite has one connection. Emulate pool checkout so concurrent requests use
  // independent transactions, just as PostgreSQL pool clients do in production.
  let tail = Promise.resolve()
  async function lock() {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>(resolve => { release = resolve })
    await previous
    return release
  }
  let failWrites = false
  const clientQuery = async (sql: string, params?: unknown[]) => {
    if (failWrites && sql.startsWith('UPDATE campaigns')) throw new Error('Simulated database write failure')
    return db.query(sql, params)
  }
  const query = async (sql: string, params?: unknown[]) => {
    const release = await lock()
    try { return await clientQuery(sql, params) } finally { release() }
  }
  ;(globalThis as unknown as { provaPool: Pool }).provaPool = {
    query,
    connect: async () => { const release = await lock(); return { query: clientQuery, release } },
  } as unknown as Pool

  let signature = 'SUCCESS'
  let failPath = ''
  const calls: string[] = []
  let capture: any, refund: any, invoice: any, remoteOrder: any
  const fetchBefore = globalThis.fetch
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://api-m.sandbox.paypal.com')
    assert.equal(options?.cache, 'no-store')
    calls.push(url.pathname)
    if (url.pathname === '/v1/oauth2/token') return Response.json({ access_token: 'test-token' })
    if (url.pathname === failPath) throw new Error('Simulated PayPal outage')
    if (url.pathname === '/v1/notifications/verify-webhook-signature') {
      const body = JSON.parse(String(options?.body))
      assert.equal(body.webhook_id, 'registered-webhook-id')
      assert.equal(body.transmission_sig, 'signature-fixture')
      assert.equal(body.auth_algo, 'SHA256withRSA')
      assert.ok(body.webhook_event.id)
      return Response.json({ verification_status: signature })
    }
    assert.equal(options?.method, 'GET', 'background processing must only read financial resources')
    if (url.pathname === '/v2/payments/captures/CAPTURE1') return Response.json(capture)
    if (url.pathname === '/v2/checkout/orders/ORDER1') return Response.json(remoteOrder)
    if (url.pathname === '/v2/payments/refunds/REFUND1') return Response.json(refund)
    if (url.pathname === '/v2/invoicing/invoices/INV1') return Response.json(invoice)
    if (url.pathname === '/v1/reporting/transactions') return Response.json({ transaction_details: [] })
    throw new Error('Unexpected request: ' + url.pathname)
  }

  const receipt = {
    id: 'ORDER1', paypalTxn: 'CAPTURE1', total: 10, totalCents: 1000,
    status: 'confirmed', items: [], supplier: 'Test', createdAt: Date.now(),
  }
  const readCampaign = async () => (await db.query<{ data: Campaign }>("SELECT data FROM campaigns WHERE id='c1'")).rows[0].data
  const inbox = async (id: string) => (await db.query<any>('SELECT * FROM paypal_webhook_events WHERE id=$1', [id])).rows[0]
  async function reset(options: { pending?: boolean; invoice?: boolean; deleted?: boolean } = {}) {
    await db.exec('DELETE FROM paypal_webhook_events; DELETE FROM payment_attempts; DELETE FROM campaigns;')
    calls.length = 0; signature = 'SUCCESS'; failPath = ''; failWrites = false
    capture = { id: 'CAPTURE1', status: 'COMPLETED', amount: usd('10.00'), supplementary_data: { related_ids: { order_id: 'ORDER1' } } }
    refund = { id: 'REFUND1', status: 'COMPLETED', amount: usd('2.00'), links: [
      { rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE1' },
    ] }
    invoice = { id: 'INV1', status: 'PAID', amount: usd('4.00'), payments: { paid_amount: usd('4.00') } }
    remoteOrder = { id: 'ORDER1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [capture], refunds: [] } }] }
    const data = {
      id: 'c1', name: 'Test campaign', budget: 100, folderId: 'f1', taxId: '', address: '', createdAt: Date.now(),
      orders: options.pending ? [] : [receipt], audit: [], ...(options.deleted ? { deletedAt: Date.now() } : {}),
      funding: options.invoice ? [{
        id: 'INV1', operationId: 'invoice-op', sponsor: 'Sponsor', items: [], amountCents: 400, receivedCents: 0, status: 'UNPAID',
        createdAt: Date.now(), proof: sign({ kind: 'invoice', id: 'INV1', campaignId: 'c1', amountCents: 400 }),
      }] : [],
    }
    await db.query('INSERT INTO campaigns(id,data) VALUES($1,$2)', ['c1', JSON.stringify(data)])
    if (options.pending) {
      const ticket = sign({ kind: 'payment', campaignId: 'c1', orderId: 'ORDER1', totalCents: 1000, items: [] })
      await db.query('INSERT INTO payment_attempts(campaign_id,attempt_id,data) VALUES($1,$2,$3)',
        ['c1', 'attempt1', JSON.stringify({ orderId: 'ORDER1', ticket })])
    }
  }
  try {
    await t.test('only the exact webhook POST bypasses session and origin checks', () => {
      assert.equal(proxy(new NextRequest('https://demo.example/api/paypal/webhook', { method: 'POST' })).status, 200)
      assert.equal(proxy(new NextRequest('https://demo.example/api/paypal/webhook')).status, 401)
      assert.equal(proxy(new NextRequest('https://demo.example/api/paypal/webhook/other', { method: 'POST' })).status, 403)
      assert.equal(proxy(new NextRequest('https://demo.example/api/finance', { method: 'POST' })).status, 403)
    })
    await t.test('missing or invalid signatures and verifier outages never enter the inbox', async () => {
      await reset()
      await assert.rejects(receiveWebhook(new Headers(), event()), InvalidWebhook)
      assert.equal(calls.length, 0)
      signature = 'FAILURE'
      await assert.rejects(receiveWebhook(headers(), event()), InvalidWebhook)
      signature = 'SUCCESS'; failPath = '/v1/notifications/verify-webhook-signature'
      await assert.rejects(receiveWebhook(headers(), event()), /outage/)
      assert.equal((await db.query('SELECT * FROM paypal_webhook_events')).rows.length, 0)
      assert.equal(calls.some(path => path.startsWith('/v2/')), false)
    })
    await t.test('concurrent duplicate deliveries commit one receipt and one completed event', async () => {
      await reset({ pending: true })
      const input = event()
      const results = await Promise.all([receiveWebhook(headers(), input), receiveWebhook(headers(), input)])
      assert.equal(results.filter(result => 'duplicate' in result).length, 1)
      const saved = await readCampaign()
      assert.equal(saved.orders.length, 1)
      assert.equal(saved.orders[0].totalCents, 1000)
      assert.equal(saved.audit.filter(entry => entry.message.includes(input.id)).length, 1)
      assert.ok((await inbox(input.id)).processed_at)
      assert.equal((await inbox(input.id)).attempts, 1)
      assert.equal((await db.query<any>('SELECT completed FROM payment_attempts')).rows[0].completed, true)
    })
    await t.test('API failure leaves a retryable event and no verified receipt', async () => {
      await reset({ pending: true })
      const input = event()
      failPath = '/v2/payments/captures/CAPTURE1'
      await assert.rejects(receiveWebhook(headers(), input), /outage/)
      assert.equal((await readCampaign()).orders.length, 0)
      assert.equal((await inbox(input.id)).processed_at, null)
      assert.equal((await inbox(input.id)).attempts, 1)
      failPath = ''
      await processWebhook(input.id)
      assert.equal((await readCampaign()).orders.length, 1)
      assert.equal((await inbox(input.id)).last_error, null)
    })
    await t.test('database failure rolls back receipt, attempt completion, audit and event completion together', async () => {
      await reset({ pending: true })
      failWrites = true
      const input = event()
      await assert.rejects(receiveWebhook(headers(), input), /database write failure/)
      assert.equal((await readCampaign()).orders.length, 0)
      assert.equal((await readCampaign()).audit.length, 0)
      assert.equal((await db.query<any>('SELECT completed FROM payment_attempts')).rows[0].completed, false)
      assert.equal((await inbox(input.id)).processed_at, null)
      failWrites = false
      await processWebhook(input.id)
      assert.equal((await readCampaign()).orders.length, 1)
    })
    await t.test('mismatched API capture amount or currency never confirms the webhook claim', async () => {
      for (const amount of [usd('12.00'), { currency_code: 'EUR', value: '10.00' }, usd('NaN')]) {
        await reset({ pending: true }); capture.amount = amount
        const input = event()
        await assert.rejects(receiveWebhook(headers(), input))
        assert.equal((await readCampaign()).orders.length, 0)
        assert.equal((await inbox(input.id)).processed_at, null)
      }
    })
    await t.test('unmatched resources remain pending for later ownership recovery', async () => {
      await reset()
      await db.query("UPDATE campaigns SET data=jsonb_set(data,'{orders}','[]')")
      const input = event()
      await assert.rejects(receiveWebhook(headers(), input), /not yet linked/)
      assert.equal((await inbox(input.id)).processed_at, null)
      await db.query("UPDATE campaigns SET data=jsonb_set(data,'{orders}',$1)", [JSON.stringify([receipt])])
      await processWebhook(input.id)
      assert.ok((await inbox(input.id)).processed_at)
    })
    await t.test('refund events use API details, deduplicate by resource, and resist delayed pending notifications', async () => {
      await reset()
      await receiveWebhook(headers(), event('PAYMENT.CAPTURE.REFUNDED'))
      await receiveWebhook(headers(), event('PAYMENT.REFUND.PENDING'))
      const saved = await readCampaign()
      assert.equal(saved.refunds!.length, 1)
      assert.equal(saved.refunds![0].amountCents, 200)
      assert.equal(saved.refunds![0].status, 'COMPLETED')
      assert.equal(saved.refunds![0].captureId, 'CAPTURE1')
    })
    await t.test('refunds arriving before capture callbacks recover the purchase in the same transaction', async () => {
      await reset({ pending: true, deleted: true })
      capture.status = 'REFUNDED'
      await receiveWebhook(headers(), event('PAYMENT.CAPTURE.REFUNDED'))
      const saved = await readCampaign()
      assert.equal(saved.orders.length, 1)
      assert.equal(saved.refunds!.length, 1)
      assert.ok(saved.deletedAt)
    })
    await t.test('invoice-paid events use the current invoice, including partial and pending states', async () => {
      await reset({ invoice: true })
      invoice.status = 'PAYMENT_PENDING'
      const pendingEvent = event('INVOICING.INVOICE.PAID')
      // Also support the nested invoice resource sent by invoicing webhooks.
      ;(pendingEvent.resource as any) = { invoice: { id: 'INV1', status: 'PAID' } }
      await receiveWebhook(headers(), pendingEvent)
      assert.equal((await readCampaign()).funding![0].receivedCents, 0)
      invoice.status = 'PARTIALLY_PAID'; invoice.payments.paid_amount = usd('1.00')
      await receiveWebhook(headers(), event('INVOICING.INVOICE.PAID'))
      assert.equal((await readCampaign()).funding![0].receivedCents, 100)
      invoice.status = 'PAID'; invoice.payments.paid_amount = usd('4.00')
      await receiveWebhook(headers(), event('INVOICING.INVOICE.PAID'))
      assert.equal((await readCampaign()).funding![0].receivedCents, 400)
    })
    await t.test('invalid invoice identity, currency or approved total rolls back funding updates', async () => {
      for (const changes of [{ id: 'OTHER' }, { amount: usd('9.00') }, { amount: { currency_code: 'EUR', value: '4.00' } }]) {
        await reset({ invoice: true }); Object.assign(invoice, changes)
        const input = event('INVOICING.INVOICE.PAID')
        await assert.rejects(receiveWebhook(headers(), input))
        assert.equal((await readCampaign()).funding![0].receivedCents, 0)
        assert.equal((await inbox(input.id)).processed_at, null)
      }
    })
    await t.test('reconciliation discovers missed captures, external refunds and paid invoices without webhooks', async () => {
      await reset({ pending: true, invoice: true })
      remoteOrder.purchase_units[0].payments.refunds = [{ id: 'REFUND1', status: 'COMPLETED', amount: usd('999.00') }]
      await withCampaign('c1', async (current, client) => {
        const result = await reconcile(current, client)
        applyFinance(current, result)
      })
      const saved = await readCampaign()
      assert.equal(saved.orders.length, 1)
      assert.equal(saved.refunds![0].amountCents, 200)
      assert.equal(saved.funding![0].receivedCents, 400)
      assert.equal((await db.query('SELECT * FROM paypal_webhook_events')).rows.length, 0)
    })
    await t.test('reconciliation never captures an approved order or records unverified embedded refunds', async () => {
      await reset({ pending: true })
      remoteOrder.status = 'APPROVED'
      await withCampaign('c1', async (current, client) => applyFinance(current, await reconcile(current, client)))
      assert.equal((await readCampaign()).orders.length, 0)
      await reset()
      remoteOrder.purchase_units[0].payments.refunds = [{ id: 'REFUND1', status: 'COMPLETED', amount: usd('2.00') }]
      failPath = '/v2/payments/refunds/REFUND1'
      await withCampaign('c1', async (current, client) => applyFinance(current, await reconcile(current, client)))
      assert.deepEqual((await readCampaign()).refunds, [])
      assert.ok((await readCampaign()).verification!.findings.some(f => f.includes('unavailable')))
    })
    await t.test('route rejects malformed or oversized bodies and returns retryable status on resource outages', async () => {
      await reset()
      const request = (body: string) => new Request('https://demo.example/api/paypal/webhook', { method: 'POST', headers: headers(), body })
      assert.equal((await POST(request('{'))).status, 400)
      assert.equal((await POST(request(' '.repeat(1024 * 1024 + 1)))).status, 413)
      failPath = '/v2/payments/captures/CAPTURE1'
      assert.equal((await POST(request(JSON.stringify(event())))).status, 503)
      failPath = ''
      const ignored = event('UNSUPPORTED.EVENT')
      assert.equal((await POST(request(JSON.stringify(ignored)))).status, 200)
      assert.equal(await inbox(ignored.id), undefined)
    })
  } finally {
    globalThis.fetch = fetchBefore
    delete (globalThis as any).provaPool
    await db.close()
  }
})
