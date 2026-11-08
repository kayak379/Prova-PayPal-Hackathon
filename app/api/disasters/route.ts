import { listDisasters, retryDisaster } from '@/lib/server/disasters'

export const runtime = 'nodejs'

export async function GET() {
  try { return Response.json({ responses: await listDisasters() }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'Could not load proactive responses.' }, { status: 503 }) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)) throw new Error('Invalid response ID.')
    await retryDisaster(body.id)
    return Response.json({ ok: true })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Retry failed.' }, { status: 400 }) }
}
