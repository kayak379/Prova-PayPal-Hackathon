import type { PlanItem, RetailerRecipient, RetailerPayout } from './types'
import { priceCents, totalsCents } from './money'

export function retailerDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error('Use a retailer domain such as example.com.')
  }
  return domain
}

export function retailerRecipients(input: unknown): RetailerRecipient[] {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > 100) throw new Error('Invalid retailer recipients.')
  const used = new Set<string>()
  return input.map(entry => {
    if (!entry || typeof entry.domain !== 'string' || typeof entry.email !== 'string') throw new Error('Invalid retailer recipient.')
    const domain = retailerDomain(entry.domain)
    const email = entry.email.trim()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Enter a sandbox PayPal email for ${domain}.`)
    if (used.has(domain)) throw new Error(`Duplicate retailer domain: ${domain}.`)
    used.add(domain)
    return { domain, email }
  })
}

export function allocateRetailerPayouts(items: PlanItem[], recipients: RetailerRecipient[]): RetailerPayout[] {
  const mapping = new Map(retailerRecipients(recipients).map(r => [r.domain, r.email]))
  const groups = new Map<string, number>()
  for (const item of items) {
    const domain = retailerDomain(item.supplier)
    const subtotal = priceCents(item) * item.qty
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0) throw new Error('Invalid retailer merchandise amount.')
    groups.set(domain, (groups.get(domain) || 0) + subtotal)
  }
  const retailers = [...groups].sort(([a], [b]) => a.localeCompare(b))
  const totals = totalsCents(items)
  if (!Number.isSafeInteger(totals.total) || totals.total <= 0) throw new Error('Invalid payout total.')
  // BigInt avoids loss of precision when multiplying cents for proportional allocation.
  function allocate(charge: number) {
    const shares = retailers.map(([, subtotal]) => {
      const numerator = BigInt(charge) * BigInt(subtotal)
      return { cents: Number(numerator / BigInt(totals.subtotal)), remainder: numerator % BigInt(totals.subtotal) }
    })
    const ranked = shares.map((share, index) => ({ ...share, index }))
      .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
    const left = charge - shares.reduce((sum, share) => sum + share.cents, 0)
    for (let i = 0; i < left; i++) shares[ranked[i].index].cents++
    return shares.map(share => share.cents)
  }
  const shipping = allocate(totals.shipping)
  const tax = allocate(totals.tax)
  const missing = retailers.filter(([domain]) => !mapping.has(domain)).map(([domain]) => domain)
  if (missing.length) throw new Error(`Add sandbox PayPal recipients in account settings for: ${missing.join(', ')}.`)
  return retailers.map(([domain, subtotal], i) => ({
    senderItemId: `retailer-${i + 1}`, retailer: domain, recipient: mapping.get(domain)!,
    amountCents: subtotal + shipping[i] + tax[i], status: 'QUEUED',
  }))
}
