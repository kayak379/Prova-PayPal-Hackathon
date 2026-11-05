import type { Campaign } from '../types'
export function applyFinance(c: Campaign, result: any) {
  if (!result) return
  const upsert = (list: any[], item: any) => [...list.filter(v => v.id !== item.id), item]
  if (result.funding) c.funding = Array.isArray(result.funding) ? result.funding : upsert(c.funding || [], result.funding)
  if (result.refund) c.refunds = upsert(c.refunds || [], result.refund)
  if (result.refunds) c.refunds = result.refunds
  if (result.verification) c.verification = result.verification
}
