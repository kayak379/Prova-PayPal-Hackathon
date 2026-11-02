import { uid } from './format'
import type { Plan, PlanItem } from './types'

type CatalogItem = {
  name: string
  category: string
  supplier: string
  unitPrice: number
  delivery: string
  weight: number
  keywords: string[]
}

const CATALOG: CatalogItem[] = [
  { name: 'Drinking water, 24-pack', category: 'Water', supplier: 'AquaRelief Co.', unitPrice: 6.4, delivery: '1 day', weight: 5, keywords: ['water', 'hurricane', 'flood', 'drought', 'earthquake'] },
  { name: 'Water purification tablets', category: 'Water', supplier: 'AquaRelief Co.', unitPrice: 0.9, delivery: '1 day', weight: 3, keywords: ['water', 'flood', 'purif'] },
  { name: 'Emergency sleeping bag', category: 'Shelter', supplier: 'Basecamp Supply', unitPrice: 18.5, delivery: '2 days', weight: 3, keywords: ['sleep', 'shelter', 'cold', 'winter', 'earthquake', 'displaced'] },
  { name: 'Family tent, 6-person', category: 'Shelter', supplier: 'Basecamp Supply', unitPrice: 89, delivery: '2 days', weight: 1, keywords: ['tent', 'shelter', 'displaced', 'earthquake', 'camp'] },
  { name: 'Thermal blanket', category: 'Shelter', supplier: 'Basecamp Supply', unitPrice: 4.2, delivery: '2 days', weight: 3, keywords: ['blanket', 'cold', 'winter', 'warm'] },
  { name: 'First aid kit, 100pc', category: 'Medical', supplier: 'MedLine Direct', unitPrice: 22, delivery: '1 day', weight: 2, keywords: ['medical', 'first aid', 'injur', 'health', 'earthquake'] },
  { name: 'N95 respirator, box of 20', category: 'Medical', supplier: 'MedLine Direct', unitPrice: 19, delivery: '1 day', weight: 2, keywords: ['smoke', 'wildfire', 'fire', 'mask', 'air'] },
  { name: 'Ready-to-eat meal', category: 'Food', supplier: 'Harvest Aid', unitPrice: 3.1, delivery: '3 days', weight: 5, keywords: ['food', 'meal', 'hunger', 'hurricane', 'flood'] },
  { name: 'Infant formula, 12.4oz', category: 'Food', supplier: 'Harvest Aid', unitPrice: 14, delivery: '3 days', weight: 1, keywords: ['infant', 'baby', 'child', 'famil'] },
  { name: 'Hygiene kit', category: 'Hygiene', supplier: 'CleanStart', unitPrice: 7.5, delivery: '2 days', weight: 3, keywords: ['hygiene', 'sanit', 'clean', 'flood'] },
  { name: 'Solar lantern', category: 'Power', supplier: 'Volt Relief', unitPrice: 12, delivery: '2 days', weight: 2, keywords: ['power', 'light', 'outage', 'electric', 'hurricane'] },
  { name: 'Portable generator, 3500W', category: 'Power', supplier: 'Volt Relief', unitPrice: 549, delivery: '4 days', weight: 0.2, keywords: ['generator', 'power', 'outage'] },
]

const DEFAULT_CATEGORIES = ['Water', 'Shelter', 'Medical', 'Food', 'Hygiene']

const SUPPLIER_REASON: Record<string, string> = {
  'AquaRelief Co.': 'AquaRelief Co. for water — next-day regional delivery, 15% non-profit bulk rate.',
  'Basecamp Supply': 'Basecamp Supply for shelter — 2-day delivery guaranteed, stock confirmed.',
  'MedLine Direct': 'MedLine Direct for medical — FDA-registered, ships from nearest hub.',
  'Harvest Aid': 'Harvest Aid for food — lowest per-meal cost, 5-year shelf life.',
  CleanStart: 'CleanStart for hygiene — pre-assembled kits save volunteer packing time.',
  'Volt Relief': 'Volt Relief for power — only supplier with same-week availability.',
}

export function generatePlan(prompt: string, budget: number, feedback = ''): Plan {
  const text = `${prompt} ${feedback}`.toLowerCase()
  let picked = CATALOG.filter((c) => c.keywords.some((k) => text.includes(k)))
  if (picked.length < 4) {
    const extra = CATALOG.filter(
      (c) => DEFAULT_CATEGORIES.includes(c.category) && !picked.includes(c) && c.weight >= 2,
    )
    picked = [...picked, ...extra].slice(0, 6)
  }
  if (text.includes('no generator') || text.includes('remove generator')) {
    picked = picked.filter((p) => p.category !== 'Power' || p.unitPrice < 100)
  }

  const target = Math.max(budget, 200) * 0.9
  const weightTotal = picked.reduce((s, p) => s + p.weight, 0)

  const items: PlanItem[] = picked.map((p) => {
    const share = (target * (p.weight / weightTotal)) / 1.04
    const qty = Math.max(1, Math.floor(share / p.unitPrice))
    return {
      id: uid('it_'),
      name: p.name,
      category: p.category,
      supplier: p.supplier,
      unitPrice: p.unitPrice,
      qty,
      delivery: p.delivery,
    }
  })

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
  const suppliers = Array.from(new Set(items.map((i) => i.supplier)))
  const shipping = Math.round(suppliers.length * 45 + subtotal * 0.02)
  const discount = Math.round(subtotal * 0.08)

  return {
    items,
    shipping,
    discount,
    tax: 0,
    reasoning: suppliers.map((s) => SUPPLIER_REASON[s] ?? `${s} — best price per unit.`),
  }
}

export function recalcPlan(plan: Plan): Plan {
  const subtotal = plan.items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
  const suppliers = new Set(plan.items.map((i) => i.supplier))
  return {
    ...plan,
    shipping: plan.items.length ? Math.round(suppliers.size * 45 + subtotal * 0.02) : 0,
    discount: Math.round(subtotal * 0.08),
  }
}

export const AGENT_STEPS = [
  { label: 'Reading request', detail: 'Extracting disaster type, population, region' },
  { label: 'Assessing needs', detail: 'Mapping to Sphere humanitarian standards' },
  { label: 'Searching suppliers', detail: 'Querying 38 verified vendors' },
  { label: 'Comparing offers', detail: 'Price, delivery window, non-profit discounts' },
  { label: 'Optimizing within budget', detail: 'Balancing coverage across categories' },
  { label: 'Drafting proposal', detail: 'Writing reasoning summary' },
]
