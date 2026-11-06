const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => mocks[name], mod, mod.exports)
  return mod.exports
}

function checkout(paypalRest, wallet = null) {
  return load('lib/server/checkout.ts', {
    './common': { verify: JSON.parse, sign: JSON.stringify },
    './paypal': { paypalRest },
    './vault': { savedWallet: async () => wallet },
    '../money': load('lib/money.ts'),
  })
}
const payment = () => ({
  orderId: 'order1',
  ticket: JSON.stringify({ kind: 'payment', orderId: 'order1', campaignId: 'campaign1', items: [{ supplier: 'Demo supplier' }], totalCents: 1234 }),
})
const paid = (value = '12.34', currency = 'USD', status = 'COMPLETED') => ({
  status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'capture1', status, amount: { value, currency_code: currency } }] } }],
})

for (const wallet of [null, { id: 'saved-wallet' }]) {
  test(`${wallet ? 'saved-wallet' : 'one-time'} checkout line items and charges match the signed total`, async () => {
    const products = [
      { id: 'water', name: 'Water', unitPrice: 1.37, unitPriceCents: 137, qty: 3 },
      { id: 'blanket', name: 'Blanket', unitPrice: 2.99, unitPriceCents: 299, qty: 2 },
    ]
    const attemptId = '00000000-0000-4000-8000-000000000001'
    const api = checkout(async (path, method, body, requestId) => {
      assert.equal(path, '/v2/checkout/orders')
      assert.equal(method, 'POST')
      assert.equal(requestId, attemptId)
      const unit = body.purchase_units[0]
      const lineTotal = unit.items.reduce((sum, item) =>
        sum + Math.round(Number(item.unit_amount.value) * 100) * Number(item.quantity), 0)
      const breakdown = unit.amount.breakdown
      assert.equal(lineTotal, Math.round(Number(breakdown.item_total.value) * 100))
      assert.equal(lineTotal + Math.round(Number(breakdown.shipping.value) * 100)
        + Math.round(Number(breakdown.tax_total?.value || 0) * 100), 1140)
      assert.equal(unit.amount.value, '11.40')
      assert.equal(unit.amount.currency_code, 'USD')
      if (wallet) assert.equal(body.payment_source.paypal.vault_id, wallet.id)
      return { id: 'order1', status: 'APPROVED' }
    }, wallet)
    const result = await api.createCheckout({
      campaignId: 'campaign1',
      attemptId,
      snapshot: JSON.stringify({ kind: 'prices', products, budgetCents: 2000, expires: Date.now() + 60000 }),
      items: products.map(({ id, qty }) => ({ id, qty })),
    }, 'https://demo.example')
    assert.equal(JSON.parse(result.ticket).totalCents, 1140)
    assert.equal(result.plan.shipping, 0.5)
    assert.equal(result.plan.tax, 0.81)
  })
}

test('verified receipt preserves exact approved cents and retry returns the same payment reference', async () => {
  const calls = []
  const api = checkout(async (path, method = 'GET') => { calls.push({ path, method }); return paid() })
  for (let attempt = 0; attempt < 2; attempt++) {
    const { receipt, campaignId } = await api.captureCheckout(payment())
    assert.equal(campaignId, 'campaign1')
    assert.equal(receipt.approvedTotalCents, 1234)
    assert.equal(receipt.totalCents, 1234)
    assert.equal(receipt.paypalTxn, 'capture1')
    assert.equal(receipt.sandbox, true)
  }
  assert.deepEqual(calls, [
    { path: '/v2/checkout/orders/order1', method: 'GET' },
    { path: '/v2/checkout/orders/order1', method: 'GET' },
  ])
})

test('amount mismatches, wrong currency and pending captures cannot produce a verified receipt', async () => {
  for (const result of [paid('12.35'), paid('12.34', 'EUR'), paid('12.34', 'USD', 'PENDING')]) {
    await assert.rejects(checkout(async () => result).captureCheckout(payment()), /does not match|not completed/)
  }
})

test('capture timeout is recovered by retrieving authoritative payment status', async () => {
  const calls = []
  const api = checkout(async (path, method = 'GET', body, requestId) => {
    calls.push({ path, method, requestId })
    if (method === 'POST') throw new Error('Timeout after capture')
    return calls.length === 1 ? { status: 'APPROVED' } : paid()
  })
  const { receipt } = await api.captureCheckout(payment())
  assert.equal(receipt.paypalTxn, 'capture1')
  assert.deepEqual(calls, [
    { path: '/v2/checkout/orders/order1', method: 'GET', requestId: undefined },
    { path: '/v2/checkout/orders/order1/capture', method: 'POST', requestId: 'capture-order1' },
    { path: '/v2/checkout/orders/order1', method: 'GET', requestId: undefined },
  ])
})

test('a different order cannot use the signed approval ticket', async () => {
  await assert.rejects(checkout(async () => { throw new Error('Must not call PayPal') }).captureCheckout({ ...payment(), orderId: 'other' }), /Invalid payment reference/)
})
