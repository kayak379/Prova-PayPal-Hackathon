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
  approvedTotalCents?: number
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
  requestAttachment?: { name: string; content: string } | null
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
  funding?: FundingRequest[]
  refunds?: PurchaseRefund[]
  financeMessages?: FinanceMessage[]
  verification?: FinanceVerification
  financeOperations?: FinanceOperation[]
  audit: AuditEntry[]
}

export type FundingRequest = {
  emailInvoice?: boolean
  emailRequestedAt?: number
  id: string
  operationId: string
  sponsor: string
  email?: string
  items: PlanItem[]
  amountCents: number
  receivedCents: number
  status: string
  paymentUrl?: string
  qr?: string
  mock?: boolean
  createdAt: number
  proof: string
  error?: string
}
export type PurchaseRefund = {
  id: string
  orderId: string
  captureId: string
  amountCents: number
  status: string
  operationId: string
  reason?: string
  proof: string
}
export type FinanceAction = {
  orderId?: string
  captureId?: string
  emailInvoice?: boolean
  email?: string
  token: string
  operationId: string
  campaignId: string
  kind: 'invoice' | 'refund'
  amountCents: number
  title: string
  items?: PlanItem[]
}
export type FinanceOperation = {
  id: string
  action: FinanceAction
  status: 'pending' | 'completed'
  resultId?: string
}
export type FinanceMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  trace?: { tool: string; summary: string }[]
  actions?: FinanceAction[]
}
export type FinanceVerification = {
  at: number
  findings: string[]
  reporting: string
}
