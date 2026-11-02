import type { Campaign } from './types'
export function financeTotals(c: Campaign) {
  const gross = c.orders.reduce(
    (s, o) => s + (o.totalCents ?? Math.round(o.total * 100)),
    0,
  )
  const refunds = [...new Map((c.refunds || []).map((r) => [r.id, r])).values()]
    .filter((r) => r.status === 'COMPLETED')
    .reduce((s, r) => s + r.amountCents, 0)
  const funding = [
    ...new Map((c.funding || []).map((f) => [f.id, f])).values(),
  ].reduce((s, f) => s + f.receivedCents, 0)
  const net = Math.max(0, gross - refunds)
  return {
    gross,
    refunds,
    net,
    remaining: Math.max(0, Math.round(c.budget * 100) - net),
    funding,
  }
}
