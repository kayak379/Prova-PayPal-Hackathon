import { financeTotals } from './finance'
import type { Campaign, Plan } from './types'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const currencyPrecise = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const usd = (n: number) => currency.format(n)
export const usdPrecise = (n: number) => currencyPrecise.format(n)

export const uid = (prefix = '') =>
  `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`

export const token = (prefix: string, len = 17) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}${out}`
}

export function planTotals(plan: Plan) {
  const subtotal = plan.items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
  const total = subtotal + plan.shipping - plan.discount + plan.tax
  return { subtotal, total }
}

export function campaignSpent(c: Campaign) {
  return financeTotals(c).net / 100
}

export function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - ts)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
