import { financeChat } from '@/lib/server/finance-agent'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request) {
  try {
    const b = await request.json()
    if (!b.campaign?.id || !Array.isArray(b.campaign.orders))
      throw new Error('Campaign required.')
    return Response.json(await financeChat(b.campaign, b.text, b.history))
  } catch (e) {
    return Response.json({ error: message(e) }, { status: 400 })
  }
}
