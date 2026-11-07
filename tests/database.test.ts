import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { bootstrapWallet } from '../db/bootstrap-wallet'
import { sealWallet, openWallet } from '../lib/server/wallet-crypto'
import { seed } from '../db/seed'
import { mutate, workspace, withCampaign, Conflict } from '../lib/server/workspace'
import { newSession, validSession, SESSION_COOKIE } from '../lib/server/session'
import { proxy } from '../proxy'
import { NextRequest } from 'next/server'
import { applyFinance } from '../lib/server/finance-persistence'
import { POST as createCheckout } from '../app/api/checkout/create/route'
import { POST as captureCheckout } from '../app/api/checkout/capture/route'
import { appOrigin } from '../lib/server/origin'
import { POST as login } from '../app/api/auth/login/route'
import { POST as logout } from '../app/api/auth/logout/route'
import { sign } from '../lib/server/common'
import type { Pool } from 'pg'

test('PostgreSQL workspace integration', async t => {
  const db = new PGlite()
  process.env.DATABASE_URL = 'postgres://test'
  process.env.SESSION_SECRET = 'test-secret-with-at-least-thirty-two-characters'
  process.env.PAYPAL_CLIENT_ID = 'test-client'
  process.env.PAYPAL_CLIENT_SECRET = 'test-paypal-secret'
  const query = (sql: string, params?: unknown[]) => db.query(sql, params)
  const client = { query, release() {} }
  ;(globalThis as unknown as { provaPool: Pool }).provaPool = { query, connect: async () => client } as unknown as Pool
  await db.exec(await readFile('db/migrations/001_workspace.sql', 'utf8'))
  await db.exec(await readFile('db/migrations/002_wallet_bootstrap.sql', 'utf8'))
  await db.exec(await readFile('db/migrations/004_sandbox_payouts.sql', 'utf8'))
  try {
    await t.test('seed once and preserve edits on repeated deployment', async () => {
      await seed(client as any)
      let w = await workspace()
      assert.equal(w.campaigns.length, 3)
      await mutate({ kind: 'settings', version: w.version, settings: { ...w.settings, orgName: 'Our demo team' } })
      await seed(client as any)
      w = await workspace()
      assert.equal(w.settings.orgName, 'Our demo team')
      assert.equal(w.campaigns.length, 3)
      assert.ok(w.campaigns.every(c => c.demo))
    })
    await t.test('preapproved wallet imports once and respects disconnects', async () => {
      const secret = process.env.PAYPAL_CLIENT_SECRET!
      const encrypted = sealWallet({ id: 'sandbox-token-fixture', email: 'buyer@example.com' }, secret)
      await assert.rejects(bootstrapWallet(client as any, 'bad-token', secret))
      await bootstrapWallet(client as any, encrypted, secret)
      let row = (await db.query<{ wallet: string; wallet_bootstrapped: boolean }>("SELECT wallet,wallet_bootstrapped FROM workspace WHERE id='demo'")).rows[0]
      assert.equal(openWallet(row.wallet, secret).email, 'buyer@example.com'); assert.equal(row.wallet_bootstrapped, true)
      await db.query("UPDATE workspace SET wallet=NULL WHERE id='demo'")
      await bootstrapWallet(client as any, encrypted, secret)
      assert.equal((await db.query<{wallet:string|null}>("SELECT wallet FROM workspace WHERE id='demo'")).rows[0].wallet, null)
    })
    await t.test('create, update, reject stale edits and invalid budgets', async () => {
      const draft = { name: 'Live test', budget: 3000, folderId: 'f_hurricane', taxId: 'test', address: 'Shelter' }
      const c = await mutate({ kind: 'create', entityId: crypto.randomUUID(), draft }) as any
      const retry = await mutate({ kind: 'create', entityId: c.id, draft }) as any
      assert.equal(retry.id, c.id)
      assert.equal((await workspace()).campaigns.filter(v => v.id === c.id).length, 1)
      const folderId = crypto.randomUUID()
      await mutate({ kind: 'folder', entityId: folderId, name: 'Test folder' })
      await mutate({ kind: 'folder', entityId: folderId, name: 'Test folder' })
      assert.equal((await workspace()).folders.filter(f => f.id === folderId).length, 1)
      let saved = (await workspace()).campaigns.find(v => v.id === c.id)!
      await mutate({ kind: 'campaign', id: c.id, version: saved.version, changes: { ...draft, name: 'Saved on server' } })
      await assert.rejects(mutate({ kind: 'campaign', id: c.id, version: saved.version, changes: draft }), Conflict)
      saved = (await workspace()).campaigns.find(v => v.id === c.id)!
      await assert.rejects(mutate({ kind: 'campaign', id: c.id, version: saved.version, changes: { ...draft, budget: -1 } }))
      assert.equal((await workspace()).campaigns.find(v => v.id === c.id)!.name, 'Saved on server')
    })
    await t.test('financial records are server-owned and transactions roll back', async () => {
      let c = (await workspace()).campaigns.find(c => c.id === 'demo_completed')!
      const original = c.orders[0]
      await mutate({ kind: 'finance', id: c.id, version: c.version, patch: { orders: [], funding: [{ id: 'forged' }], refunds: [{ id: 'forged' }] } })
      const actual = (await workspace()).campaigns.find(c => c.id === 'demo_completed')!
      assert.deepEqual(actual.orders[0], original)
      assert.equal(actual.funding, undefined)
      await assert.rejects(withCampaign(actual.id, async c => { c.name = 'Must roll back'; throw new Error('network failure') }))
      assert.notEqual((await workspace()).campaigns.find(c => c.id === actual.id)!.name, 'Must roll back')
      const refund = {
        id: 'refund1',
        status: 'COMPLETED',
        orderId: original.id,
        captureId: original.paypalTxn,
        amountCents: 100,
        operationId: 'refund-operation',
        proof: 'test-proof',
      }
      await withCampaign(actual.id, async c => {
        applyFinance(c, { refund })
        applyFinance(c, { refund })
      })
      assert.equal((await workspace()).campaigns.find(c => c.id === actual.id)!.refunds!.length, 1)
    })
    await t.test('checkout persists a reusable attempt before network failure', async () => {
      const w = await workspace()
      await mutate({ kind: 'settings', version: w.version, settings: { ...w.settings, retailerRecipients: [{ domain: 'test.example', email: 'retailer@sandbox.example' }] } })
      const c = await mutate({ kind: 'create', entityId: crypto.randomUUID(), draft: { name: 'Checkout test', budget: 5000, folderId: 'f_hurricane' } }) as any
      const items = [{ id: 'water', name: 'Water', category: 'Water', supplier: 'test.example', unitPrice: 10, unitPriceCents: 1000, qty: 1, delivery: 'Tomorrow' }]
      const snapshot = sign({ kind: 'prices', products: items, budgetCents: 500000, expires: Date.now() + 60000 })
      await mutate({ kind: 'proposal', id: c.id, version: 1, request: 'Water', proposal: { items, snapshot, reasoning: [], shipping: 0, tax: 0, discount: 0 } })
      const originalFetch = globalThis.fetch
      const request = () => new Request('https://demo.example/api/checkout/create', { method: 'POST', body: JSON.stringify({ campaignId: c.id, snapshot, items: [{ id: 'water', qty: 1 }] }) })
      globalThis.fetch = async () => { throw new Error('Simulated timeout') }
      try {
        assert.equal((await createCheckout(request())).status, 400)
        const first = (await db.query<{ attempt_id: string }>('SELECT attempt_id FROM payment_attempts WHERE campaign_id=$1', [c.id])).rows[0].attempt_id
        assert.equal((await createCheckout(request())).status, 400)
        const second = (await db.query<{ attempt_id: string }>('SELECT attempt_id FROM payment_attempts WHERE campaign_id=$1', [c.id])).rows[0].attempt_id
        assert.equal(first, second)
        let creates = 0
        globalThis.fetch = async (url, options) => {
          if (String(url).includes('oauth2/token')) return Response.json({ access_token: 'test-token' })
          creates++
          assert.equal((options?.headers as Record<string,string>)['PayPal-Request-Id'], first)
          return Response.json({ id: 'TEST_ORDER', status: 'CREATED', links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=TEST_ORDER' }] })
        }
        const response = await createCheckout(request()); assert.equal(response.status, 200, await response.clone().text())
        const pending = await response.json()
        const retry = await createCheckout(request()); assert.equal(retry.status, 200)
        assert.equal((await retry.json()).orderId, pending.orderId)
        assert.equal(creates, 1)
        let captured = false
        const payoutPlan = (await db.query<any>('SELECT attempt_id FROM payment_attempts WHERE campaign_id=$1', [c.id])).rows[0]
        const payout = { batch_header: { payout_batch_id: 'BATCH1', batch_status: 'SUCCESS', sender_batch_header: { sender_batch_id: payoutPlan.attempt_id } }, items: [{ payout_item_id: 'ITEM1', transaction_status: 'SUCCESS', payout_item: { sender_item_id: 'retailer-1', receiver: 'retailer@sandbox.example', amount: { currency: 'USD', value: '11.30' } } }] }
        globalThis.fetch = async (url, options) => {
          if (String(url).includes('oauth2/token')) return Response.json({ access_token: 'test-token' })
          if (String(url).includes('/v1/payments/payouts')) return Response.json(payout)
          if (String(url).endsWith('/v2/payments/captures/TEST_CAPTURE')) return Response.json({ id: 'TEST_CAPTURE', status: 'COMPLETED', amount: { currency_code: 'USD', value: '11.30' } })
          if (String(url).endsWith('/capture')) {
            assert.equal((options?.headers as Record<string,string>)['PayPal-Request-Id'], 'capture-TEST_ORDER')
            captured = true
            return Response.json({ status: 'COMPLETED' })
          }
          return Response.json({ id: 'TEST_ORDER', status: captured ? 'COMPLETED' : 'APPROVED', purchase_units: [{ payments: { captures: captured ? [{ id: 'TEST_CAPTURE', status: 'COMPLETED', amount: { currency_code: 'USD', value: (pending.plan.items[0].unitPrice + pending.plan.shipping + pending.plan.tax).toFixed(2) } }] : [] } }] })
        }
        const captureRequest = () => new Request('https://demo.example/api/checkout/capture', { method: 'POST', body: JSON.stringify({ orderId: pending.orderId, ticket: pending.ticket }) })
        const capture = await captureCheckout(captureRequest())
        assert.equal(capture.status, 200, await capture.clone().text())
        assert.equal((await capture.json()).receipt.paypalTxn, 'TEST_CAPTURE')
        globalThis.fetch = async () => { throw new Error('Duplicate capture must not call PayPal') }
        assert.equal((await captureCheckout(captureRequest())).status, 200)
        const saved = (await workspace()).campaigns.find(v => v.id === c.id)!
        assert.equal(saved.orders.length, 1); assert.equal(saved.proposal, null)
        assert.equal(saved.orders[0].payouts?.status, 'SUCCESS')
        assert.equal((await db.query<{ completed: boolean }>('SELECT completed FROM payment_attempts WHERE campaign_id=$1', [c.id])).rows[0].completed, true)
      } finally { globalThis.fetch = originalFetch }
    })
    await t.test('campaign deletion hides data while preserving payment records and late captures', async () => {
      const c = (await workspace()).campaigns.find(c => c.name === 'Checkout test')!
      const otherIds = (await workspace()).campaigns.filter(v => v.id !== c.id).map(v => v.id)
      await assert.rejects(mutate({ kind: 'delete', id: c.id, version: c.version! - 1 }), Conflict)
      await mutate({ kind: 'delete', id: c.id, version: c.version })
      const after = await workspace()
      assert.equal(after.campaigns.some(v => v.id === c.id), false)
      assert.deepEqual(after.campaigns.map(v => v.id), otherIds)
      await mutate({ kind: 'delete', id: c.id, version: c.version })
      await assert.rejects(withCampaign(c.id, async () => {}), /Campaign not found/)
      await withCampaign(c.id, async archived => { assert.equal(archived.orders.length, 1); assert.ok(archived.deletedAt) }, true)
      assert.equal((await db.query('SELECT * FROM payment_attempts WHERE campaign_id=$1', [c.id])).rows.length, 1)
    })
    await t.test('login credentials, session cookies and logout', async () => {
      process.env.DEMO_EMAIL = 'team@example.com'; process.env.DEMO_PASSWORD = 'a-test-password'
      const request = (password: string) => new Request('https://demo.example/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'team@example.com', password }) })
      assert.equal((await login(request('wrong'))).status, 401)
      const response = await login(request('a-test-password'))
      assert.equal(response.status, 200)
      assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i)
      assert.match((await logout()).headers.get('set-cookie') || '', /Expires=/i)
    })
    await t.test('Render public origin behind HTTPS termination', () => {
      process.env.RENDER_EXTERNAL_URL = 'https://prova.onrender.com'
      assert.equal(appOrigin(new Request('http://localhost:10000/api/workspace')), 'https://prova.onrender.com')
      process.env.APP_URL = 'https://prova.example.com'
      assert.equal(appOrigin(new Request('http://localhost:10000')), 'https://prova.example.com')
      delete process.env.APP_URL; delete process.env.RENDER_EXTERNAL_URL
    })
    await t.test('sessions and request protection', async () => {
      const session = newSession()
      assert.ok(validSession(session)); assert.equal(validSession(session + 'tampered'), false)
      assert.equal(validSession(), false)
      assert.equal(proxy(new NextRequest('https://demo.example/api/workspace')).status, 401)
      assert.equal(proxy(new NextRequest('https://demo.example/dashboard')).status, 307)
      assert.equal(proxy(new NextRequest('https://demo.example/api/workspace', { method: 'POST', headers: { origin: 'https://evil.example', cookie: SESSION_COOKIE + '=' + session } })).status, 403)
      assert.equal(proxy(new NextRequest('https://demo.example/api/workspace', { headers: { cookie: SESSION_COOKIE + '=' + session } })).status, 200)
    })
  } finally { await db.close(); delete (globalThis as any).provaPool }
})
