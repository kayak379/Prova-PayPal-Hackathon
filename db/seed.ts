import type { PoolClient } from 'pg'
import type { Campaign, Plan } from '../lib/types'
export const settings = { orgName: 'Harbor Relief Alliance', taxId: '84-2918374', address: '1200 Relief Way, Houston, TX 77002', paypalEmail: '' }
export const folders = [{ id: 'f_hurricane', name: 'Hurricane Season 2026' }, { id: 'f_wildfire', name: 'Wildfire Response' }, { id: 'f_archive', name: 'Archive' }]
export async function seed(client: Pick<PoolClient, 'query'>) {
  const result = await client.query("INSERT INTO workspace(id,settings,folders) VALUES('demo',$1,$2) ON CONFLICT DO NOTHING RETURNING id", [JSON.stringify(settings), JSON.stringify(folders)])
  if (!result.rows.length) return
  const now = Date.now()
  const plan: Plan = { mock: true, items: [{ id: 'demo_water', name: 'Drinking water cases (sample)', category: 'Water', supplier: 'Demo Supply Co.', unitPrice: 12, unitPriceCents: 1200, qty: 50, delivery: '2–3 days' }, { id: 'demo_kit', name: 'Emergency supply kits (sample)', category: 'Supplies', supplier: 'Demo Supply Co.', unitPrice: 25, unitPriceCents: 2500, qty: 20, delivery: '2–3 days' }], shipping: 0, tax: 0, discount: 0, reasoning: ['Sample proposal for the hackathon. Rebuild in a new campaign for current products and sandbox checkout.'] }
  const base = { demo: true, taxId: settings.taxId, address: settings.address, createdAt: now, orders: [], audit: [{ id: 'demo_audit', at: now, actor: 'user' as const, message: 'Prefilled demonstration data · no PayPal transaction or retailer fulfillment' }] }
  const campaigns: Campaign[] = [
    { ...base, id: 'demo_draft', name: 'Hurricane response · Draft', folderId: 'f_hurricane', budget: 10000, request: 'Provide water and emergency supplies for families displaced by flooding.' },
    { ...base, id: 'demo_proposal', name: 'Wildfire evacuation · Sample proposal', folderId: 'f_wildfire', budget: 15000, request: 'Equip a temporary evacuation shelter for 100 people.', proposal: plan },
    { ...base, id: 'demo_completed', name: 'Shelter supplies · Sample purchase', folderId: 'f_archive', budget: 5000, orders: [{ id: 'DEMO_ORDER_001', paypalTxn: 'DEMO_CAPTURE_001', supplier: 'Demo Supply Co. · synthetic purchase', items: plan.items, total: 1100, totalCents: 110000, approvedTotalCents: 110000, status: 'delivered', createdAt: now - 86400000, mock: true, sandbox: true }] },
  ]
  for (const c of campaigns) await client.query('INSERT INTO campaigns(id,data) VALUES($1,$2) ON CONFLICT DO NOTHING', [c.id, JSON.stringify(c)])
}
