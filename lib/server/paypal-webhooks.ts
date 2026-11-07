import type { PoolClient } from 'pg'
import type { Campaign, PurchaseRefund } from '../types'
import { env, sign } from './common'
import { database, transaction } from './db'
import { campaign, saveCampaign } from './workspace'
import { paypalRest } from './paypal'
import { linkedCapture, refundDetails, usdCents } from './paypal-verification'
import { recoverCheckout } from './checkout-persistence'
import { refreshInvoice, refundAttribution } from './finance'
import { applyFinance } from './finance-persistence'

type Event = { id: string; event_type: string; resource: Record<string, any> }
const supported = new Set([
  'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.REFUND.PENDING', 'PAYMENT.REFUND.COMPLETED', 'PAYMENT.REFUND.FAILED',
  'INVOICING.INVOICE.PAID',
])

export class InvalidWebhook extends Error {}

export async function verifyWebhook(headers: Headers, event: unknown) {
  const webhookId = env('PAYPAL_WEBHOOK_ID')
  const fields = {
    auth_algo: headers.get('paypal-auth-algo'),
    cert_url: headers.get('paypal-cert-url'),
    transmission_id: headers.get('paypal-transmission-id'),
    transmission_sig: headers.get('paypal-transmission-sig'),
    transmission_time: headers.get('paypal-transmission-time'),
  }
  if (Object.values(fields).some(value => !value || value.length > 2048))
    throw new InvalidWebhook('Missing or invalid PayPal signature headers.')
  const result = await paypalRest('/v1/notifications/verify-webhook-signature', 'POST', {
    ...fields, webhook_id: webhookId, webhook_event: event,
  })
  if (result.verification_status !== 'SUCCESS') throw new InvalidWebhook('Invalid PayPal signature.')
}

export async function receiveWebhook(headers: Headers, input: unknown) {
  if (!input || typeof input !== 'object') throw new InvalidWebhook('Invalid webhook event.')
  const event = input as Event
  if (typeof event.id !== 'string' || !event.id || event.id.length > 255 ||
      typeof event.event_type !== 'string' || !event.resource || typeof event.resource !== 'object')
    throw new InvalidWebhook('Invalid webhook event.')
  await verifyWebhook(headers, input)
  if (!supported.has(event.event_type)) return { ignored: true }
  // Commit the verified inbox entry first. A crash or API outage leaves work for
  // PayPal redelivery and the reconciliation command, without trusting its data.
  await database().query(`
    INSERT INTO paypal_webhook_events(id,event_type,payload) VALUES($1,$2,$3)
    ON CONFLICT(id) DO NOTHING
  `, [event.id, event.event_type, JSON.stringify(event)])
  return processWebhook(event.id)
}

async function findCampaign(client: PoolClient, kind: 'order' | 'capture' | 'invoice', id: string): Promise<Campaign> {
  const collection = kind === 'invoice' ? 'funding' : 'orders'
  const field = kind === 'capture' ? 'paypalTxn' : 'id'
  const rows = await client.query(`
    SELECT c.id FROM campaigns c WHERE
      c.data->$1 @> $2::jsonb OR
      ($3::boolean AND EXISTS (
        SELECT 1 FROM payment_attempts p WHERE p.campaign_id=c.id AND p.data->>'orderId'=$4
      ))
  `, [collection, JSON.stringify([{ [field]: id }]), kind === 'order', id])
  if (rows.rows.length !== 1) throw new Error('PayPal resource is not yet linked to one campaign.')
  const current = await campaign(client, rows.rows[0].id, true)
  if (current.demo) throw new Error('PayPal resource belongs to a sample campaign.')
  return current
}

async function captureCampaign(client: PoolClient, capture: any) {
  const orderId = capture.supplementary_data?.related_ids?.order_id
  let current: Campaign
  if (typeof orderId === 'string' && orderId) {
    current = await findCampaign(client, 'order', orderId)
    if (!current.orders.some(order => order.id === orderId)) await recoverCheckout(current, client, orderId)
  } else {
    current = await findCampaign(client, 'capture', capture.id)
  }
  const local = verifyCapture(current, capture)
  return { current, local }
}

function verifyCapture(current: Campaign, capture: any) {
  const orderId = capture.supplementary_data?.related_ids?.order_id
  const local = current.orders.find(order => order.paypalTxn === capture.id)
  if (!local || (orderId && local.id !== orderId) ||
      usdCents(capture.amount) !== (local.totalCents ?? Math.round(local.total * 100)) ||
      !['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(capture.status))
    throw new Error('Capture identity, status or amount could not be verified in PayPal.')
  return local
}

async function updateFromPayPal(client: PoolClient, event: Event) {
  if (event.event_type === 'INVOICING.INVOICE.PAID') {
    const id = event.resource.invoice?.id || event.resource.id
    if (typeof id !== 'string' || !id) throw new Error('Missing invoice reference.')
    const current = await findCampaign(client, 'invoice', id)
    applyFinance(current, { funding: await refreshInvoice(current, id) })
    return current
  }
  const id = event.resource.id
  if (typeof id !== 'string' || !id) throw new Error('Missing payment reference.')
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const capture = await paypalRest('/v2/payments/captures/' + encodeURIComponent(id))
    if (capture.id !== id) throw new Error('PayPal capture reference mismatch.')
    const { current } = await captureCampaign(client, capture)
    // The first lookup discovers ownership; refresh again under the campaign
    // lock so a concurrent operation cannot commit an older snapshot afterward.
    const latest = await paypalRest('/v2/payments/captures/' + encodeURIComponent(id))
    if (latest.id !== id) throw new Error('PayPal capture reference mismatch.')
    verifyCapture(current, latest)
    return current
  }
  // PAYMENT.CAPTURE.REFUNDED carries a refund resource, not a capture.
  let refund = await paypalRest('/v2/payments/refunds/' + encodeURIComponent(id))
  const captureId = linkedCapture(refund)
  if (!captureId) throw new Error('PayPal did not identify the refunded capture.')
  refundDetails(refund, id, captureId)
  const capture = await paypalRest('/v2/payments/captures/' + encodeURIComponent(captureId))
  if (capture.id !== captureId) throw new Error('PayPal capture reference mismatch.')
  const { current, local } = await captureCampaign(client, capture)
  refund = await paypalRest('/v2/payments/refunds/' + encodeURIComponent(id))
  const amountCents = refundDetails(refund, id, captureId)
  const latestCapture = await paypalRest('/v2/payments/captures/' + encodeURIComponent(captureId))
  if (latestCapture.id !== captureId) throw new Error('PayPal capture reference mismatch.')
  verifyCapture(current, latestCapture)
  const existing = current.refunds?.find(record => record.id === id)
  if (amountCents > (local.totalCents ?? Math.round(local.total * 100)) ||
      (existing && (existing.amountCents !== amountCents || existing.captureId !== captureId)))
    throw new Error('Refund amount or capture mismatch.')
  const record: PurchaseRefund = {
    ...existing, id, captureId, orderId: local.id, amountCents,
    allocations: existing?.allocations || refundAttribution(current, refund.invoice_id, captureId),
    status: refund.status, operationId: existing?.operationId || refund.invoice_id || id,
    proof: sign({ kind: 'refund', campaignId: current.id, id, orderId: local.id, captureId }),
  }
  applyFinance(current, { refund: record })
  return current
}

export async function processWebhook(id: string) {
  try {
    return await transaction(async client => {
      await client.query("SET LOCAL lock_timeout = '10s'")
      const row = (await client.query('SELECT * FROM paypal_webhook_events WHERE id=$1 FOR UPDATE', [id])).rows[0]
      if (!row) throw new Error('Webhook not found in verified inbox.')
      if (row.processed_at) return { duplicate: true }
      // Lock the campaign before applying data. Concurrent events and browser
      // operations serialize, so a delayed event always reads current PayPal state.
      const current = await updateFromPayPal(client, row.payload)
      current.audit.push({
        id: crypto.randomUUID(), at: Date.now(), actor: 'paypal',
        message: `PayPal resource verified after ${row.event_type} · ${id}`,
      })
      await saveCampaign(client, current)
      await client.query(`
        UPDATE paypal_webhook_events SET processed_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1
      `, [id])
      return { processed: true }
    })
  } catch (error) {
    // This runs after rollback. Never mark a financial operation as verified
    // when its resource lookup, checks or database write failed.
    await database().query(`
      UPDATE paypal_webhook_events SET attempts=attempts+1,last_error=$2
      WHERE id=$1 AND processed_at IS NULL
    `, [id, error instanceof Error ? error.message.slice(0, 1000) : 'Verification unavailable'])
    throw error
  }
}
