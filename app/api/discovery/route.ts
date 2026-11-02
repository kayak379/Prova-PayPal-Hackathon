import { discover } from '@/lib/server/discovery'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request) {
 const body = await request.json()
 const encoder = new TextEncoder()
 const stream = new ReadableStream({ async start(controller) {
  const send = (data: unknown) => controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
  try { const plan = await discover(body, (stage, detail) => send({ stage, detail })); send({ plan }) } catch (error) { send({ error: message(error) }) } finally { controller.close() }
 } })
 return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}
