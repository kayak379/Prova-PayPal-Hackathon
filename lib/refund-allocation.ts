import type { Order, PurchaseRefund, RefundAllocation } from './types'

const active = (status: string) => !['FAILED', 'CANCELLED', 'CANCELED'].includes(status)

// Refund shares use the immutable checkout payout amounts, including allocated tax
// and shipping. Older unassigned refunds reserve funds across those same shares.
export function refundBalances(order: Order, refunds: PurchaseRefund[]): RefundAllocation[] {
  const balances = (order.payouts?.items || []).map(item => ({ retailer: item.retailer, amountCents: item.amountCents }))
  const relevant = refunds.filter(r => r.orderId === order.id && active(r.status))
  const unassigned = relevant.filter(r => !r.allocations).reduce((sum, r) => sum + r.amountCents, 0)
  for (const share of splitRefund(balances, Math.min(unassigned, balances.reduce((sum, b) => sum + b.amountCents, 0)))) {
    balances.find(b => b.retailer === share.retailer)!.amountCents -= share.amountCents
  }
  for (const refund of relevant.filter(r => r.allocations)) {
    for (const share of refund.allocations!) {
      const balance = balances.find(b => b.retailer === share.retailer)
      if (balance) balance.amountCents = Math.max(0, balance.amountCents - share.amountCents)
    }
  }
  return balances
}

export function splitRefund(balances: RefundAllocation[], amount: number): RefundAllocation[] {
  const total = balances.reduce((sum, b) => sum + b.amountCents, 0)
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > total) throw new Error('Refund exceeds the remaining supplier amount.')
  if (!amount) return []
  const shares = balances.map(b => ({ retailer: b.retailer, amountCents: Number(BigInt(amount) * BigInt(b.amountCents) / BigInt(total)), remainder: BigInt(amount) * BigInt(b.amountCents) % BigInt(total) }))
  let left = amount - shares.reduce((sum, b) => sum + b.amountCents, 0)
  for (const share of [...shares].sort((a, b) => a.remainder === b.remainder ? a.retailer.localeCompare(b.retailer) : a.remainder > b.remainder ? -1 : 1)) {
    if (!left) break
    share.amountCents++
    left--
  }
  return shares.filter(b => b.amountCents > 0).map(({ retailer, amountCents }) => ({ retailer, amountCents }))
}
