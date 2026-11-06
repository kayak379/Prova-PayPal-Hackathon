import type { PlanItem, Order } from '../types'
import { estimatedPlan, totalsCents } from '../money'
import { sign, verify } from './common'
import { savedWallet } from './vault'
import { paypalRest } from './paypal'

type Prices = {
  mock?: boolean
  kind: string
  products: PlanItem[]
  budgetCents: number
  expires: number
}

type Ticket = {
  mock?: boolean
  kind: string
  orderId: string
  campaignId: string
  items: PlanItem[]
  totalCents: number
}

export async function createCheckout(body: any, origin: string) {
  const prices = verify<Prices>(body.snapshot)
  if (prices.kind !== 'prices' || prices.expires < Date.now()) throw new Error('Proposal expired. Rebuild it before checkout.')
  if (typeof body.campaignId !== 'string' || !Array.isArray(body.items) || !body.items.length || body.items.length > 48) throw new Error('Invalid checkout items.')
  const used = new Set<string>()
  const items = body.items.map((selection: any) => {
    const product = prices.products.find(p => p.id === selection.id)
    if (!product || used.has(product.id) || !Number.isSafeInteger(selection.qty) || selection.qty < 1 || selection.qty > 999999) throw new Error('Invalid product or quantity.')
    used.add(product.id)
    return { ...product, qty: selection.qty }
  }) as PlanItem[]
  const totals = totalsCents(items)
  if (totals.total > prices.budgetCents || totals.total <= 0) throw new Error('Proposal exceeds the budget.')

  const returnUrl = `${origin}/campaigns/new?campaign=${encodeURIComponent(body.campaignId)}&payment=approved`
  const cancelUrl = `${origin}/campaigns/new?campaign=${encodeURIComponent(body.campaignId)}&payment=cancelled`
  // Represent estimated tax as a separate line to avoid toolkit per-unit tax rounding differences.
  const lines = items.map(p => ({
    name: p.name.slice(0, 127),
    quantity: p.qty,
    itemCost: p.unitPriceCents! / 100,
    itemTotal: p.unitPriceCents! * p.qty / 100,
    taxPercent: 0
  }))
  if (totals.tax) lines.push({
    name: 'Estimated tax (sandbox)',
    quantity: 1,
    itemCost: totals.tax / 100,
    itemTotal: totals.tax / 100,
    taxPercent: 0
  })

  const wallet = await savedWallet()
  const order = wallet
    ? await paypalRest('/v2/checkout/orders', 'POST', {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: (totals.total / 100).toFixed(2),
            breakdown: {
              item_total: { currency_code: 'USD', value: (totals.subtotal / 100).toFixed(2) },
              shipping: { currency_code: 'USD', value: (totals.shipping / 100).toFixed(2) },
              tax_total: { currency_code: 'USD', value: (totals.tax / 100).toFixed(2) },
            },
          },
          items: items.map(p => ({
            name: p.name.slice(0, 127),
            quantity: String(p.qty),
            unit_amount: { currency_code: 'USD', value: p.unitPrice.toFixed(2) },
          })),
        }],
        payment_source: { paypal: { vault_id: wallet.id } },
      }, /^[a-f0-9-]{36}$/.test(body.attemptId || '') ? body.attemptId : undefined)
    : await paypalRest('/v2/checkout/orders', 'POST', {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: (totals.total / 100).toFixed(2), breakdown: {
            item_total: { currency_code: 'USD', value: ((totals.subtotal + totals.tax) / 100).toFixed(2) },
            shipping: { currency_code: 'USD', value: (totals.shipping / 100).toFixed(2) },
          } },
          items: lines.map(p => ({ name: p.name, quantity: String(p.quantity), unit_amount: { currency_code: 'USD', value: p.itemCost.toFixed(2) } })),
          description: 'Prova sandbox demonstration. Retailer fulfillment simulated.',
        }],
        payment_source: { paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl, shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' } } },
      }, body.attemptId)

  const approvalUrl = order.links?.find((link: any) => ['payer-action', 'approve'].includes(link.rel))?.href
  const requiresApproval = !['COMPLETED', 'APPROVED'].includes(order.status)
  if (!order.id || (requiresApproval && (!approvalUrl || new URL(approvalUrl).hostname !== 'www.sandbox.paypal.com'))) throw new Error('PayPal did not return a sandbox approval link.')
  return {
    orderId: order.id,
    approvalUrl,
    requiresApproval,
    ticket: sign({
      kind: 'payment',
      mock: !!prices.mock,
      orderId: order.id,
      campaignId: body.campaignId,
      items,
      totalCents: totals.total
    }),
    plan: estimatedPlan({ items, reasoning: [], shipping: 0, tax: 0, discount: 0 })
  }
}

export async function captureCheckout(body: any) {
  const ticket = verify<Ticket>(body.ticket)
  if (ticket.kind !== 'payment' || ticket.orderId !== body.orderId) throw new Error('Invalid payment reference.')
  let order = await paypalRest('/v2/checkout/orders/' + encodeURIComponent(ticket.orderId))
  if (order.status === 'APPROVED') {
    try {
      await paypalRest('/v2/checkout/orders/' + encodeURIComponent(ticket.orderId) + '/capture', 'POST', {}, 'capture-' + ticket.orderId)
    } catch {
      // Retrieve authoritative status after a timeout or concurrent capture.
    }
    order = await paypalRest('/v2/checkout/orders/' + encodeURIComponent(ticket.orderId))
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0]
  if (order.status !== 'COMPLETED' || capture?.status !== 'COMPLETED') throw new Error('Payment is not completed. Approve it in PayPal, then retry verification.')
  if (capture.amount?.currency_code !== 'USD' || Math.round(Number(capture.amount.value) * 100) !== ticket.totalCents) throw new Error('Payment amount does not match the approved proposal.')
  const receipt: Order = {
    id: ticket.orderId,
    paypalTxn: capture.id,
    supplier: 'Purchase · ' + new Set(ticket.items.map(p => p.supplier)).size + ' retailers',
    items: ticket.items,
    total: ticket.totalCents / 100,
    totalCents: ticket.totalCents,
    status: 'confirmed',
    sandbox: true,
    mock: !!ticket.mock,
    createdAt: Date.parse(capture.create_time) || Date.now()
  }
  return { campaignId: ticket.campaignId, receipt: { ...receipt, approvedTotalCents: ticket.totalCents } }
}
