import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoicePayment, linkedCapture, refundDetails, usdCents } from '../lib/server/paypal-verification'

const usd = (value: string) => ({ currency_code: 'USD', value })

test('PayPal money rejects rounding, nonfinite, negative and unsafe amounts', () => {
  assert.equal(usdCents(usd('12.34')), 1234)
  assert.equal(usdCents(usd('0.1')), 10)
  for (const amount of [usd('1.001'), usd('1e2'), usd('-1.00'), usd('NaN'), usd('Infinity'),
    usd('9007199254740992'), { value: '1.00' }, { currency_code: 'EUR', value: '1.00' }]) {
    assert.throws(() => usdCents(amount))
  }
})

test('invoice checks require matching identity, total and currency and exclude uncompleted receipts', () => {
  const invoice = { id: 'INV1', status: 'PAID', amount: usd('10.00'), payments: { paid_amount: usd('10.00') } }
  assert.equal(invoicePayment(invoice, 'INV1', 1000), 1000)
  for (const status of ['DRAFT', 'UNPAID', 'PAYMENT_PENDING', 'MARKED_AS_PAID']) {
    assert.equal(invoicePayment({ ...invoice, status }, 'INV1', 1000), 0)
  }
  assert.throws(() => invoicePayment(invoice, 'OTHER', 1000))
  assert.throws(() => invoicePayment(invoice, 'INV1', 999))
  assert.throws(() => invoicePayment({ ...invoice, status: 'UNKNOWN' }, 'INV1', 1000))
  assert.throws(() => invoicePayment({ ...invoice, payments: undefined }, 'INV1', 1000))
  assert.throws(() => invoicePayment({ ...invoice, payments: { paid_amount: usd('10.01') } }, 'INV1', 1000))
  assert.equal(invoicePayment({ ...invoice, payments: { paid_amount: usd('10.00'), transactions: [
    { type: 'EXTERNAL', amount: usd('8.00') }, { type: 'PAYPAL', amount: usd('2.00') },
  ] } }, 'INV1', 1000), 200)
})

test('refund identity and capture relationship come from exact API identifiers', () => {
  const refund = { id: 'R1', status: 'COMPLETED', amount: usd('2.00'), links: [
    { rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/C1' },
  ] }
  assert.equal(refundDetails(refund, 'R1', 'C1', 200), 200)
  for (const host of ['api.sandbox.paypal.com', 'api.paypal.com', 'api-m.sandbox.paypal.com', 'api-m.paypal.com']) {
    assert.equal(linkedCapture({ links: [{ rel: 'up', href: `https://${host}/v2/payments/captures/C1` }] }), 'C1')
  }
  assert.throws(() => refundDetails(refund, 'R2', 'C1'))
  assert.throws(() => refundDetails(refund, 'R1', 'C2'))
  assert.throws(() => refundDetails(refund, 'R1', 'C1', 201))
  assert.throws(() => refundDetails({ ...refund, status: 'UNKNOWN' }, 'R1', 'C1'))
  assert.equal(linkedCapture({ links: [{ rel: 'up', href: 'https://evil.example/v2/payments/captures/C1' }] }), undefined)
  assert.equal(linkedCapture({ links: [{ rel: 'up', href: 'https://api-m.paypal.com.evil.example/v2/payments/captures/C1' }] }), undefined)
})
