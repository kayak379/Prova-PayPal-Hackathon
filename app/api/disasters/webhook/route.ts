import { parseDisaster, receiveDisaster, validDisasterToken } from '@/lib/server/disasters'

export const runtime = 'nodejs'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
}

// Local demo files have an opaque origin. POST still requires the bearer secret;
// cookie credentials are neither requested nor exposed by this CORS policy.
export function OPTIONS() { return new Response(null, { status: 204, headers: cors }) }

export async function POST(request: Request) {
  const response = await receive(request)
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value)
  return response
}

async function receive(request: Request) {
  if (!process.env.DISASTER_WEBHOOK_SECRET) return Response.json({ error: 'Disaster webhook is not configured.' }, { status: 503 })
  if (!validDisasterToken(request.headers.get('authorization'))) return Response.json({ error: 'Invalid webhook credentials.' }, { status: 401 })
  if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'Expected application/json.' }, { status: 415 })
  // Bound the stream, including chunked requests that omit Content-Length.
  const reader = request.body?.getReader()
  if (!reader) return Response.json({ error: 'Missing event body.' }, { status: 400 })
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 32768) {
        await reader.cancel()
        return Response.json({ error: 'Event exceeds 32 KiB.' }, { status: 413 })
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  let event
  try { event = parseDisaster(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid event.' }, { status: 400 }) }
  try { return Response.json(await receiveDisaster(event), { status: 202 }) }
  catch (error) {
    console.error('Disaster ingestion failed:', error)
    return Response.json({ error: 'Could not persist event. Retry delivery.' }, { status: 503 })
  }
}
