const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function checkout(paypal) {
  const code = ts.transpileModule(fs.readFileSync('lib/server/checkout.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  const mocks = {
    './common': { verify: JSON.parse, sign: JSON.stringify },
    './paypal': { paypal }, './vault': {}, '../money': {},
  }
  new Function('require', 'module', 'exports', code)(name => mocks[name], mod, mod.exports)
  return mod.exports
}
const payment = () => ({
  orderId: 'order1',
  ticket: JSON.stringify({ kind: 'payment', orderId: 'order1', campaignId: 'campaign1', items: [{ supplier: 'Demo supplier' }], totalCents: 1234 }),
})
const paid = (value = '12.34', currency = 'USD', status = 'COMPLETED') => ({
  status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'capture1', status, amount: { value, currency_code: currency } }] } }],
})

test('verified receipt preserves exact approved cents and retry returns the same payment reference', async () => {
  const calls = []
  const api = checkout(async method => { calls.push(method); return paid() })
  for (let attempt = 0; attempt < 2; attempt++) {
    const { receipt, campaignId } = await api.captureCheckout(payment())
    assert.equal(campaignId, 'campaign1')
    assert.equal(receipt.approvedTotalCents, 1234)
    assert.equal(receipt.totalCents, 1234)
    assert.equal(receipt.paypalTxn, 'capture1')
    assert.equal(receipt.sandbox, true)
  }
  assert.deepEqual(calls, ['get_order', 'get_order'])
})

test('amount mismatches, wrong currency and pending captures cannot produce a verified receipt', async () => {
  for (const result of [paid('12.35'), paid('12.34', 'EUR'), paid('12.34', 'USD', 'PENDING')]) {
    await assert.rejects(checkout(async () => result).captureCheckout(payment()), /does not match|not completed/)
  }
})

test('capture timeout is recovered by retrieving authoritative payment status', async () => {
  const calls = []
  const api = checkout(async method => {
    calls.push(method)
    if (method === 'pay_order') throw new Error('Timeout after capture')
    return calls.length === 1 ? { status: 'APPROVED' } : paid()
  })
  const { receipt } = await api.captureCheckout(payment())
  assert.equal(receipt.paypalTxn, 'capture1')
  assert.deepEqual(calls, ['get_order', 'pay_order', 'get_order'])
})

test('a different order cannot use the signed approval ticket', async () => {
  await assert.rejects(checkout(async () => { throw new Error('Must not call PayPal') }).captureCheckout({ ...payment(), orderId: 'other' }), /Invalid payment reference/)
})
