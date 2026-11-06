import type { PoolClient } from 'pg'
import type { Campaign } from '../types'
import { captureCheckout } from './checkout'

// Caller holds the campaign row lock. Background recovery only reads PayPal;
// an approved order never causes a new capture without the checkout action.
export async function recoverCheckout(campaign: Campaign, client: PoolClient, orderId?: string) {
  const pending = (await client.query(
    'SELECT data FROM payment_attempts WHERE campaign_id=$1 AND completed=false', [campaign.id],
  )).rows[0]?.data
  if (!pending || (orderId && pending.orderId !== orderId)) return
  const result = await captureCheckout(pending, false)
  if (result.campaignId !== campaign.id) throw new Error('Checkout belongs to another campaign.')
  if (!campaign.orders.some(order => order.id === result.receipt.id)) {
    campaign.orders.push(result.receipt)
    campaign.proposal = null
    campaign.audit.push({
      id: crypto.randomUUID(), at: Date.now(), actor: 'paypal',
      message: `PayPal capture recovered and verified · ${result.receipt.paypalTxn}`,
    })
  }
  await client.query('UPDATE payment_attempts SET completed=true WHERE campaign_id=$1', [campaign.id])
  return result.receipt
}
