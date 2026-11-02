import type { Plan, PlanItem } from './types'
export const priceCents = (item: PlanItem) => item.unitPriceCents ?? Math.round(item.unitPrice * 100)
export function totalsCents(items: PlanItem[]) {
  const subtotal = items.reduce((sum, item) => sum + priceCents(item) * item.qty, 0)
  const shipping = Math.round(subtotal * .05)
  const tax = Math.round(subtotal * .08)
  return { subtotal, shipping, tax, total: subtotal + shipping + tax }
}
export function estimatedPlan(plan: Plan): Plan {
  const totals = totalsCents(plan.items)
  return { ...plan, shipping: totals.shipping / 100, tax: totals.tax / 100, discount: 0 }
}
