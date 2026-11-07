import type { PoolClient } from 'pg'
import type { Campaign, RetailerPayout } from '../types'
import { sign, verify, message } from './common'
import { paypalRest } from './paypal'
import { usdCents } from './paypal-verification'
import { applyPayoutBatch } from './payouts'

type Recovery = { kind: 'retailer-recovery'; campaignId: string; orderId: string; itemIds: string[]; operationId: string; expires: number }

async function refreshItem(item: RetailerPayout, batchId: string) {
  const data = await paypalRest('/v1/payments/payouts-item/' + encodeURIComponent(item.payoutItemId!))
  if (typeof data.transaction_status !== 'string' || data.payout_item_id !== item.payoutItemId || data.payout_batch_id !== batchId ||
      data.payout_item?.sender_item_id !== item.senderItemId ||
      data.payout_item?.receiver?.toLowerCase() !== item.recipient.toLowerCase() ||
      usdCents({ currency_code: data.payout_item?.amount?.currency, value: data.payout_item?.amount?.value }) !== item.amountCents) throw new Error('Retailer payout identity or amount mismatch.')
  item.status = data.transaction_status
  item.error = data.errors?.name || undefined
}

// The caller holds the campaign lock, also used by payout submission and buyer refunds.
export async function retailerRecovery(c: Campaign, client: PoolClient, body: { action: string; orderId: string; itemIds?: string[]; token?: string }) {
  if (c.demo) throw new Error('Create a new campaign to recover retailer payments.')
  const order = c.orders.find(o => o.id === body.orderId)
  const row = (await client.query('SELECT * FROM sandbox_payout_batches WHERE campaign_id=$1 AND order_id=$2 FOR UPDATE', [c.id, body.orderId])).rows[0]
  if (!order || !row) throw new Error('Retailer payouts are outside this campaign.')
  const summary = row.data as NonNullable<typeof order.payouts>
  let token: Recovery | undefined
  if (body.action === 'confirm') {
    token = verify<Recovery>(body.token || '')
    if (token.kind !== 'retailer-recovery' || token.campaignId !== c.id || token.orderId !== order.id || token.expires < Date.now()) throw new Error('Recovery review expired or belongs to another purchase.')
  } else if (!['prepare', 'refresh'].includes(body.action)) throw new Error('Unknown recovery action.')
  const ids = token?.itemIds || body.itemIds || summary.items.map(item => item.senderItemId)
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !summary.items.some(item => item.senderItemId === id))) throw new Error('Choose valid retailer payouts.')
  const selected = summary.items.filter(item => ids.includes(item.senderItemId))
  if (summary.batchId && summary.items.some(item => !item.payoutItemId)) {
    applyPayoutBatch(summary, await paypalRest('/v1/payments/payouts/' + encodeURIComponent(summary.batchId) + '?page_size=1000'))
  }
  if (token) {
    summary.recoveryRequested = true
    if (!summary.batchId) {
      // A never-submitted batch can be stopped safely. An ambiguous submission
      // is held for review; do not claim its money was recovered or replay it.
      const stopped = !row.first_submitted_at || summary.status === 'STOPPED'
      summary.status = stopped ? 'STOPPED' : 'NEEDS_REVIEW'
      summary.error = stopped ? undefined : 'Submission outcome is unknown. Check the PayPal account before further action.'
      if (stopped) summary.items.forEach(item => { item.status = 'STOPPED' })
    }
  }
  for (const item of summary.items) {
    if (!summary.batchId || !item.payoutItemId) continue
    try {
      await refreshItem(item, summary.batchId)
      if (token && selected.includes(item) && item.status === 'UNCLAIMED') {
        try {
          await paypalRest('/v1/payments/payouts-item/' + encodeURIComponent(item.payoutItemId) + '/cancel', 'POST', {}, `recover-${token.operationId}-${item.payoutItemId}`)
        } catch (error) {
          await refreshItem(item, summary.batchId)
          if (!['RETURNED', 'REFUNDED'].includes(item.status)) throw error
        }
        await refreshItem(item, summary.batchId)
      }
    } catch (error) { item.error = message(error) }
  }
  if (summary.batchId && summary.recoveryRequested) summary.status = summary.items.every(item => ['RETURNED', 'REFUNDED'].includes(item.status)) ? 'RECOVERED' : 'RECOVERY_REQUESTED'
  order.payouts = summary
  await client.query('UPDATE sandbox_payout_batches SET data=$2 WHERE id=$1', [row.id, JSON.stringify(summary)])
  if (token) c.audit.push({ id: crypto.randomUUID(), at: Date.now(), actor: 'paypal', message: `Retailer recovery reviewed · ${order.id} · ${selected.map(item => item.retailer).join(', ')}` })
  return {
    payouts: summary,
    token: body.action === 'prepare' ? sign({ kind: 'retailer-recovery', campaignId: c.id, orderId: order.id, itemIds: ids, operationId: crypto.randomUUID(), expires: Date.now() + 900000 }) : undefined,
  }
}
