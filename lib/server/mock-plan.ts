import { allocateBudget } from './budget-allocation'
import { generatePlan } from '../agent'
import { estimatedPlan, totalsCents } from '../money'
import type { Plan } from '../types'

export function mockPlan(prompt: string, budget: number): Plan {
 const generated = generatePlan(prompt, budget)
 const items = generated.items.map(item => ({ ...item, supplier: 'Mock bulk supplier', delivery: 'Mock delivery estimate', unitPriceCents: Math.round(item.unitPrice * 100), explanation: `Sample ${item.category.toLowerCase()} supplies illustrate an emergency purchasing plan.` }))
 const ceiling = Math.round(budget * 100)
 while (items.length > 3 && totalsCents(items.map(item => ({ ...item, qty: 1 }))).total > ceiling) {
  const highest = items.reduce((best, item, index) => item.unitPrice > items[best].unitPrice ? index : best, 0)
  items.splice(highest, 1)
 }
 const allocated = allocateBudget(items, ceiling)
 return estimatedPlan({ items: allocated, shipping: 0, tax: 0, discount: 0, mock: true, reasoning: items.map(item => `${item.name}: ${item.explanation}`) })
}
