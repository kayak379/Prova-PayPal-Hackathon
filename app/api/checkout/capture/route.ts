import { captureCheckout } from '@/lib/server/checkout'
import { verify, message } from '@/lib/server/common'
import { withCampaign } from '@/lib/server/workspace'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ticket = verify<{ campaignId: string }>(body.ticket)
    const result = await withCampaign(ticket.campaignId, async (campaign, client) => {
      const existing = campaign.orders.find(order => order.id === body.orderId)
      if (existing) return { campaignId: campaign.id, receipt: existing }
      const pending = (await client.query(`
        SELECT data FROM payment_attempts WHERE campaign_id=$1 AND completed=false
      `, [campaign.id])).rows[0]?.data
      if (!pending || pending.orderId !== body.orderId || pending.ticket !== body.ticket) {
        throw new Error('Payment does not match the saved checkout.')
      }

      const captured = await captureCheckout(body)
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
    }, true)
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 })
  }
}
