// Financial values must be exact, nonnegative USD cents, never NaN or rounded
// fractions from an untrusted/malformed API response.
export function usdCents(amount: any): number {
  if (amount?.currency_code !== 'USD' || typeof amount.value !== 'string' ||
      !/^\d+(\.\d{1,2})?$/.test(amount.value)) {
    throw new Error('PayPal amount or currency could not be verified.')
  }
  const [whole, fraction = ''] = amount.value.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result)) throw new Error('Invalid PayPal amount.')
  return result
}

// Extract identifiers only. Never follow URLs supplied by a webhook or API.
export function linkedCapture(data: any): string | undefined {
  for (const link of data.links || []) {
    if (link.rel !== 'up' || typeof link.href !== 'string') continue
    const match = /^https:\/\/api-m\.(?:sandbox\.)?paypal\.com\/v2\/payments\/captures\/([A-Za-z0-9]+)$/.exec(link.href)
    if (match) return match[1]
  }
}

export function invoicePayment(data: any, id: string, expected: number) {
  const statuses = ['DRAFT', 'UNPAID', 'SENT', 'SCHEDULED', 'PARTIALLY_PAID', 'PAYMENT_PENDING',
    'PAID', 'MARKED_AS_PAID', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'MARKED_AS_REFUNDED']
  if (data.id !== id || !statuses.includes(data.status) || !Number.isSafeInteger(expected) ||
      expected <= 0 || usdCents(data.amount) !== expected) {
    throw new Error('Invoice identity or amount differs from the prepared funding request.')
  }
  const paid = data.payments?.paid_amount ? usdCents(data.payments.paid_amount) : 0
  if (paid > expected) throw new Error('Invoice payment exceeds the prepared amount.')
  // PAID notifications can also describe pending or manually recorded payments.
  // Only settled PayPal funding counts toward verified receipts.
  const settled = ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(data.status)
  if (settled && !data.payments?.paid_amount) throw new Error('PayPal invoice payment details are unavailable.')
  const transactions = data.payments?.transactions
  if (settled && Array.isArray(transactions) && transactions.some((t: any) => t.type === 'EXTERNAL')) {
    const online = transactions.filter((t: any) => t.type === 'PAYPAL')
      .reduce((sum: number, t: any) => sum + usdCents(t.amount), 0)
    return Math.min(paid, online)
  }
  return settled ? paid : 0
}

export function refundDetails(data: any, id: string, captureId: string, expected?: number) {
  const amount = usdCents(data.amount)
  if (data.id !== id || !['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED'].includes(data.status) ||
      linkedCapture(data) !== captureId || amount <= 0 || (expected !== undefined && amount !== expected)) {
    throw new Error('Refund identity, capture or amount could not be verified in PayPal.')
  }
  return amount
}
