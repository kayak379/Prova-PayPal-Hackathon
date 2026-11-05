import { captureCheckout } from '@/lib/server/checkout'
import { verify, message } from '@/lib/server/common'
import { withCampaign } from '@/lib/server/workspace'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const ticket = verify<{ campaignId: string }>(b.ticket)
    const result = await withCampaign(ticket.campaignId, async (c, client) => {
      const existing = c.orders.find(o => o.id === b.orderId)
      if (existing) return { campaignId: c.id, receipt: existing }
      const pending = (await client.query('SELECT data FROM payment_attempts WHERE campaign_id=$1 AND completed=false', [c.id])).rows[0]?.data
      if (!pending || pending.orderId !== b.orderId || pending.ticket !== b.ticket) throw new Error('Payment does not match the saved checkout.')
      const result = await captureCheckout(b)
      c.orders.push(result.receipt); c.proposal = null
      c.audit.push({ id: crypto.randomUUID(), at: Date.now(), actor: 'paypal', message: 'Sandbox payment captured · ' + result.receipt.paypalTxn + ' · fulfillment simulated' })
      await client.query('UPDATE payment_attempts SET completed=true WHERE campaign_id=$1', [c.id])
      return result
    })
    return Response.json(result)
  } catch (error) { return Response.json({ error: message(error) }, { status: 400 }) }
}
