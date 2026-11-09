import { captureCheckout } from '@/lib/server/checkout'
import { verify, message } from '@/lib/server/common'
import { withCampaign } from '@/lib/server/workspace'
import { processPayouts, queuePayouts } from '@/lib/server/payouts'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ticket = verify<{ campaignId: string }>(body.ticket)
    const result = await withCampaign(ticket.campaignId, async (campaign, client) => {
      const existing = campaign.orders.find(order => order.id === body.orderId)
      if (existing) return { campaignId: campaign.id, receipt: existing }
      const pending = (await client.query(`
        SELECT * FROM payment_attempts WHERE campaign_id=$1 AND completed=false
      `, [campaign.id])).rows[0]
      if (!pending || pending.data?.orderId !== body.orderId || pending.data?.ticket !== body.ticket) {
        throw new Error('Payment does not match the saved checkout.')
      }

      const captured = await captureCheckout(body)
      await queuePayouts(campaign, client, captured.receipt, pending)
      campaign.orders.push(captured.receipt)
      campaign.proposal = null
      campaign.audit.push({
        id: crypto.randomUUID(),
        at: Date.now(),
        actor: 'paypal',
        message: `Sandbox payment captured · ${captured.receipt.paypalTxn} · fulfillment simulated`,
      })
      await client.query('UPDATE payment_attempts SET completed=true WHERE campaign_id=$1', [campaign.id])
      return captured
    }, true, { type: 'checkout.capture.verified', source: 'server' })
    // The capture and payout intent are already committed. A payout outage must
    // never roll back a successful buyer payment or ask the buyer to pay again.
    try {
      if (result.receipt.payouts && ['QUEUED', 'PENDING'].includes(result.receipt.payouts.status)) {
        const orders = await processPayouts(result.campaignId, result.receipt.id)
        result.receipt = orders[0] || result.receipt
      }
    } catch (error) {
      console.error('Payout recovery required:', error instanceof Error ? error.message : 'error')
    }
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 })
  }
}
