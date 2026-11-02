export type Settings = {
  paypalEmail?: string
  orgName: string
  taxId: string
  address: string
}

export type Folder = {
  id: string
  name: string
}

export type PlanItem = {
  id: string
  name: string
  category: string
  supplier: string
  unitPrice: number
  qty: number
  delivery: string
  unitPriceCents?: number
  productUrl?: string
  imageUrl?: string
  explanation?: string
}

export type Plan = {
  mock?: boolean
  fallbackReason?: string
  items: PlanItem[]
  shipping: number
  discount: number
  tax: number
  reasoning: string[]
  snapshot?: string
}

export type OrderStatus = 'confirmed' | 'processing' | 'shipped' | 'delivered'

export type Order = {
  mock?: boolean
  id: string
  paypalTxn: string
  totalCents?: number
  sandbox?: boolean
  supplier: string
  items: PlanItem[]
  total: number
  status: OrderStatus
  createdAt: number
}

export type AuditActor = 'agent' | 'user' | 'paypal'

export type AuditEntry = {
  id: string
  at: number
  actor: AuditActor
  message: string
}

export type Campaign = {
  id: string
  name: string
  folderId: string
  budget: number
  taxId: string
  address: string
  createdAt: number
  orders: Order[]
  request?: string
  proposal?: Plan | null
  audit: AuditEntry[]
}
