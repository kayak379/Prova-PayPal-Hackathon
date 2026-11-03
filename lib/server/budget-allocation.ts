import type { PlanItem } from '../types'
import { priceCents, totalsCents } from '../money'

// Preserve the AI's product choices and relative priorities, then use spare funds.
export function allocateBudget(
  selected: PlanItem[],
  budgetCents: number,
): PlanItem[] {
  if (selected.length < 4)
    throw new Error('Choose at least four distinct products.')
  const base = selected.map((item) => ({ ...item, qty: 1 }))
  if (totalsCents(base).total > budgetCents)
    throw new Error(
      'The budget cannot cover one of each selected product, including shipping and tax. Choose cheaper products or increase the budget.',
    )
  const scaled = (factor: number) =>
    selected.map((item) => ({
      ...item,
      qty: Math.max(1, Math.min(999999, Math.floor(item.qty * factor))),
    }))
  let low = 0
  let high = budgetCents / Math.min(...selected.map(priceCents)) + 1
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2
    if (totalsCents(scaled(mid)).total <= budgetCents) low = mid
    else high = mid
  }
  const items = scaled(low)
  for (const item of items) {
    let min = item.qty
    let max = Math.min(
      999999,
      min +
        Math.floor((budgetCents - totalsCents(items).total) / priceCents(item)),
    )
    while (min < max) {
      const mid = Math.ceil((min + max) / 2)
      item.qty = mid
      if (totalsCents(items).total <= budgetCents) min = mid
      else max = mid - 1
    }
    item.qty = min
  }
  return items
}
