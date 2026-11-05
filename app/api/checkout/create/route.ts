import { appOrigin } from '@/lib/server/origin'
import { createCheckout } from '@/lib/server/checkout'
import { transaction } from '@/lib/server/db'
import { campaign } from '@/lib/server/workspace'
import { verify } from '@/lib/server/common'
import type { PlanItem } from '@/lib/types'
import { withCampaign } from '@/lib/server/workspace'
import { financeTotals } from '@/lib/finance'
import { totalsCents } from '@/lib/money'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const b = await request.json()
    // Commit the idempotency key before calling PayPal, so a timeout cannot lose it.
    await transaction(async client => {
      const c = await campaign(client, b.campaignId)
      if (c.demo) throw new Error('Sample campaign: create a new campaign for sandbox checkout.')
      await client.query('INSERT INTO payment_attempts(campaign_id,attempt_id) VALUES($1,$2) ON CONFLICT(campaign_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,data=NULL,completed=false WHERE payment_attempts.completed=true', [c.id, crypto.randomUUID()])
    })
    const result = await withCampaign(b.campaignId, async (c, client) => {
      if (c.demo) throw new Error('Sample campaign: create a new campaign for sandbox checkout.')
      const previous = (await client.query('SELECT * FROM payment_attempts WHERE campaign_id=$1', [c.id])).rows[0]
      if (previous && !previous.completed && previous.data) return previous.data
      const attemptId = previous && !previous.completed ? previous.attempt_id : crypto.randomUUID()
      // The approved proposal is persisted before redirecting to PayPal.
      if (!c.proposal?.snapshot || c.proposal.snapshot !== b.snapshot) throw new Error('Save or rebuild the proposal before checkout.')
      const prices = verify<{ products: PlanItem[] }>(b.snapshot)
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 48) throw new Error('Invalid checkout items.')
      const selected = b.items.map((v: any) => {
        const p = prices.products.find(p => p.id === v.id)
        if (!p || !Number.isSafeInteger(v.qty) || v.qty < 1 || v.qty > 999999) throw new Error('Invalid checkout item.')
        return { ...p, qty: v.qty }
      })
      if (totalsCents(selected).total > financeTotals(c).remaining) throw new Error('Checkout exceeds campaign funds.')
      const result = await createCheckout({ ...b, attemptId }, appOrigin(request))
      await client.query('INSERT INTO payment_attempts(campaign_id,attempt_id,data) VALUES($1,$2,$3) ON CONFLICT(campaign_id) DO UPDATE SET attempt_id=$2,data=$3,completed=false', [c.id, attemptId, JSON.stringify(result)])
      c.proposal = result.plan
      return result
    })
    return Response.json(result)
  } catch (error) { return Response.json({ error: message(error) }, { status: 400 }) }
}
