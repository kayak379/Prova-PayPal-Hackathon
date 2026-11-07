import type { PoolClient } from 'pg'
import type { Campaign, Order, PayoutSummary, RetailerPayout } from '../types'
import { database, transaction } from './db'
import { campaign, withCampaign } from './workspace'
import { PayPalError, paypalRest } from './paypal'
import { usdCents } from './paypal-verification'

type PayoutRow = { id: string; order_id: string; first_submitted_at: string | number | null; data: PayoutSummary }
type PayoutPlan = { items: RetailerPayout[]; checkout: { snapshot: string; items: { id: string; qty: number }[] } }
const terminalItems = new Set(['SUCCESS', 'FAILED', 'BLOCKED', 'DENIED', 'RETURNED', 'REFUNDED', 'CANCELED'])

// Called inside the same transaction that saves the verified capture. Legacy
// attempts have no payout_plan and deliberately do not acquire new payouts.
export async function queuePayouts(current: Campaign, client: PoolClient, order: Order, pending: { attempt_id: string; payout_plan?: PayoutPlan | null }) {
  if (current.demo || !pending?.payout_plan) return
  const items: RetailerPayout[] = pending.payout_plan.items
  if (items.reduce((sum, item) => sum + item.amountCents, 0) !== order.totalCents) throw new Error('Retailer payouts do not match the captured total.')
  const summary: PayoutSummary = { id: pending.attempt_id, status: 'QUEUED', items }
  await client.query(`
    INSERT INTO sandbox_payout_batches(id,campaign_id,order_id,data) VALUES($1,$2,$3,$4)
    ON CONFLICT(order_id) DO NOTHING
  `, [summary.id, current.id, order.id, JSON.stringify(summary)])
  order.payouts = (await client.query('SELECT data FROM sandbox_payout_batches WHERE order_id=$1', [order.id])).rows[0].data
}

function duplicateBatchPath(error: unknown): string | undefined {
  if (!(error instanceof PayPalError)) return
  const links = [...(error.details?.links || []), ...(error.details?.details || []).flatMap((detail: any) => detail.links || [])]
  for (const link of links) {
    try {
      const url = new URL(link.href)
      if (url.origin === 'https://api-m.sandbox.paypal.com' && /^\/v1\/payments\/payouts\/[A-Za-z0-9]+$/.test(url.pathname)) return url.pathname
    } catch {}
  }
}

function applyBatch(summary: PayoutSummary, data: any) {
  const header = data.batch_header
  if (!header?.payout_batch_id || header.sender_batch_header?.sender_batch_id !== summary.id ||
      (summary.batchId && header.payout_batch_id !== summary.batchId)) throw new Error('PayPal payout batch reference mismatch.')
  summary.batchId = header.payout_batch_id
  const seen = new Set<string>()
  const updates: { local: RetailerPayout; remote: any }[] = []
  for (const remote of data.items || []) {
    const local = summary.items.find(item => item.senderItemId === remote.payout_item?.sender_item_id)
    if (!local || seen.has(local.senderItemId) || remote.payout_item?.receiver?.toLowerCase() !== local.recipient.toLowerCase() ||
        usdCents({ currency_code: remote.payout_item?.amount?.currency, value: remote.payout_item?.amount?.value }) !== local.amountCents || !remote.payout_item_id || !remote.transaction_status) {
      throw new Error('PayPal payout recipient or amount mismatch.')
    }
    seen.add(local.senderItemId)
    updates.push({ local, remote })
  }
  for (const { local, remote } of updates) {
    local.payoutItemId = remote.payout_item_id
    local.status = remote.transaction_status
    local.error = remote.errors?.name || remote.errors?.message || undefined
  }
  const successes = summary.items.filter(item => item.status === 'SUCCESS').length
  summary.status = successes === summary.items.length ? 'SUCCESS'
    : ['DENIED', 'CANCELED'].includes(header.batch_status) ? 'FAILED'
    : summary.items.every(item => terminalItems.has(item.status)) ? (successes ? 'PARTIAL' : 'FAILED') : 'PENDING'
  summary.error = summary.status === 'FAILED' ? 'Retailer payouts failed. Check the individual PayPal statuses and account.' : undefined
}

// Mark the FIRST possible submission in a committed transaction, independently
// of the API response. A lost response/rollback can then only replay this same
// sender_batch_id within PayPal's 30-day duplicate-protection period.
export async function processPayouts(campaignId: string, orderId?: string): Promise<Order[]> {
  const rows = (await database().query('SELECT id FROM sandbox_payout_batches WHERE campaign_id=$1 AND ($2::text IS NULL OR order_id=$2)', [campaignId, orderId || null])).rows
  if (!rows.length) return []
  await transaction(async client => {
    const current = await campaign(client, campaignId, true)
    if (current.demo) throw new Error('Sample campaigns cannot send payouts.')
    await client.query(`UPDATE sandbox_payout_batches SET first_submitted_at=$3
      WHERE campaign_id=$1 AND ($2::text IS NULL OR order_id=$2) AND first_submitted_at IS NULL`, [campaignId, orderId || null, Date.now()])
  })
  return withCampaign(campaignId, async (current, client) => {
    if (current.demo) throw new Error('Sample campaigns cannot send payouts.')
    const batches = (await client.query<PayoutRow>('SELECT * FROM sandbox_payout_batches WHERE campaign_id=$1 AND ($2::text IS NULL OR order_id=$2) ORDER BY id FOR UPDATE', [campaignId, orderId || null])).rows
    const orders: Order[] = []
    for (const row of batches) {
      const order = current.orders.find(order => order.id === row.order_id)
      if (!order) throw new Error('Payout has no verified campaign purchase.')
      const summary = row.data
      const before = JSON.stringify(summary)
      try {
        if (!summary.batchId && !['FAILED', 'NEEDS_REVIEW'].includes(summary.status)) {
          if (!row.first_submitted_at || Date.now() - Number(row.first_submitted_at) >= 29 * 86400000) {
            summary.status = 'NEEDS_REVIEW'
            summary.error = 'Payout submission is too old to retry safely. Check the PayPal account.'
          } else {
            const capture = await paypalRest('/v2/payments/captures/' + encodeURIComponent(order.paypalTxn))
            if (capture.id !== order.paypalTxn || usdCents(capture.amount) !== order.totalCents) throw new Error('Payout capture verification mismatch.')
            if (capture.status !== 'COMPLETED' || current.refunds?.some(refund => refund.orderId === order.id && !['FAILED', 'CANCELLED', 'CANCELED'].includes(refund.status))) {
              summary.status = 'NEEDS_REVIEW'
              summary.error = 'Purchase has a refund or is no longer a completed capture; payouts were not sent.'
            } else {
              let result: any
              try {
                result = await paypalRest('/v1/payments/payouts', 'POST', {
                  sender_batch_header: { sender_batch_id: summary.id, email_subject: 'Prova retailer payout' },
                  items: summary.items.map(item => ({
                    recipient_type: 'EMAIL', receiver: item.recipient, sender_item_id: item.senderItemId,
                    amount: { currency: 'USD', value: (item.amountCents / 100).toFixed(2) },
                    note: 'Campaign supplies.',
                  })),
                }, summary.id)
              } catch (error) {
                const path = duplicateBatchPath(error)
                if (path) result = await paypalRest(path + '?page_size=1000')
                else throw error
              }
              applyBatch(summary, result)
            }
          }
        }
        if (summary.batchId) {
          applyBatch(summary, await paypalRest('/v1/payments/payouts/' + encodeURIComponent(summary.batchId) + '?page_size=1000'))
        }
      } catch (error) {
        summary.error = error instanceof Error ? error.message : 'Payout unavailable.'
        // Definitive request rejection must not be retried automatically. An
        // ambiguous failure retains its original identifiers for reconciliation.
        if (!summary.batchId && error instanceof PayPalError) {
          const duplicate = error.details?.name === 'DUPLICATE_BATCH_ID' || error.details?.details?.some((detail: any) => detail.issue === 'DUPLICATE_BATCH_ID')
          if (duplicate) summary.status = 'NEEDS_REVIEW'
          else if (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) summary.status = 'FAILED'
        }
      }
      order.payouts = summary
      await client.query('UPDATE sandbox_payout_batches SET data=$2 WHERE id=$1', [row.id, JSON.stringify(summary)])
      if (before !== JSON.stringify(summary)) current.audit.push({
        id: crypto.randomUUID(), at: Date.now(), actor: 'paypal',
        message: `Retailer payouts · ${order.id} · ${summary.status}${summary.error ? ' · ' + summary.error : ''}`,
      })
      orders.push(order)
    }
    return orders
  }, true)
}
