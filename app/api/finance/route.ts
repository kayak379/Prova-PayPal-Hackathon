import {
  prepareFinance,
  confirmFinance,
  refreshInvoice,
  refreshRefund,
  reconcile,
} from '@/lib/server/finance'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const c = b.campaign
    if (!c?.id || !Array.isArray(c.orders))
      throw new Error('Campaign required.')
    switch (b.action) {
      case 'prepare':
        return Response.json({ prepared: await prepareFinance(c, b.input) })
      case 'confirm':
        return Response.json(await confirmFinance(c, b.token))
      case 'invoice':
        return Response.json({
          funding: await refreshInvoice(c, b.id, !!b.publish),
        })
      case 'refund':
        return Response.json({ refund: await refreshRefund(c, b.id) })
      case 'reconcile':
        return Response.json(await reconcile(c))
      default:
        throw new Error('Unknown operation.')
    }
  } catch (e) {
    return Response.json({ error: message(e) }, { status: 400 })
  }
}
