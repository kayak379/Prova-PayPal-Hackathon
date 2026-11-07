import { appOrigin } from '@/lib/server/origin'
import { createCheckout } from '@/lib/server/checkout'
import { transaction } from '@/lib/server/db'
import { campaign, withCampaign } from '@/lib/server/workspace'
import { message, verify } from '@/lib/server/common'
import type { PlanItem } from '@/lib/types'
import { financeTotals } from '@/lib/finance'
import { totalsCents } from '@/lib/money'
import { allocateRetailerPayouts } from '@/lib/retailer-payouts'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    // Commit the idempotency key before calling PayPal, so a timeout cannot lose it.
    await transaction(async client => {
      const current = await campaign(client, body.campaignId)
      if (current.demo) throw new Error('Sample campaign: create a new campaign to proceed to checkout.')
      const previous = (await client.query('SELECT * FROM payment_attempts WHERE campaign_id=$1', [current.id])).rows[0]
      if (previous && !previous.completed && (previous.data || previous.payout_plan)) return
      if (!current.proposal?.snapshot || current.proposal.snapshot !== body.snapshot) {
        throw new Error('Save or rebuild the proposal before checkout.')
      }
      const prices = verify<{ kind: string; expires: number; budgetCents: number; products: PlanItem[] }>(body.snapshot)
      if (prices.kind !== 'prices' || prices.expires < Date.now()) throw new Error('Proposal expired. Rebuild it before checkout.')
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 48) throw new Error('Invalid checkout items.')
      const used = new Set<string>()
      const selected = body.items.map((selection: { id: string; qty: number }) => {
        const product = prices.products.find(p => p.id === selection.id)
        if (!product || used.has(product.id) || !Number.isSafeInteger(selection.qty) || selection.qty < 1 || selection.qty > 999999) throw new Error('Invalid checkout item.')
        used.add(product.id)
        return { ...product, qty: selection.qty }
      })
      const total = totalsCents(selected).total
      if (total > prices.budgetCents || total > financeTotals(current).remaining) throw new Error('Checkout exceeds campaign funds or the proposal budget.')
      const settings = (await client.query("SELECT settings FROM workspace WHERE id='demo'")).rows[0].settings
      const payoutPlan = {
        items: allocateRetailerPayouts(selected, settings.retailerRecipients || []),
        checkout: { snapshot: body.snapshot, items: body.items.map((item: { id: string; qty: number }) => ({ id: item.id, qty: item.qty })) },
      }
      await client.query(`
        INSERT INTO payment_attempts(campaign_id,attempt_id,payout_plan) VALUES($1,$2,$3)
        ON CONFLICT(campaign_id) DO UPDATE
        SET attempt_id=EXCLUDED.attempt_id,data=NULL,completed=false,payout_plan=EXCLUDED.payout_plan
      `, [current.id, previous && !previous.completed ? previous.attempt_id : crypto.randomUUID(), JSON.stringify(payoutPlan)])
    })

    const result = await withCampaign(body.campaignId, async (current, client) => {
      if (current.demo) throw new Error('Sample campaign: create a new campaign for sandbox checkout.')
      const previous = (await client.query('SELECT * FROM payment_attempts WHERE campaign_id=$1', [current.id])).rows[0]
      if (previous && !previous.completed && previous.data) return previous.data
      const attemptId = previous && !previous.completed ? previous.attempt_id : crypto.randomUUID()
      const input = previous?.payout_plan?.checkout || body

      if (!current.proposal?.snapshot || current.proposal.snapshot !== input.snapshot) {
        throw new Error('Save or rebuild the proposal before checkout.')
      }
      const prices = verify<{ products: PlanItem[] }>(input.snapshot)
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 48) {
        throw new Error('Invalid checkout items.')
      }
      const selected = input.items.map((selection: { id: string; qty: number }) => {
        const product = prices.products.find(product => product.id === selection.id)
        if (!product || !Number.isSafeInteger(selection.qty) || selection.qty < 1 || selection.qty > 999999) {
          throw new Error('Invalid checkout item.')
        }
        return { ...product, qty: selection.qty }
      })
      if (totalsCents(selected).total > financeTotals(current).remaining) {
        throw new Error('Checkout exceeds campaign funds.')
      }

      const checkout = await createCheckout({ snapshot: input.snapshot, items: input.items, campaignId: current.id, attemptId }, appOrigin(request))
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
