import { financeChat } from '@/lib/server/finance-agent'
import { withCampaign } from '@/lib/server/workspace'
import { applyFinance } from '@/lib/server/finance-persistence'
import { message } from '@/lib/server/common'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await withCampaign(body.campaign?.id, async (campaign, client) => {
      if (campaign.demo) throw new Error('Sample campaign: create a new campaign to use finance tools.')
      const history = campaign.financeMessages || []
      const last = history.at(-1)
      // The browser saves the user's message before requesting a reply.
      const prior = last?.role === 'user' && last.text === body.text ? history.slice(0, -1) : history
      const reply = await financeChat(campaign, body.text, prior, client)
      applyFinance(campaign, reply.patch)
      return reply
    })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 })
  }
}
