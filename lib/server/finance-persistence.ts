import type { Campaign, FinanceResult } from '../types'

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return [...list.filter(existing => existing.id !== item.id), item]
}

export function applyFinance(campaign: Campaign, result: FinanceResult) {
  if (!result) return
  if (result.funding) {
    campaign.funding = Array.isArray(result.funding)
      ? result.funding
      : upsert(campaign.funding || [], result.funding)
  }
  if (result.refund) campaign.refunds = upsert(campaign.refunds || [], result.refund)
  if (result.refunds) campaign.refunds = result.refunds
  if (result.verification) campaign.verification = result.verification
}
