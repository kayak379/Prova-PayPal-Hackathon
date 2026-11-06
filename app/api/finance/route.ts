import { prepareFinance, confirmFinance, refreshInvoice, refreshRefund, reconcile } from '@/lib/server/finance'
import { withCampaign } from '@/lib/server/workspace'
import { applyFinance } from '@/lib/server/finance-persistence'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const result = await withCampaign(b.campaign?.id, async c => {
      if (c.demo) throw new Error('Sample campaign: create a new campaign to use payment tools.')
      let result: any
      switch (b.action) {
        case 'prepare': result = { prepared: await prepareFinance(c, b.input) }; break
        case 'confirm': result = await confirmFinance(c, b.token); break
        case 'invoice': result = { funding: await refreshInvoice(c, b.id, !!b.publish) }; break
        case 'refund': result = { refund: await refreshRefund(c, b.id) }; break
        case 'reconcile': result = await reconcile(c); break
        default: throw new Error('Unknown operation.')
      }
      applyFinance(c, result)
      if (b.action !== 'prepare') c.audit.push({ id: crypto.randomUUID(), at: Date.now(), actor: 'paypal', message: 'PayPal sandbox financial records refreshed' })
      return result
    })
    return Response.json(result)
  } catch (e) { return Response.json({ error: message(e) }, { status: 400 }) }
}
