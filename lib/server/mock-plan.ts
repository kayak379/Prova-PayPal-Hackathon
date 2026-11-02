import { generatePlan } from '../agent'
import { estimatedPlan, totalsCents } from '../money'
import type { Plan } from '../types'

export function mockPlan(prompt: string, budget: number): Plan {
 const generated = generatePlan(prompt, budget)
 const items = generated.items.map(item => ({ ...item, supplier: 'Mock bulk supplier', delivery: 'Mock delivery estimate', unitPriceCents: Math.round(item.unitPrice * 100), explanation: `Sample ${item.category.toLowerCase()} supplies illustrate an emergency purchasing plan.` }))
 const ceiling = Math.round(budget * 100)
 while (items.length && totalsCents(items).total > ceiling) {
  const factor = Math.min(.99, ceiling / totalsCents(items).total)
  const before = items.reduce((sum, item) => sum + item.qty, 0)
  for (const item of items) item.qty = Math.max(1, Math.floor(item.qty * factor))
  if (items.reduce((sum, item) => sum + item.qty, 0) === before) items.pop()
 }
 if (!items.length) throw new Error('Budget is too small for the sample supplies. Increase it to continue.')
 return estimatedPlan({ items, shipping: 0, tax: 0, discount: 0, mock: true, reasoning: items.map(item => `${item.name}: ${item.explanation}`) })
}
