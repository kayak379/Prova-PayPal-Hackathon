import { prepareFinance, confirmFinance, refreshInvoice, refreshRefund, reconcile } from '@/lib/server/finance'
import { withCampaign } from '@/lib/server/workspace'
import { applyFinance } from '@/lib/server/finance-persistence'
import { message, verify } from '@/lib/server/common'
import type { FinanceResult } from '@/lib/types'
import { processPayouts } from '@/lib/server/payouts'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (body.action === 'confirm') {
      const action = verify<{ kind: string; campaignId: string; orderId: string; expires: number }>(body.token)
      if (action.kind === 'refund' && action.campaignId === body.campaign?.id && action.expires >= Date.now()) {
        // Commit the hold before issuing a buyer refund, including when PayPal's
        // response is lost. Queued retailer payments cannot subsequently be sent.
        await withCampaign(action.campaignId, async (campaign, client) => {
          if (campaign.demo) throw new Error('Create a new campaign to issue refunds.')
          const order = campaign.orders.find(order => order.id === action.orderId)
          if (!order || order.payouts?.status !== 'QUEUED') return
          const row = (await client.query('SELECT * FROM sandbox_payout_batches WHERE order_id=$1 AND campaign_id=$2 FOR UPDATE', [order.id, campaign.id])).rows[0]
          if (!row || row.data.batchId) return
          row.data.recoveryRequested = true
          row.data.status = row.first_submitted_at ? 'NEEDS_REVIEW' : 'STOPPED'
          if (!row.first_submitted_at) row.data.items.forEach((item: { status: string }) => { item.status = 'STOPPED' })
          order.payouts = row.data
          await client.query('UPDATE sandbox_payout_batches SET data=$2 WHERE id=$1', [row.id, JSON.stringify(row.data)])
        })
      }
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
    })
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
