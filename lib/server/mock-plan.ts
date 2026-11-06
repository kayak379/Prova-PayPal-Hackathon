import { allocateBudget } from './budget-allocation'
import { uid } from '../format'
import { estimatedPlan, totalsCents } from '../money'
import type { Plan, PlanItem } from '../types'

const catalog = [
  {
    name: 'Drinking water, 24-pack', category: 'Water', unitPrice: 6.4, weight: 5,
    keywords: ['water', 'hurricane', 'flood', 'drought', 'earthquake'],
  },
  {
    name: 'Water purification tablets', category: 'Water', unitPrice: 0.9, weight: 3,
    keywords: ['water', 'flood', 'purif'],
  },
  {
    name: 'Emergency sleeping bag', category: 'Shelter', unitPrice: 18.5, weight: 3,
    keywords: ['sleep', 'shelter', 'cold', 'winter', 'earthquake', 'displaced'],
  },
  {
    name: 'Family tent, 6-person', category: 'Shelter', unitPrice: 89, weight: 1,
    keywords: ['tent', 'shelter', 'displaced', 'earthquake', 'camp'],
  },
  {
    name: 'Thermal blanket', category: 'Shelter', unitPrice: 4.2, weight: 3,
    keywords: ['blanket', 'cold', 'winter', 'warm'],
  },
  {
    name: 'First aid kit, 100pc', category: 'Medical', unitPrice: 22, weight: 2,
    keywords: ['medical', 'first aid', 'injur', 'health', 'earthquake'],
  },
  {
    name: 'N95 respirator, box of 20', category: 'Medical', unitPrice: 19, weight: 2,
    keywords: ['smoke', 'wildfire', 'fire', 'mask', 'air'],
  },
  {
    name: 'Ready-to-eat meal', category: 'Food', unitPrice: 3.1, weight: 5,
    keywords: ['food', 'meal', 'hunger', 'hurricane', 'flood'],
  },
  {
    name: 'Infant formula, 12.4oz', category: 'Food', unitPrice: 14, weight: 1,
    keywords: ['infant', 'baby', 'child', 'famil'],
  },
  {
    name: 'Hygiene kit', category: 'Hygiene', unitPrice: 7.5, weight: 3,
    keywords: ['hygiene', 'sanit', 'clean', 'flood'],
  },
  {
    name: 'Solar lantern', category: 'Power', unitPrice: 12, weight: 2,
    keywords: ['power', 'light', 'outage', 'electric', 'hurricane'],
  },
  {
    name: 'Portable generator, 3500W', category: 'Power', unitPrice: 549, weight: 0.2,
    keywords: ['generator', 'power', 'outage'],
  },
]
const defaultCategories = ['Water', 'Shelter', 'Medical', 'Food', 'Hygiene']

export function mockPlan(prompt: string, budget: number): Plan {
  const text = prompt.toLowerCase()
  let picked = catalog.filter(product => product.keywords.some(keyword => text.includes(keyword)))
  if (picked.length < 4) {
    const extra = catalog.filter(product =>
      defaultCategories.includes(product.category) && !picked.includes(product) && product.weight >= 2,
    )
    picked = [...picked, ...extra].slice(0, 6)
  }
  if (text.includes('no generator') || text.includes('remove generator')) {
    picked = picked.filter(product => product.category !== 'Power' || product.unitPrice < 100)
  }

  const target = Math.max(budget, 200) * 0.9
  const weightTotal = picked.reduce((sum, product) => sum + product.weight, 0)
  const items: PlanItem[] = picked.map(product => {
    const share = (target * (product.weight / weightTotal)) / 1.04
    return {
      id: uid('it_'),
      name: product.name,
      category: product.category,
      unitPrice: product.unitPrice,
      qty: Math.max(1, Math.floor(share / product.unitPrice)),
      supplier: 'Mock bulk supplier',
      delivery: 'Mock delivery estimate',
      unitPriceCents: Math.round(product.unitPrice * 100),
      explanation: `Sample ${product.category.toLowerCase()} supplies illustrate an emergency purchasing plan.`,
    }
  })
  const ceiling = Math.round(budget * 100)
  while (items.length > 4 && totalsCents(items.map(item => ({ ...item, qty: 1 }))).total > ceiling) {
    const highest = items.reduce((best, item, index) => item.unitPrice > items[best].unitPrice ? index : best, 0)
    items.splice(highest, 1)
  }
  return estimatedPlan({
    items: allocateBudget(items, ceiling),
    shipping: 0,
    tax: 0,
    discount: 0,
    mock: true,
    reasoning: items.map(item => `${item.name}: ${item.explanation}`),
  })
}
