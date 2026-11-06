import { appOrigin } from '@/lib/server/origin'
import { createCheckout } from '@/lib/server/checkout'
import { transaction } from '@/lib/server/db'
import { campaign, withCampaign } from '@/lib/server/workspace'
import { message, verify } from '@/lib/server/common'
import type { PlanItem } from '@/lib/types'
import { financeTotals } from '@/lib/finance'
import { totalsCents } from '@/lib/money'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    // Commit the idempotency key before calling PayPal, so a timeout cannot lose it.
    await transaction(async client => {
      const current = await campaign(client, body.campaignId)
      if (current.demo) throw new Error('Sample campaign: create a new campaign to proceed to checkout.')
      await client.query(`
        INSERT INTO payment_attempts(campaign_id,attempt_id) VALUES($1,$2)
        ON CONFLICT(campaign_id) DO UPDATE
        SET attempt_id=EXCLUDED.attempt_id,data=NULL,completed=false
        WHERE payment_attempts.completed=true
      `, [current.id, crypto.randomUUID()])
    })

    const result = await withCampaign(body.campaignId, async (current, client) => {
      if (current.demo) throw new Error('Sample campaign: create a new campaign for sandbox checkout.')
      const previous = (await client.query('SELECT * FROM payment_attempts WHERE campaign_id=$1', [current.id])).rows[0]
      if (previous && !previous.completed && previous.data) return previous.data
      const attemptId = previous && !previous.completed ? previous.attempt_id : crypto.randomUUID()

      if (!current.proposal?.snapshot || current.proposal.snapshot !== body.snapshot) {
        throw new Error('Save or rebuild the proposal before checkout.')
      }
      const prices = verify<{ products: PlanItem[] }>(body.snapshot)
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 48) {
        throw new Error('Invalid checkout items.')
      }
      const selected = body.items.map((selection: { id: string; qty: number }) => {
        const product = prices.products.find(product => product.id === selection.id)
        if (!product || !Number.isSafeInteger(selection.qty) || selection.qty < 1 || selection.qty > 999999) {
          throw new Error('Invalid checkout item.')
        }
        return { ...product, qty: selection.qty }
      })
      if (totalsCents(selected).total > financeTotals(current).remaining) {
        throw new Error('Checkout exceeds campaign funds.')
      }

      const checkout = await createCheckout({ ...body, attemptId }, appOrigin(request))
      await client.query(`
        INSERT INTO payment_attempts(campaign_id,attempt_id,data) VALUES($1,$2,$3)
        ON CONFLICT(campaign_id) DO UPDATE SET attempt_id=$2,data=$3,completed=false
      `, [current.id, attemptId, JSON.stringify(checkout)])
      current.proposal = checkout.plan
      return checkout
    })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 })
  }
}
