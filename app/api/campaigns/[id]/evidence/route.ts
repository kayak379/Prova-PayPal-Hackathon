import { campaignEvidence } from '@/lib/server/evidence'
import { evidencePage } from '@/lib/server/evidence-view'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const query = new URL(request.url).searchParams
    const page = query.get('page') ?? '1'
    if (query.get('view') === '1' && !/^[1-9]\d{0,8}$/.test(page)) {
      return Response.json({ error: 'Invalid evidence page.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
    const { id } = await params
    const { bundle, verification, campaignVersion } = await campaignEvidence(id)
    const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
    if (query.get('export') === '1') {
      headers['Content-Disposition'] = `attachment; filename="campaign-${id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)}-evidence.json"`
      // Export invalid evidence too, so it can be investigated independently.
      return Response.json({ ...bundle, verification }, { headers })
    }
    if (query.get('view') === '1') {
      return Response.json({ verification, campaignVersion, checkedAt: bundle.exportedAt, ...evidencePage(bundle, Number(page)) }, { headers })
    }
    return Response.json({ verification, campaignVersion, checkedAt: bundle.exportedAt, head: bundle.head }, { headers })
  } catch (error) {
    const missing = error instanceof Error && error.message === 'Campaign not found.'
    if (!missing) console.error('Evidence read failed', error)
    return Response.json({ error: missing ? 'Campaign not found.' : 'Evidence unavailable. Check database setup and try again.' }, {
      status: missing ? 404 : 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
