import { InvalidWebhook, receiveWebhook } from '@/lib/server/paypal-webhooks'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  let event: unknown
  try {
    // Bound the streamed body as well as Content-Length (which may be absent).
    const reader = request.body?.getReader()
    if (!reader) return Response.json({ error: 'Missing webhook body.' }, { status: 400 })
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024 * 1024) {
        await reader.cancel()
        return Response.json({ error: 'Webhook body too large.' }, { status: 413 })
      }
      chunks.push(value)
    }
    event = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return Response.json({ error: 'Invalid webhook body.' }, { status: 400 })
  }
  try {
    return Response.json(await receiveWebhook(request.headers, event))
  } catch (error) {
    if (error instanceof InvalidWebhook)
      return Response.json({ error: error.message }, { status: 400 })
    console.error('PayPal webhook verification or processing unavailable:', error instanceof Error ? error.message : 'error')
    return Response.json({ error: 'PayPal verification unavailable; retry delivery.' }, { status: 503 })
  }
}
