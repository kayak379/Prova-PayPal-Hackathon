const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs'),
  path = require('path'),
  ts = require('typescript'),
  crypto = require('crypto')
function load(file, mocks) {
  const filename = path.resolve(file)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) =>
      mocks[name] ||
      (name.startsWith('.')
        ? load(path.resolve(path.dirname(filename), name) + '.ts', mocks)
        : require(name)),
    mod,
    mod.exports,
  )
  return mod.exports
}
const sign = (x) => JSON.stringify(x)
const common = { sign, verify: JSON.parse, env: () => 'test' }
test('invoice QR extracts multipart image data and repairs previously saved responses', () => {
  const { invoiceQr } = load('lib/server/invoice-qr.ts', {})
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  const multipart = `--boundary\r\nContent-Disposition: form-data; name="image"\r\nContent-Type: text/plain\r\n\r\n${png}\r\n--boundary--\r\n`
  const expected = `data:image/png;base64,${png}`
  assert.equal(invoiceQr(multipart), expected)
  assert.equal(invoiceQr(`data:image/png;base64,${multipart}`), expected)
  assert.equal(invoiceQr({ image: png }), expected)
  assert.equal(invoiceQr(expected), expected)
  assert.throws(() => invoiceQr('<html>Error</html>'), /invalid QR/)
  assert.throws(() => invoiceQr({}), /no QR/)
})
const item = {
  id: 'water',
  name: 'Water',
  unitPrice: 2,
  unitPriceCents: 200,
  qty: 5,
}
const order = {
  id: 'order1',
  paypalTxn: 'capture1',
  total: 10,
  totalCents: 1000,
  items: [item],
}
const campaign = () => ({
  id: 'c1',
  name: 'Emergency',
  budget: 100,
  orders: [order],
  audit: [],
  proposal: {
    items: [item],
    snapshot: sign({
      kind: 'prices',
      expires: Date.now() + 3600000,
      products: [item],
    }),
  },
})
const paypalOrder = (refunds = []) => ({
  id: 'order1',
  status: 'COMPLETED',
  purchase_units: [
    {
      items: [
        {
          name: 'Water',
          quantity: '5',
          unit_amount: { currency_code: 'USD', value: '2.00' },
        },
      ],
      payments: {
        captures: [
          {
            id: 'capture1',
            amount: { currency_code: 'USD', value: '10.00' },
            status: 'COMPLETED',
          },
        ],
        refunds,
      },
    },
  ],
})
function setup(handler) {
  const calls = []
  const paypal = async (name, args, key) => {
    calls.push({ name, args, key })
    return handler(name, args, key)
  }
  const paypalRest = (url) => {
    const id = decodeURIComponent(url.split('/').pop())
    if (url.startsWith('/v2/checkout/orders/')) return paypal('get_order', { id })
    if (url.startsWith('/v2/invoicing/invoices/')) return paypal('get_invoice', { invoice_id: id })
    if (url.startsWith('/v2/payments/refunds/')) return paypal('get_refund', { refund_id: id })
    if (url.startsWith('/v1/reporting/transactions?')) return paypal('list_transactions', {})
    throw new Error('Unexpected PayPal URL: ' + url)
  }
  return {
    ...load('lib/server/finance.ts', {
      './common': common,
      './paypal': { paypal, paypalRest },
    }),
    calls,
  }
}
test('invoice preparation validates source quantities and includes estimated tax/shipping', async () => {
  const s = setup(() => {}),
    c = campaign()
  const action = await s.prepareFinance(c, {
    kind: 'invoice',
    source: 'proposal',
    sponsor: 'Sponsor',
    items: [{ id: 'water', qty: 3 }],
  })
  assert.equal(action.amountCents, 678)
  assert.deepEqual(action.charges, { subtotal: 600, shipping: 30, tax: 48, total: 678 })
  assert.equal(s.calls.length, 0)
  await assert.rejects(
    s.prepareFinance(c, {
      kind: 'invoice',
      source: 'proposal',
      sponsor: 'Sponsor',
      items: [{ id: 'water', qty: 6 }],
    }),
    /Invalid/,
  )
  await assert.rejects(
    s.prepareFinance(c, {
      kind: 'invoice',
      source: 'proposal',
      sponsor: 'Sponsor',
      items: [{ id: 'invented', qty: 1 }],
    }),
    /Invalid/,
  )
})
test('confirm creates a draft and resumes without duplicate invoice creation', async () => {
  const s = setup((name) => {
      assert.equal(name, 'create_invoice')
      return { id: 'INV2-TEST' }
    }),
    c = campaign()
  const a = await s.prepareFinance(c, {
    kind: 'invoice',
    source: 'proposal',
    sponsor: 'Sponsor',
    items: [{ id: 'water', qty: 2 }],
  })
  const r = await s.confirmFinance(c, a.token)
  assert.equal(r.funding.status, 'DRAFT')
  c.funding = [r.funding]
  await s.confirmFinance(c, a.token)
  assert.equal(s.calls.length, 1)
  assert.equal(s.calls[0].key, a.operationId)
})
test('publication suppresses all email notifications and preserves invoice after QR failure', async () => {
  let reads = 0
  const s = setup((name) => {
    if (name === 'get_invoice')
      return {
        id: 'inv1',
        status: reads++ ? 'UNPAID' : 'DRAFT',
        amount: { currency_code: 'USD', value: '4.00' },
        detail: {
          metadata: {
            recipient_view_url:
              'https://www.sandbox.paypal.com/invoice/payerView/details/test',
          },
        },
      }
    if (name === 'send_invoice') return {}
    throw Error('QR unavailable')
  })
  const c = campaign()
  c.funding = [
    {
      id: 'inv1',
      operationId: 'op1',
      proof: sign({ kind: 'invoice', campaignId: c.id, id: 'inv1' }),
      amountCents: 400,
      receivedCents: 0,
    },
  ]
  const result = await s.refreshInvoice(c, 'inv1', true)
  assert.equal(result.status, 'UNPAID')
  assert.equal(result.receivedCents, 0)
  assert.match(result.error, /QR unavailable/)
  const call = s.calls.find((c) => c.name === 'send_invoice')
  assert.equal(call.args.send_to_recipient, false)
  assert.equal(call.args.send_to_invoicer, false)
})
test('refund preparation verifies capture and rejects over-refunds', async () => {
  const s = setup(() =>
    paypalOrder([{ id: 'r1', status: 'PENDING', amount: { value: '3.00' } }]),
  )
  const c = campaign()
  const a = await s.prepareFinance(c, {
    kind: 'refund',
    orderId: 'order1',
    full: true,
  })
  assert.equal(a.amountCents, 700)
  assert.equal(a.orderId, 'order1')
  assert.equal(a.captureId, 'capture1')
  await assert.rejects(
    s.prepareFinance(c, {
      kind: 'refund',
      orderId: 'order1',
      amountCents: 701,
    }),
    /Refund must/,
  )
  await assert.rejects(
    s.prepareFinance(c, { kind: 'refund', orderId: 'other', full: true }),
    /outside/,
  )
})
test('refund confirmation uses exact cents, idempotency and deduplicates completed local operation', async () => {
  const s = setup((name) =>
    name === 'get_order'
      ? paypalOrder()
      : {
          id: 'r1',
          status: 'COMPLETED',
          amount: { currency_code: 'USD', value: '2.00' },
          links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/capture1' }],
        },
  )
  const c = campaign()
  const a = await s.prepareFinance(c, {
    kind: 'refund',
    orderId: 'order1',
    amountCents: 200,
  })
  const result = await s.confirmFinance(c, a.token)
  assert.equal(result.refund.amountCents, 200)
  assert.equal(
    s.calls.find((c) => c.name === 'create_refund').key,
    a.operationId,
  )
  c.refunds = [result.refund]
  await s.confirmFinance(c, a.token)
  assert.equal(s.calls.filter((c) => c.name === 'create_refund').length, 1)
})
test('changed availability rejects a refund before writing', async () => {
  let refunded = false
  const s = setup((name) =>
    name === 'get_order'
      ? paypalOrder(
          refunded
            ? [{ id: 'r1', status: 'COMPLETED', amount: { value: '9.00' } }]
            : [],
        )
      : { id: 'r1', invoice_id: 'different-operation' },
  )
  const c = campaign()
  const a = await s.prepareFinance(c, {
    kind: 'refund',
    orderId: 'order1',
    amountCents: 200,
  })
  refunded = true
  await assert.rejects(s.confirmFinance(c, a.token), /exceeds/)
  assert.equal(s.calls.filter((c) => c.name === 'create_refund').length, 0)
})
test('expired or cross-campaign actions never execute', async () => {
  const s = setup(() => {}),
    c = campaign()
  await assert.rejects(
    s.confirmFinance(c, sign({ campaignId: c.id, expires: 0 })),
    /expired/,
  )
  await assert.rejects(
    s.confirmFinance(
      c,
      sign({ campaignId: 'other', expires: Date.now() + 1000 }),
    ),
    /another/,
  )
  assert.equal(s.calls.length, 0)
})
test('only completed refunds reduce spending; funding never increases budget', () => {
  const { financeTotals } = load('lib/finance.ts', {})
  const c = campaign()
  c.refunds = [
    { id: 'r1', status: 'COMPLETED', amountCents: 200 },
    { id: 'r1', status: 'COMPLETED', amountCents: 200 },
    { id: 'r2', status: 'PENDING', amountCents: 300 },
    { id: 'r3', status: 'FAILED', amountCents: 100 },
  ]
  c.funding = [{ id: 'f1', receivedCents: 5000 }]
  assert.deepEqual(financeTotals(c), {
    gross: 1000,
    refunds: 200,
    net: 800,
    remaining: 9200,
    funding: 5000,
  })
})
test('reconciliation flags mismatches and reporting unavailability', async () => {
  const s = setup((name) => {
    if (name === 'get_order') return paypalOrder()
    throw Error('reporting unavailable')
  })
  const c = campaign()
  c.orders = [{ ...order, totalCents: 999 }]
  const result = await s.reconcile(c)
  assert.match(result.verification.findings[0], /mismatch/)
  assert.match(result.verification.reporting, /Unavailable/)
})
test('assistant uses native tools but preparation never confirms writes', async () => {
  let round = 0
  const calls = []
  const mocks = {
    './common': {
      ...common,
      external: async (url, req) => {
        const b = JSON.parse(req.body)
        assert(b.tools)
        return round++
          ? { choices: [{ message: { content: 'Review the refund action.' } }] }
          : {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    tool_calls: [
                      {
                        id: 'tool1',
                        type: 'function',
                        function: {
                          name: 'prepare_refund',
                          arguments: JSON.stringify({
                            orderId: 'order1',
                            amountCents: 200,
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }
      },
    },
    './finance': {
      prepareFinance: async (c, args) => {
        calls.push(args)
        return { title: 'Refund', amountCents: 200 }
      },
      orderDetails: async () => {},
      refreshInvoice: async () => {},
      refreshRefund: async () => {},
      reconcile: async () => {},
    },
  }
  const { financeChat } = load('lib/server/finance-agent.ts', mocks)
  const result = await financeChat(campaign(), 'Prepare a $2 refund')
  assert.equal(calls.length, 1)
  assert.equal(result.actions.length, 1)
  assert.equal(result.trace[0].tool, 'prepare_refund')
  assert.match(result.trace[0].summary, /confirmation required/)
})
test('assistant tool execution stops at eight calls', async () => {
  let calls = 0
  const tools = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    type: 'function',
    function: { name: 'order_status', arguments: '{"id":"order1"}' },
  }))
  const { financeChat } = load('lib/server/finance-agent.ts', {
    './common': {
      ...common,
      external: async () => ({
        choices: [{ message: { role: 'assistant', tool_calls: tools } }],
      }),
    },
    './finance': {
      orderDetails: async () => {
        calls++
        return {
          order: paypalOrder(),
          capture: { amount: { value: '10.00' } },
          remaining: 1000,
          refunds: [],
        }
      },
    },
  })
  const result = await financeChat(campaign(), 'Check status')
  assert.equal(calls, 8)
  assert.equal(result.trace.length, 8)
  assert.match(result.text, /limit/)
})

test('assistant cannot execute a financial write tool', async () => {
  const { financeChat } = load('lib/server/finance-agent.ts', {
    './common': {
      ...common,
      external: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'x',
                  type: 'function',
                  function: { name: 'create_refund', arguments: '{}' },
                },
              ],
            },
          },
        ],
      }),
    },
    './finance': {},
  })
  const result = await financeChat(campaign(), 'Refund immediately')
  assert(result.trace.every((t) => t.summary === 'Tool not allowed.'))
  assert.equal(result.actions.length, 0)
})
test('minimal refund responses are hydrated before recording amounts', async () => {
  const s = setup((name) =>
    name === 'get_order'
      ? paypalOrder()
      : name === 'create_refund'
        ? { id: 'r1', status: 'COMPLETED' }
        : {
            id: 'r1',
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '1.00' },
            links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/capture1' }],
          },
  )
  const c = campaign()
  const a = await s.prepareFinance(c, {
    kind: 'refund',
    orderId: 'order1',
    amountCents: 100,
  })
  const result = await s.confirmFinance(c, a.token)
  assert.equal(result.refund.amountCents, 100)
  assert(s.calls.some((c) => c.name === 'get_refund'))
})

test('paid invoice records only verified received funding', async () => {
  const s = setup(() => ({
    id: 'inv1',
    status: 'PAID',
    amount: { currency_code: 'USD', value: '4.00' },
    payments: { paid_amount: { currency_code: 'USD', value: '4.00' } },
  }))
  const c = campaign()
  c.funding = [
    {
      id: 'inv1',
      operationId: 'op1',
      proof: sign({
        kind: 'invoice',
        campaignId: c.id,
        id: 'inv1',
        amountCents: 400,
      }),
      amountCents: 400,
      receivedCents: 0,
    },
  ]
  const result = await s.refreshInvoice(c, 'inv1')
  assert.equal(result.receivedCents, 400)
  assert.equal(result.status, 'PAID')
  assert.equal(result.error, undefined)
})

test('invoice email requires a valid recipient and binds preference into confirmation and invoice proof', async () => {
  const s = setup(() => ({ id: 'inv-email' }))
  const c = campaign()
  const input = {
    kind: 'invoice',
    source: 'proposal',
    sponsor: 'Sponsor',
    items: [{ id: 'water', qty: 2 }],
    emailInvoice: true,
  }
  await assert.rejects(s.prepareFinance(c, input), /email address is required/)
  await assert.rejects(
    s.prepareFinance(c, { ...input, email: 'bad-address' }),
    /valid optional email/,
  )
  assert.equal(s.calls.length, 0)
  const action = await s.prepareFinance(c, {
    ...input,
    email: 'sponsor@example.com',
  })
  assert.equal(action.emailInvoice, true)
  assert.equal(action.email, 'sponsor@example.com')
  const signed = JSON.parse(action.token)
  assert.equal(signed.emailInvoice, true)
  assert.equal(signed.email, action.email)
  const { funding } = await s.confirmFinance(c, action.token)
  assert.equal(funding.emailInvoice, true)
  assert.equal(JSON.parse(funding.proof).email, action.email)
  assert.equal(JSON.parse(funding.proof).emailInvoice, true)
  assert.equal(
    s.calls[0].args.primary_recipients[0].billing_info.email_address,
    action.email,
  )
  assert.equal(s.calls.filter((x) => x.name === 'send_invoice').length, 0)
})

test('email publication notifies only the sponsor and does not resend after QR failure or refresh', async () => {
  let status = 'DRAFT'
  const s = setup((name) => {
    if (name === 'create_invoice') return { id: 'inv-email' }
    if (name === 'get_invoice')
      return {
        id: 'inv-email',
        status,
        amount: { currency_code: 'USD', value: '4.52' },
        primary_recipients: [
          { billing_info: { email_address: 'sponsor@example.com' } },
        ],
      }
    if (name === 'send_invoice') {
      status = 'UNPAID'
      return {}
    }
    throw Error('QR unavailable')
  })
  const c = campaign()
  const action = await s.prepareFinance(c, {
    kind: 'invoice',
    source: 'proposal',
    sponsor: 'Sponsor',
    email: 'sponsor@example.com',
    emailInvoice: true,
    items: [{ id: 'water', qty: 2 }],
  })
  c.funding = [(await s.confirmFinance(c, action.token)).funding]
  const result = await s.refreshInvoice(c, 'inv-email', true)
  assert.equal(result.status, 'UNPAID')
  assert.equal(typeof result.emailRequestedAt, 'number')
  assert.match(result.error, /QR unavailable/)
  c.funding = [result]
  await s.refreshInvoice(c, 'inv-email', true)
  await s.refreshInvoice(c, 'inv-email')
  const sends = s.calls.filter((x) => x.name === 'send_invoice')
  assert.equal(sends.length, 1)
  assert.equal(sends[0].args.send_to_recipient, true)
  assert.equal(sends[0].args.send_to_invoicer, false)
  assert.equal(sends[0].key, `publish-${action.operationId}`)
})

test('recipient changes at PayPal block email publication', async () => {
  const s = setup(() => ({
    status: 'DRAFT',
    primary_recipients: [
      { billing_info: { email_address: 'different@example.com' } },
    ],
  }))
  const c = campaign()
  c.funding = [
    {
      id: 'inv1',
      operationId: 'op1',
      proof: sign({
        kind: 'invoice',
        campaignId: c.id,
        id: 'inv1',
        amountCents: 400,
        emailInvoice: true,
        email: 'sponsor@example.com',
      }),
    },
  ]
  await assert.rejects(
    s.refreshInvoice(c, 'inv1', true),
    /differs from the confirmed recipient/,
  )
  assert.equal(s.calls.filter((x) => x.name === 'send_invoice').length, 0)
})

test('email remains opt-in even when an email is provided or browser records are changed', async () => {
  const s = setup((name) =>
    name === 'create_invoice'
      ? { id: 'inv1' }
      : name === 'get_invoice'
        ? { id: 'inv1', status: 'DRAFT', amount: { currency_code: 'USD', value: '4.52' } }
        : {},
  )
  const c = campaign()
  const action = await s.prepareFinance(c, {
    kind: 'invoice',
    source: 'proposal',
    sponsor: 'Sponsor',
    email: 'sponsor@example.com',
    items: [{ id: 'water', qty: 2 }],
  })
  assert.equal(action.emailInvoice, false)
  c.funding = [
    {
      ...(await s.confirmFinance(c, action.token)).funding,
      emailInvoice: true,
    },
  ]
  const result = await s.refreshInvoice(c, 'inv1', true)
  assert.equal(result.emailInvoice, false)
  assert.equal(result.emailRequestedAt, undefined)
  assert.equal(
    s.calls.find((x) => x.name === 'send_invoice').args.send_to_recipient,
    false,
  )
})

test('PayPal sponsor invoice line items exactly match the confirmed total including charges', async () => {
  const s = setup(() => ({ id: 'inv-charges' }))
  const c = campaign()
  const action = await s.prepareFinance(c, { kind: 'invoice', source: 'proposal', sponsor: 'Sponsor', items: [{ id: 'water', qty: 3 }] })
  const result = await s.confirmFinance(c, action.token)
  const request = s.calls.find(call => call.name === 'create_invoice').args
  const total = request.items.reduce((sum, item) => sum + Math.round(Number(item.unit_amount.value) * 100) * Number(item.quantity), 0)
  assert.equal(total, action.amountCents)
  assert.equal(result.funding.amountCents, 678)
  assert.equal(request.items[1].name, 'Estimated shipping')
  assert.equal(request.items[2].name, 'Estimated tax')
  assert.deepEqual(result.funding.charges, action.charges)
  assert.doesNotMatch(request.note, /excluded/)
})

test('supplier refunds isolate balances, reject repeats and allow refunding the remainder', async () => {
  const c = campaign()
  c.orders = [{ ...order, payouts: { id: 'batch', status: 'SUCCESS', items: [
    { retailer: 'a.example', amountCents: 600, senderItemId: 'a', recipient: 'a@example.com', status: 'SUCCESS' },
    { retailer: 'b.example', amountCents: 400, senderItemId: 'b', recipient: 'b@example.com', status: 'SUCCESS' },
  ] } }]
  let remote = []
  let refund
  const s = setup((name, args) => {
    if (name === 'get_order') return paypalOrder(remote)
    if (name === 'create_refund') {
      refund = { id: 'supplier-refund', status: 'COMPLETED', amount: args.amount, invoice_id: args.invoice_id,
        links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/capture1' }] }
      remote = [refund]
      return refund
    }
    if (name === 'get_refund') return refund
    throw Error('Unexpected call: ' + name)
  })
  await assert.rejects(s.prepareFinance(c, { kind: 'refund', orderId: order.id, refundScope: 'supplier', supplier: 'invented' }), /No refundable/)
  const a = await s.prepareFinance(c, { kind: 'refund', orderId: order.id, refundScope: 'supplier', supplier: 'a.example' })
  const stale = await s.prepareFinance(c, { kind: 'refund', orderId: order.id, refundScope: 'supplier', supplier: 'a.example' })
  assert.equal(a.amountCents, 600)
  assert.deepEqual(a.allocations, [{ retailer: 'a.example', amountCents: 600 }])
  const result = await s.confirmFinance(c, a.token)
  c.refunds = [result.refund]
  const { refundBalances } = load('lib/refund-allocation.ts', {})
  assert.deepEqual(refundBalances(c.orders[0], c.refunds), [{ retailer: 'a.example', amountCents: 0 }, { retailer: 'b.example', amountCents: 400 }])
  await assert.rejects(s.confirmFinance(c, stale.token), /Supplier refundable amount changed/)
  await assert.rejects(s.prepareFinance(c, { kind: 'refund', orderId: order.id, refundScope: 'supplier', supplier: 'a.example' }), /No refundable/)
  const all = await s.prepareFinance(c, { kind: 'refund', orderId: order.id, refundScope: 'all' })
  assert.equal(all.amountCents, 400)
  assert.deepEqual(all.allocations, [{ retailer: 'b.example', amountCents: 400 }])
  await s.confirmFinance(c, a.token)
  assert.equal(s.calls.filter(call => call.name === 'create_refund').length, 1)
})

test('refund allocation preserves cents and reserves pending but releases failed refunds', () => {
  const { refundBalances, splitRefund } = load('lib/refund-allocation.ts', {})
  const o = { id: 'o', payouts: { items: [{ retailer: 'a', amountCents: 67 }, { retailer: 'b', amountCents: 46 }] } }
  assert.deepEqual(splitRefund(o.payouts.items, 113), o.payouts.items)
  const shares = splitRefund(o.payouts.items, 11)
  assert.equal(shares.reduce((sum, s) => sum + s.amountCents, 0), 11)
  const refunds = [{ orderId: 'o', amountCents: 67, allocations: [{ retailer: 'a', amountCents: 67 }], status: 'PENDING' }]
  assert.deepEqual(refundBalances(o, refunds), [{ retailer: 'a', amountCents: 0 }, { retailer: 'b', amountCents: 46 }])
  assert.deepEqual(refundBalances(o, [{ ...refunds[0], status: 'FAILED' }]), o.payouts.items)
  assert.equal(refundBalances(o, [{ orderId: 'o', amountCents: 11, status: 'COMPLETED' }]).reduce((sum, b) => sum + b.amountCents, 0), 102)
})

test('supplier attribution recovers from signed intent after a lost response', () => {
  const { refundAttribution } = setup(() => {})
  const c = campaign()
  const allocations = [{ retailer: 'a.example', amountCents: 600 }]
  c.financeOperations = [{ id: 'op', action: { token: sign({ kind: 'refund', campaignId: c.id, operationId: 'op', captureId: 'capture1', allocations }) } }]
  assert.deepEqual(refundAttribution(c, 'op', 'capture1'), allocations)
  assert.equal(refundAttribution(c, 'op', 'other-capture'), undefined)
  assert.equal(refundAttribution(c, 'unknown', 'capture1'), undefined)
})

test('legacy partial refund shares remain stable after a supplier refund', () => {
  const { refundBalances } = load('lib/refund-allocation.ts', {})
  const o = { id: 'o', payouts: { items: [{ retailer: 'a', amountCents: 600 }, { retailer: 'b', amountCents: 400 }] } }
  const legacy = { orderId: 'o', amountCents: 200, status: 'COMPLETED' }
  assert.deepEqual(refundBalances(o, [legacy]), [{ retailer: 'a', amountCents: 480 }, { retailer: 'b', amountCents: 320 }])
  assert.deepEqual(refundBalances(o, [legacy, { orderId: 'o', amountCents: 480, status: 'COMPLETED', allocations: [{ retailer: 'a', amountCents: 480 }] }]), [{ retailer: 'a', amountCents: 0 }, { retailer: 'b', amountCents: 320 }])
})
