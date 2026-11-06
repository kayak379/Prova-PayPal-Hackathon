import type { Campaign, FinanceAction } from '../types'
import { financeTotals } from '../finance'
import { env, external } from './common'
import { retryAI } from './ai-retry'
import {
  prepareFinance,
  orderDetails,
  refreshInvoice,
  refreshRefund,
  reconcile,
} from './finance'
const str = { type: 'string' }
const integer = { type: 'integer' }
const definitions = [
  {
    name: 'order_status',
    description: 'Verify a campaign purchase with PayPal',
    parameters: { type: 'object', properties: { id: str }, required: ['id'] },
  },
  {
    name: 'invoice_status',
    description: 'Check sponsor invoice funding status',
    parameters: { type: 'object', properties: { id: str }, required: ['id'] },
  },
  {
    name: 'refund_status',
    description: 'Verify a campaign refund',
    parameters: { type: 'object', properties: { id: str }, required: ['id'] },
  },
  {
    name: 'reconcile_campaign',
    description: 'Verify campaign financial records and totals',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'prepare_refund',
    description: 'Prepare a refund for user review; does not execute a refund',
    parameters: {
      type: 'object',
      properties: {
        orderId: str,
        amountCents: integer,
        full: { type: 'boolean' },
        reason: str,
      },
      required: ['orderId'],
    },
  },
  {
    name: 'prepare_invoice',
    description:
      'Prepare itemized sponsor funding request for user review; no invoice is created yet. Source is proposal or a campaign order ID.',
    parameters: {
      type: 'object',
      properties: {
        source: str,
        sponsor: str,
        email: str,
        emailInvoice: {
          type: 'boolean',
          description:
            'True only if the user explicitly asks PayPal to email the invoice to this sponsor.',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: str, qty: integer },
            required: ['id', 'qty'],
          },
        },
      },
      required: ['source', 'sponsor', 'items'],
    },
  },
]
export async function financeChat(
  c: Campaign,
  text: string,
  history: { role: string; text: string }[] = [],
) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4000)
    throw new Error('Enter a financial question under 4000 characters.')
  const actions: FinanceAction[] = []
  const trace: { tool: string; summary: string }[] = []
  let patch: Pick<Campaign, 'funding' | 'refunds' | 'verification'> = {}
  let executions = 0
  let gemini = false
  const context = {
    id: c.id,
    name: c.name,
    totals: financeTotals(c),
    orders: c.orders.map((o) => ({
      id: o.id,
      items: o.items,
      totalCents: o.totalCents ?? Math.round(o.total * 100),
    })),
    proposal: c.proposal ? { items: c.proposal.items } : null,
    funding: (c.funding || []).map((f) => ({
      id: f.id,
      sponsor: f.sponsor,
      status: f.status,
      amountCents: f.amountCents,
    })),
    refunds: (c.refunds || []).map((r) => ({
      id: r.id,
      status: r.status,
      amountCents: r.amountCents,
    })),
  }
  const system =
    'You are Prova’s sandbox campaign finance assistant. Use tools to verify financial facts. Only use IDs and items in campaign context. Amounts are integer USD cents. Never invent financial results. Sponsorship does not increase spending budget. Do not enable invoice email unless the user explicitly requests it and provides a recipient email. Only PREPARE invoices/refunds: the user must confirm an action card before any write. Ask for missing sponsor, order or amount. Never claim preparation executed a financial operation. Do not reveal hidden reasoning, tokens or secrets. Context: ' +
    JSON.stringify(context)
  const messages: any[] = [
    { role: 'system', content: system },
    ...history
      .slice(-10)
      .filter((m) => ['user', 'assistant'].includes(m.role))
      .map((m) => ({ role: m.role, content: String(m.text).slice(0, 4000) })),
    { role: 'user', content: text },
  ]
  const contents: any[] = [{ role: 'user', parts: [{ text }] }]
  async function run(name: string, args: any) {
    switch (name) {
      case 'order_status': {
        const r = await orderDetails(c, args.id)
        return {
          orderId: args.id,
          status: r.order.status,
          capturedCents: Math.round(Number(r.capture.amount.value) * 100),
          remainingRefundableCents: r.remaining,
          refunds: r.refunds,
        }
      }
      case 'invoice_status': {
        const funding = await refreshInvoice(c, args.id)
        c = {
          ...c,
          funding: (c.funding || []).map((f) =>
            f.id === funding.id ? funding : f,
          ),
        }
        patch.funding = c.funding
        return {
          id: funding.id,
          status: funding.status,
          receivedCents: funding.receivedCents,
        }
      }
      case 'refund_status': {
        const refund = await refreshRefund(c, args.id)
        c = {
          ...c,
          refunds: (c.refunds || []).map((r) =>
            r.id === refund.id ? refund : r,
          ),
        }
        patch.refunds = c.refunds
        return {
          id: refund.id,
          status: refund.status,
          amountCents: refund.amountCents,
        }
      }
      case 'reconcile_campaign': {
        const r = await reconcile(c)
        patch = { ...patch, ...r }
        c = { ...c, ...r }
        return { ...r.verification, totals: financeTotals(c) }
      }
      case 'prepare_invoice':
      case 'prepare_refund': {
        const action = await prepareFinance(c, {
          ...args,
          kind: name === 'prepare_invoice' ? 'invoice' : 'refund',
        })
        actions.push(action)
        return {
          prepared: true,
          requiresUserConfirmation: true,
          amountCents: action.amountCents,
          title: action.title,
        }
      }
      default:
        throw new Error('Tool not allowed.')
    }
  }
  for (let round = 0; round < 4; round++) {
    let data: any
    if (!gemini)
      try {
        data = await retryAI(
          () =>
            external('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model:
                  process.env.OPENROUTER_MODEL ||
                  'nvidia/nemotron-3.5-super-vl:free',
                messages,
                tools: definitions.map((d) => ({
                  type: 'function',
                  function: d,
                })),
                max_tokens: 4000,
              }),
            }),
          () => {},
        )
      } catch {
        gemini = true
      }
    if (gemini) {
      try {
        data = await retryAI(
          () =>
            external(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-3.5-flash')}:generateContent`,
              {
                method: 'POST',
                headers: {
                  'x-goog-api-key': env('GEMINI_API_KEY'),
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: system }] },
                  contents,
                  tools: [{ functionDeclarations: definitions }],
                  generationConfig: { maxOutputTokens: 4000 },
                }),
              },
            ),
          () => {},
        )
      } catch {
        return {
          text: 'The finance assistant is unavailable. Use the guided Funding, Refund, and Verify controls below; no financial action was executed by the assistant.',
          trace,
          actions,
          patch,
        }
      }
      const parts = data.candidates?.[0]?.content?.parts || []
      const calls = parts.filter((p: any) => p.functionCall)
      if (!calls.length)
        return {
          text:
            parts
              .filter((p: any) => !p.thought && p.text)
              .map((p: any) => p.text)
              .join('') ||
            'No answer returned. Please use the guided controls.',
          trace,
          actions,
          patch,
        }
      contents.push({ role: 'model', parts })
      const responses = []
      for (const p of calls) {
        if (executions >= 8) break
        executions++
        let result: any
        try {
          result = await run(p.functionCall.name, p.functionCall.args || {})
        } catch (e) {
          result = { error: e instanceof Error ? e.message : 'Tool failed' }
        }
        trace.push({
          tool: p.functionCall.name,
          summary:
            result.error ||
            (result.prepared
              ? 'Action prepared; confirmation required'
              : JSON.stringify(result).slice(0, 600)),
        })
        responses.push({
          functionResponse: { name: p.functionCall.name, response: result },
        })
      }
      contents.push({ role: 'user', parts: responses })
    } else {
      const message = data.choices?.[0]?.message
      if (!message?.tool_calls?.length)
        return {
          text: message?.content || 'No answer returned.',
          trace,
          actions,
          patch,
        }
      messages.push(message)
      for (const call of message.tool_calls) {
        if (executions >= 8) break
        executions++
        let result: any
        try {
          result = await run(
            call.function.name,
            JSON.parse(call.function.arguments),
          )
        } catch (e) {
          result = { error: e instanceof Error ? e.message : 'Tool failed' }
        }
        trace.push({
          tool: call.function.name,
          summary:
            result.error ||
            (result.prepared
              ? 'Action prepared; confirmation required'
              : JSON.stringify(result).slice(0, 600)),
        })
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        })
        contents.push({
          role: 'user',
          parts: [
            {
              text:
                'Previously completed tool ' +
                call.function.name +
                ': ' +
                JSON.stringify(result),
            },
          ],
        })
      }
    }
    if (executions >= 8) break
  }
  return {
    text: 'Reached the assistant tool limit. Completed checks and prepared actions are shown below; use the guided controls to continue.',
    trace,
    actions,
    patch,
  }
}
