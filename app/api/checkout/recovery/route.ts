import { withCampaign } from '@/lib/server/workspace'
import { retailerRecovery } from '@/lib/server/retailer-recovery'
import { message } from '@/lib/server/common'

export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.campaignId !== 'string' || typeof body.orderId !== 'string') throw new Error('Invalid purchase reference.')
    const result = await withCampaign(body.campaignId, (c, client) => retailerRecovery(c, client, body))
    return Response.json(result)
  } catch (error) { return Response.json({ error: message(error) }, { status: 400 }) }
}
