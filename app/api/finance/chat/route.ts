import { financeChat } from '@/lib/server/finance-agent'
import { withCampaign } from '@/lib/server/workspace'
import { applyFinance } from '@/lib/server/finance-persistence'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const result = await withCampaign(b.campaign?.id, async c => {
      if (c.demo) throw new Error('Sample campaign: create a new campaign to use live finance tools.')
      const history = c.financeMessages || []
      const last = history.at(-1)
      // The browser saves the user's message before requesting a reply.
      const prior = last?.role === 'user' && last.text === b.text ? history.slice(0, -1) : history
      const result = await financeChat(c, b.text, prior)
      applyFinance(c, result.patch)
      return result
    })
    return Response.json(result)
  } catch (e) { return Response.json({ error: message(e) }, { status: 400 }) }
}
