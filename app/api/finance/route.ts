import { prepareFinance, confirmFinance, refreshInvoice, refreshRefund, reconcile } from '@/lib/server/finance'
import { withCampaign } from '@/lib/server/workspace'
import { applyFinance } from '@/lib/server/finance-persistence'
import { message } from '@/lib/server/common'
import type { FinanceResult } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await withCampaign(body.campaign?.id, async campaign => {
      if (campaign.demo) throw new Error('Sample campaign: create a new campaign to use payment tools.')
      let result: FinanceResult
      switch (body.action) {
        case 'prepare':
          result = { prepared: await prepareFinance(campaign, body.input) }
          break
        case 'confirm':
          result = await confirmFinance(campaign, body.token)
          break
        case 'invoice':
          result = { funding: await refreshInvoice(campaign, body.id, !!body.publish) }
          break
        case 'refund':
          result = { refund: await refreshRefund(campaign, body.id) }
          break
        case 'reconcile':
          result = await reconcile(campaign)
          break
        default:
          throw new Error('Unknown operation.')
      }
      applyFinance(campaign, result)
      if (body.action !== 'prepare') {
        campaign.audit.push({
          id: crypto.randomUUID(),
          at: Date.now(),
          actor: 'paypal',
          message: 'PayPal sandbox financial records refreshed',
        })
      }
      return result
    })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 })
  }
}
