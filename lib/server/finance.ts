import type {
  Campaign,
  FinanceAction,
  FundingRequest,
  PlanItem,
  PurchaseRefund,
} from '../types'
import { priceCents, totalsCents } from '../money'
import { sign, verify } from './common'
import { paypal, paypalRest } from './paypal'
import { invoiceQr } from './invoice-qr'
import type { PoolClient } from 'pg'
import { recoverCheckout } from './checkout-persistence'
import { invoicePayment, refundDetails, usdCents } from './paypal-verification'
const cents = (value: unknown) => Math.round(Number(value || 0) * 100)
const money = (value: number) => ({
  currency_code: 'USD',
  value: (value / 100).toFixed(2),
})
function reference(proof: string, campaignId: string, kind: string) {
  const ref = verify<any>(proof)
  if (ref.campaignId !== campaignId || ref.kind !== kind)
    throw new Error('Reference does not belong to this campaign.')
  return ref
}
export async function orderDetails(c: Campaign, orderId: string) {
  const local = c.orders.find((o) => o.id === orderId)
  if (!local) throw new Error('Order is outside this campaign.')
  const order = await paypalRest('/v2/checkout/orders/' + encodeURIComponent(orderId))
  const unit = order.purchase_units?.[0]
  const capture = unit?.payments?.captures?.find(
    (p: any) => p.id === local.paypalTxn,
  )
  if (order.id !== orderId || !capture || capture.amount.currency_code !== 'USD')
    throw new Error('Capture could not be verified in PayPal.')
  const refunds = (unit.payments.refunds || []).map((r: any) => ({
    id: r.id,
    status: r.status,
    amountCents: cents(r.amount.value),
  }))
  return {
    order,
    capture,
    refunds,
    remaining: Math.max(
      0,
      cents(capture.amount.value) -
        refunds
          .filter((r: any) => !['FAILED', 'CANCELLED'].includes(r.status))
          .reduce((s: number, r: any) => s + r.amountCents, 0),
    ),
  }
}
export async function prepareFinance(
  c: Campaign,
  input: any,
): Promise<FinanceAction> {
  const operationId = crypto.randomUUID()
  let payload: any
  if (input.kind === 'refund') {
    const result = await orderDetails(c, input.orderId)
    const amount = input.full ? result.remaining : input.amountCents
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > result.remaining
    )
      throw new Error(
        'Refund must be positive and no larger than the remaining refundable amount.',
      )
    payload = {
      kind: 'refund',
      orderId: input.orderId,
      captureId: result.capture.id,
      amountCents: amount,
      reason: String(input.reason || '').slice(0, 200),
    }
  } else if (input.kind === 'invoice') {
    let products: PlanItem[]
    let mock = false
    if (input.source === 'proposal') {
      const snapshot = verify<any>(c.proposal?.snapshot || '')
      if (snapshot.kind !== 'prices' || snapshot.expires < Date.now())
        throw new Error(
          'Proposal expired; use a verified purchase or rebuild the proposal.',
        )
      products = c.proposal!.items.map((item) => {
        const p = snapshot.products.find((p: PlanItem) => p.id === item.id)
        if (!p) throw new Error('Unknown proposal item.')
        return { ...p, qty: item.qty }
      })
      mock = !!snapshot.mock
    } else {
      const result = await orderDetails(c, input.source)
      const local = c.orders.find((o) => o.id === input.source)!
      products = local.items.map((item) => {
        const actual = result.order.purchase_units[0].items?.find(
          (p: any) =>
            p.name === item.name.slice(0, 127) &&
            cents(p.unit_amount?.value) === priceCents(item),
        )
        if (!actual)
          throw new Error('Purchase item cannot be verified in PayPal.')
        return {
          ...item,
          qty: Number(actual.quantity),
          unitPriceCents: cents(actual.unit_amount.value),
          unitPrice: Number(actual.unit_amount.value),
        }
      })
      mock = !!local.mock
    }
    if (
      !Array.isArray(input.items) ||
      !input.items.length ||
      input.items.length > 48
    )
      throw new Error('Select at least one item.')
    const seen = new Set<string>()
    const items = input.items.map((row: any) => {
      const p = products.find((p) => p.id === row.id)
      if (
        !p ||
        seen.has(row.id) ||
        !Number.isSafeInteger(row.qty) ||
        row.qty < 1 ||
        row.qty > p.qty
      )
        throw new Error('Invalid invoice selection or quantity.')
      seen.add(row.id)
      return { ...p, qty: row.qty }
    })
    const sponsor = String(input.sponsor || '')
      .trim()
      .slice(0, 200)
    const email = String(input.email || '').trim()
    if (!sponsor || (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))
      throw new Error('Enter a sponsor name and a valid optional email.')
    const emailInvoice = input.emailInvoice === true
    if (emailInvoice && !email)
      throw new Error(
        'A sponsor email address is required to email the invoice.',
      )
    payload = {
      emailInvoice,
      charges: totalsCents(items),
      kind: 'invoice',
      items,
      sponsor,
      email,
      mock,
      source: input.source,
      amountCents: totalsCents(items).total,
    }
  } else throw new Error('Unknown financial action.')
  const signed = {
    ...payload,
    campaignId: c.id,
    campaignName: c.name,
    operationId,
    expires: Date.now() + 900000,
  }
  return {
    kind: payload.kind,
    token: sign(signed),
    operationId,
    campaignId: c.id,
    amountCents: payload.amountCents,
    title:
      payload.kind === 'invoice'
        ? `Funding request for ${payload.sponsor}`
        : 'Refund purchase',
    items: payload.items,
    charges: payload.charges,
    emailInvoice: payload.emailInvoice,
    email: payload.email,
    orderId: payload.orderId,
    captureId: payload.captureId,
  }
}
export async function confirmFinance(c: Campaign, token: string) {
  const action = verify<any>(token)
  if (action.campaignId !== c.id || action.expires < Date.now())
    throw new Error(
      'Action expired or belongs to another campaign. Prepare it again.',
    )
  if (action.kind === 'invoice') {
    const existing = (c.funding || []).find(
      (f) => f.operationId === action.operationId,
    )
    if (existing) return { funding: existing }
    const revalidated = await prepareFinance(c, {
      kind: 'invoice',
      source: action.source,
      sponsor: action.sponsor,
      email: action.email,
      emailInvoice: action.emailInvoice === true,
      items: action.items.map((p: PlanItem) => ({ id: p.id, qty: p.qty })),
    })
    if (revalidated.amountCents !== action.amountCents)
      throw new Error(
        'Funding charges changed. Prepare and confirm a new funding request.',
      )
    const charges = totalsCents(action.items)
    const result = await paypal(
      'create_invoice',
      {
        currency_code: 'USD',
        reference: c.id,
        invoice_number: `P-${action.operationId.replaceAll('-', '').slice(0, 20)}`,
        invoicer_business_name: 'Prova Sandbox',
        primary_recipients: [
          {
            billing_info: {
              business_name: action.sponsor,
              ...(action.email ? { email_address: action.email } : {}),
            },
          },
        ],
        items: [
          ...action.items.map((p: PlanItem) => ({
            name: p.name.slice(0, 127),
            quantity: String(p.qty),
            unit_amount: money(priceCents(p)),
          })),
          ...[
            { name: 'Estimated shipping', value: charges.shipping },
            { name: 'Estimated tax', value: charges.tax },
          ]
            .filter((charge) => charge.value > 0)
            .map((charge) => ({
              name: charge.name,
              quantity: '1',
              unit_amount: money(charge.value),
            })),
        ],
        note: `Sandbox sponsor funding for ${c.name}. Includes estimated shipping and tax. ${action.mock ? 'Mock product data. ' : ''}No retailer fulfillment.`,
        allow_partial_payment: false,
        allow_tip: false,
      },
      action.operationId,
    )
    const id = result.id || result.href?.split('/').pop()
    if (!id) throw new Error('PayPal did not return an invoice ID.')
    const funding: FundingRequest = {
      id,
      operationId: action.operationId,
      sponsor: action.sponsor,
      email: action.email,
      emailInvoice: action.emailInvoice === true,
      items: action.items,
      amountCents: action.amountCents,
      charges,
      receivedCents: 0,
      status: 'DRAFT',
      mock: action.mock,
      createdAt: Date.now(),
      proof: sign({
        kind: 'invoice',
        emailInvoice: action.emailInvoice === true,
        email: action.email,
        campaignId: c.id,
        id,
        amountCents: action.amountCents,
      }),
    }
    return { funding }
  }
  if (action.kind !== 'refund') throw new Error('Unknown action.')
  const previous = (c.refunds || []).find(
    (r) => r.operationId === action.operationId,
  )
  if (previous) return { refund: previous }
  const state = await orderDetails(c, action.orderId)
  if (state.capture.id !== action.captureId)
    throw new Error('Capture mismatch.')
  // Replay the exact operation key even after a timeout; PayPal enforces idempotency.
  let refund: any
  for (const existing of state.refunds) {
    const details = await paypalRest('/v2/payments/refunds/' + encodeURIComponent(existing.id))
    if (details.invoice_id === action.operationId) {
      refund = details
      break
    }
  }
  if (!refund) {
    if (action.amountCents > state.remaining)
      throw new Error('Refund exceeds available funds.')
    refund = await paypal(
      'create_refund',
      {
        capture_id: action.captureId,
        amount: money(action.amountCents),
        invoice_id: action.operationId,
        note_to_payer: action.reason || 'Prova sandbox purchase refund',
      },
      action.operationId,
    )
  }
  const refundId = refund.id
  if (refundId)
    refund = await paypalRest('/v2/payments/refunds/' + encodeURIComponent(refundId))
  if (
    !refund.id ||
    refund.amount?.currency_code !== 'USD' ||
    cents(refund.amount.value) !== action.amountCents
  )
    throw new Error('Refund amount or currency was not confirmed by PayPal.')
  refundDetails(refund, refundId, action.captureId, action.amountCents)
  const record: PurchaseRefund = {
    id: refund.id,
    operationId: action.operationId,
    orderId: action.orderId,
    captureId: action.captureId,
    amountCents: cents(refund.amount.value),
    status: refund.status,
    reason: action.reason,
    proof: sign({
      kind: 'refund',
      campaignId: c.id,
      id: refund.id,
      orderId: action.orderId,
      captureId: action.captureId,
    }),
  }
  return { refund: record }
}
export async function refreshInvoice(c: Campaign, id: string, publish = false) {
  const local = (c.funding || []).find((f) => f.id === id)
  if (!local) throw new Error('Invoice outside campaign.')
  const ref = reference(local.proof, c.id, 'invoice')
  if (ref.id !== local.id) throw new Error('Invoice reference mismatch.')
  let data = await paypalRest('/v2/invoicing/invoices/' + encodeURIComponent(ref.id))
  let emailRequestedAt = local.emailRequestedAt
  if (publish && data.status === 'DRAFT') {
    if (
      ref.emailInvoice &&
      (!ref.email ||
        data.primary_recipients?.[0]?.billing_info?.email_address !== ref.email)
    )
      throw new Error(
        'Sponsor email differs from the confirmed recipient. Create a new funding request.',
      )
    await paypal(
      'send_invoice',
      {
        invoice_id: ref.id,
        send_to_recipient: ref.emailInvoice === true,
        send_to_invoicer: false,
      },
      `publish-${local.operationId}`,
    )
    if (ref.emailInvoice) emailRequestedAt = Date.now()
    data = await paypalRest('/v2/invoicing/invoices/' + encodeURIComponent(ref.id))
  }
  const paid = invoicePayment(data, ref.id, ref.amountCents ?? local.amountCents)
  let qr = local.qr
  if (qr) {
    try {
      qr = invoiceQr(qr)
    } catch {
      qr = undefined
    }
  }
  let error: string | undefined
  if (publish && data.status !== 'DRAFT') {
    try {
      const response = await paypal('generate_invoice_qr_code', {
        invoice_id: ref.id,
        width: 300,
        height: 300,
      })
      qr = invoiceQr(response)
    } catch (e) {
      error = e instanceof Error ? e.message : 'QR unavailable'
    }
  }
  const funding: FundingRequest = {
    ...local,
    emailInvoice: ref.emailInvoice === true,
    emailRequestedAt,
    status: data.status,
    amountCents: ref.amountCents ?? local.amountCents,
    receivedCents: paid,
    qr,
    paymentUrl:
      data.detail?.metadata?.recipient_view_url ||
      data.links?.find((l: any) => l.rel === 'payer-view')?.href ||
      local.paymentUrl,
    error,
  }
  return funding
}
export async function refreshRefund(c: Campaign, id: string) {
  const local = (c.refunds || []).find((r) => r.id === id)
  if (!local) throw new Error('Refund outside campaign.')
  const ref = reference(local.proof, c.id, 'refund')
  if (ref.id !== local.id || ref.captureId !== local.captureId || ref.orderId !== local.orderId)
    throw new Error('Refund reference mismatch.')
  const data = await paypalRest('/v2/payments/refunds/' + encodeURIComponent(ref.id))
  return {
    ...local,
    status: data.status,
    amountCents: refundDetails(data, ref.id, ref.captureId, local.amountCents),
  }
}
export async function reconcile(c: Campaign, client?: PoolClient) {
  const findings: string[] = []
  if (client) {
    try { await recoverCheckout(c, client) }
    catch (error) { findings.push(`Checkout verification unavailable — ${error instanceof Error ? error.message : 'error'}`) }
  }
  const refunds = [...(c.refunds || [])]
  const funding = [...(c.funding || [])]
  for (const order of c.orders) {
    try {
      const state = await orderDetails(c, order.id)
      findings.push(
        `${order.id}: PayPal ${state.order.status}${cents(state.capture.amount.value) !== (order.totalCents ?? cents(order.total)) ? ' — amount mismatch' : ''}`,
      )
      if (usdCents(state.capture.amount) !== (order.totalCents ?? cents(order.total)))
        throw new Error('Capture amount mismatch.')
      for (const r of state.refunds) {
        const existing = refunds.findIndex((v) => v.id === r.id)
        // Embedded order refunds are discovery hints. Fetch each refund before
        // changing money totals; an unavailable detail lookup changes nothing.
        const details = await paypalRest('/v2/payments/refunds/' + encodeURIComponent(r.id))
        const record = {
          id: r.id,
          status: details.status,
          amountCents: refundDetails(details, r.id, state.capture.id, refunds[existing]?.amountCents),
          operationId: refunds[existing]?.operationId || r.id,
          orderId: order.id,
          captureId: state.capture.id,
          proof: sign({
            kind: 'refund',
            campaignId: c.id,
            id: r.id,
            orderId: order.id,
            captureId: state.capture.id,
          }),
        }
        if (existing < 0) refunds.push(record)
        else refunds[existing] = { ...refunds[existing], ...record }
      }
    } catch (e) {
      findings.push(
        `${order.id}: verification unavailable — ${e instanceof Error ? e.message : 'error'}`,
      )
    }
  }
  for (let i = 0; i < refunds.length; i++)
    try {
      refunds[i] = await refreshRefund({ ...c, refunds }, refunds[i].id)
    } catch {
      findings.push(`${refunds[i].id}: refund verification unavailable`)
    }
  for (let i = 0; i < funding.length; i++)
    try {
      funding[i] = await refreshInvoice(c, funding[i].id)
      if (funding[i].error)
        findings.push(`${funding[i].id}: ${funding[i].error}`)
    } catch {
      findings.push(`${funding[i].id}: invoice verification unavailable`)
    }
  let reporting = 'Unavailable; direct resource checks shown above.'
  try {
    const data = await paypalRest('/v1/reporting/transactions?' + new URLSearchParams({
      start_date: new Date(Date.now() - 30 * 86400000).toISOString(),
      end_date: new Date().toISOString(), page_size: '100', page: '1',
    }))
    const ids = new Set(c.orders.map((o) => o.paypalTxn))
    const matches = (data.transaction_details || []).filter((t: any) =>
      ids.has(t.transaction_info?.transaction_id),
    )
    reporting = `${matches.length} campaign captures found in supplementary reporting; reporting can lag.`
  } catch {}
  return {
    refunds,
    funding,
    verification: { at: Date.now(), findings, reporting },
  }
}
