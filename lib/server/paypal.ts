import { PayPalAgentToolkit } from '@paypal/agent-toolkit/openai'
import { env } from './common'
export class PayPalError extends Error {
  constructor(message: string, public details: any, public status: number) { super(message) }
}
export async function paypalRest(
  path: string,
  method = 'GET',
  body?: object,
  requestId?: string,
) {
  const credentials = Buffer.from(
    `${env('PAYPAL_CLIENT_ID')}:${env('PAYPAL_CLIENT_SECRET')}`,
  ).toString('base64')
  const auth = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    cache: 'no-store',
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(30000),
  })
  const token = await auth.json()
  if (!auth.ok) throw new Error('PayPal sandbox authentication failed.')
  const response = await fetch(`https://api-m.sandbox.paypal.com${path}`, {
    cache: 'no-store',
    method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(method === 'POST'
        ? { 'PayPal-Request-Id': requestId || crypto.randomUUID() }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  })
  const data = response.status === 204 ? {} : await response.json()
  if (!response.ok) {
    const issue = data.details?.[0]?.issue || data.name || response.status
    throw new PayPalError(
      `PayPal: ${issue}. ${response.status === 403 ? (path.startsWith('/v1/payments/payouts') ? 'Enable Payouts access for your PayPal app.' : 'Enable Vault in your sandbox app and confirm saved-wallet eligibility.') : 'Please retry or review the account setup.'}`,
      data, response.status,
    )
  }
  return data
}
export async function paypal(method: string, args: object, requestId?: string) {
  if (
    ![
      'create_order',
      'get_order',
      'pay_order',
      'create_invoice',
      'send_invoice',
      'get_invoice',
      'generate_invoice_qr_code',
      'create_refund',
      'get_refund',
      'list_transactions',
    ].includes(method)
  )
    throw new Error('PayPal tool is not enabled.')
  const toolkit = new PayPalAgentToolkit({
    clientId: env('PAYPAL_CLIENT_ID'),
    clientSecret: env('PAYPAL_CLIENT_SECRET'),
    configuration: {
      context: { sandbox: true, request_id: requestId },
      actions: {
        orders: { create: true, get: true, capture: true },
        invoices: { create: true, send: true, get: true, generateQRC: true },
        payments: { createRefund: true, getRefunds: true },
        transactions: { list: true },
      },
    },
  })
  const result = await toolkit.handleToolCall({
    id: crypto.randomUUID(),
    type: 'function',
    function: { name: method, arguments: JSON.stringify(args) },
  })
  const data = JSON.parse(String(result.content))
  if (data.error || data.status === 'error')
    throw new Error(
      'PayPal could not complete this request. Check sandbox credentials or retry.',
    )
  return data.response || data
}
