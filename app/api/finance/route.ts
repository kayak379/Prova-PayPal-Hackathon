import { prepareFinance, confirmFinance, refreshInvoice, refreshRefund, reconcile } from '@/lib/server/finance'
import { campaign as loadCampaign, withCampaign } from '@/lib/server/workspace'
import { applyFinance } from '@/lib/server/finance-persistence'
import { message, verify } from '@/lib/server/common'
import { transaction } from '@/lib/server/db'
import { recordEvidence } from '@/lib/server/evidence'
import type { FinanceResult } from '@/lib/types'
import { processPayouts } from '@/lib/server/payouts'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (body.action === 'confirm') {
      // Persist the requested approval before the provider call, even if it times out.
      // confirmFinance still revalidates prices, balances and provider references.
      await transaction(async client => {
        const current = await loadCampaign(client, body.campaign?.id)
        if (current.demo) throw new Error('Sample campaigns cannot use payment tools.')
        const action = verify<{ campaignId: string; expires: number; kind: string; operationId: string }>(body.token)
        if (action.campaignId !== current.id || !Number.isFinite(action.expires) || action.expires < Date.now() || !['invoice', 'refund'].includes(action.kind)) throw new Error('Invalid or expired financial approval.')
        await recordEvidence(client, current.id, { type: 'finance.approval.requested', source: 'shared-account', eventId: `finance-approved:${action.operationId}`, details: action })
      })
    }
    const result = await withCampaign(body.campaign?.id, async (campaign, client) => {
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
          result = await reconcile(campaign, client)
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
    }, false, { type: `finance.${['prepare', 'confirm', 'invoice', 'refund', 'reconcile'].includes(body.action) ? body.action : 'unknown'}`, source: 'server' })
    if (body.action === 'reconcile') {
      try { await processPayouts(body.campaign.id) }
      catch (error) {
        result.verification?.findings.push(`Retailer payout verification unavailable — ${message(error)}`)
      }
    }
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 })
  }
}
