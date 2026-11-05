import { Conflict, mutate, workspace } from '@/lib/server/workspace'
export const runtime = 'nodejs'
export async function GET() {
  try { return Response.json(await workspace(), { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { console.error(error); return Response.json({ error: 'Database unavailable. Check setup and try again.' }, { status: 503 }) }
}
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (raw.length > 1000000) return Response.json({ error: 'Request too large.' }, { status: 413 })
    const entity = await mutate(JSON.parse(raw))
    return Response.json({ entity, workspace: await workspace() })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: error instanceof Conflict ? 409 : 400 })
  }
}
