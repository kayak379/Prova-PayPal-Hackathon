import { processPayouts } from '@/lib/server/payouts'
import { message } from '@/lib/server/common'

export const runtime = 'nodejs'
export const maxDuration = 300

// This resumes only a server-owned payout intent already authorized by checkout.
export async function POST(request: Request) {
  try {
    const { campaignId, orderId } = await request.json()
    if (typeof campaignId !== 'string' || typeof orderId !== 'string') throw new Error('Invalid purchase reference.')
    const orders = await processPayouts(campaignId, orderId)
    if (!orders.length) throw new Error('No sandbox payout exists for this purchase.')
    return Response.json({ receipt: orders[0] })
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 })
  }
}
